#!/usr/bin/env node
// Legt Kurztexte (ca. 200-450 Zeichen) fuer Titelseiten ohne Redaktionstext an
// (seo_content, bereich 'titel'). Deterministisch aus Katalogfeldern (Jahr, Genres,
// Regie/Entwickler, Besetzung, Laufzeit, Staffeln, Land, Sprache), kein API-Aufruf.
// Legt nur FEHLENDE Eintraege an (DO NOTHING). Kurztexte sind kuerzer als 1200
// Zeichen und gelten in seo-pakete/seo-batch weiter als offen; seo-einspielen
// ersetzt sie spaeter durch den Langtext.
//
// Aufruf (Backend-Container): node scripts/seo-titel-kurztexte.mjs [--dry-run] [--zeige 5] [--max N]
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';

const LOCALE = 'de-de';
const MIN = 200;
const land = new Intl.DisplayNames(['de'], { type: 'region' });
const sprache = new Intl.DisplayNames(['de'], { type: 'language' });

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}
const wahl = (k, v) => v[hash(k) % v.length];

export function aufz(l) {
  if (l.length <= 1) return l.join('');
  return `${l.slice(0, -1).join(', ')} und ${l[l.length - 1]}`;
}

function laender(codes) {
  const out = [];
  for (const c of codes || []) {
    try { const n = land.of(c); if (n && n !== c) out.push(n); } catch { /* ungueltiger Code */ }
  }
  return out.slice(0, 2);
}

// Gibt null zurueck, wenn die Felder fuer MIN Zeichen nicht reichen.
export function bauTitelKurztext(t) {
  const serie = t.type === 'series';
  const k = `${t.type}:${t.tmdb_id}`;
  const genres = (t.genres || []).slice(0, 3);
  const nenner = serie ? 'Serie' : 'Film';
  const s = [];
  const woher = laender(t.origin_country);
  let satz1 = `„${t.title}“ ist ${serie ? 'eine' : 'ein'} ${nenner}`;
  if (t.year) satz1 += ` aus dem Jahr ${t.year}`;
  if (woher.length) satz1 += ` (Produktionsland: ${aufz(woher)})`;
  s.push(satz1 + '.');
  if (genres.length) {
    const g = genres.length === 1 ? `dem Genre ${genres[0]}` : `den Genres ${aufz(genres)}`;
    s.push(wahl(k, [`${serie ? 'Sie' : 'Er'} ist im Katalog ${g} zugeordnet.`, `Der Katalog führt ${serie ? 'sie' : 'ihn'} unter ${g}.`]));
  }
  if (t.director) {
    s.push(serie ? `Entwickelt wurde die Serie von ${t.director}.` : `Regie führte ${t.director}.`);
  }
  const cast = (t.cast_names || []).slice(0, 4);
  if (cast.length >= 2) {
    s.push(wahl(k + 'c', [`Zur Besetzung zählen ${aufz(cast)}.`, `Mit dabei sind ${aufz(cast)}.`]));
  }
  if (serie && t.seasons) {
    s.push(`Die Serie umfasst ${t.seasons} ${t.seasons === 1 ? 'Staffel' : 'Staffeln'}${t.runtime ? ` mit einer Laufzeit von etwa ${t.runtime} Minuten je Folge` : ''}.`);
  } else if (t.runtime) {
    s.push(`Die Laufzeit beträgt ${t.runtime} ${t.runtime === 1 ? 'Minute' : 'Minuten'}.`);
  }
  if (t.original_language && t.original_language !== 'de') {
    let n = null;
    try { n = sprache.of(t.original_language); } catch { /* unbekannt */ }
    if (n && n !== t.original_language) s.push(`Die Originalsprache ist ${n}.`);
  }
  if (t.original_title && t.original_title !== t.title) s.push(`Der Originaltitel lautet „${t.original_title}“.`);
  if (t.rating && (t.vote_count || 0) >= 100) {
    s.push(`Das Publikum bewertet ${serie ? 'sie' : 'ihn'} bei TMDB im Schnitt mit ${Number(t.rating).toFixed(1).replace('.', ',')} von 10.`);
  }
  s.push(`Auf MovieTaste lässt sich ${serie ? 'die Serie' : 'der Film'} zur Watchlist hinzufügen und mit dem eigenen Geschmack abgleichen.`);
  const text = s.join(' ');
  return text.length >= MIN ? text : null;
}

async function main() {
  const a = process.argv.slice(2);
  const dryRun = a.includes('--dry-run');
  const zi = a.indexOf('--zeige');
  const zeige = zi >= 0 ? Number(a[zi + 1]) || 3 : 0;
  const mi = a.indexOf('--max');
  const max = mi >= 0 ? Number(a[mi + 1]) : Infinity;
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (t.type, t.tmdb_id) t.type, t.tmdb_id, t.title, t.original_title, t.year, t.genres,
            t.director, t.cast_names, t.rating, t.vote_count, t.origin_country, t.original_language,
            t.runtime, t.seasons
       FROM titles t
      WHERE t.tmdb_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM seo_content s WHERE s.bereich = 'titel'
                          AND s.schluessel = t.type || ':' || t.tmdb_id AND s.locale = $1)
      ORDER BY t.type, t.tmdb_id, t.vote_count DESC NULLS LAST`, [LOCALE]);
  let neu = 0, zuKurz = 0, gezeigt = 0;
  for (const t of rows) {
    if (neu >= max) break;
    const text = bauTitelKurztext(t);
    if (!text) { zuKurz++; continue; }
    if (gezeigt < zeige) { gezeigt++; console.log(`\n${t.type}:${t.tmdb_id} (${text.length} Zeichen):\n${text}`); }
    if (!dryRun) {
      const r = await pool.query(
        `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('titel', $1, $2, $3)
         ON CONFLICT (bereich, schluessel, locale) DO NOTHING`, [`${t.type}:${t.tmdb_id}`, LOCALE, text]);
      if (r.rowCount === 1) neu++;
    } else neu++;
  }
  console.log(`Kandidaten ${rows.length}, ${dryRun ? 'Probelauf neu' : 'neu'} ${neu}, zu wenig Fakten (<${MIN} Zeichen) ${zuKurz}`);
  await pool.end();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
