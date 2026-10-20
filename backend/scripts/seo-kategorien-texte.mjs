#!/usr/bin/env node
// Legt Redaktionstexte fuer Genre-, Anbieter- und Kino-Stadt-Seiten an
// (seo_content, bereich 'genre' | 'anbieter' | 'kino_stadt'). Deterministisch
// aus DB-Fakten (Katalogzahlen, Jahre, Begleitgenres, Bewertung, Kino-Adressen),
// kein API-Aufruf, keine Kosten. Legt nur FEHLENDE Eintraege an; vorhandene
// Handtexte bleiben unangetastet (ON CONFLICT DO NOTHING).
//
// Zahlen werden gerundet ("ueber 400"), damit der Text nicht taeglich veraltet.
// Die Satzbauten wechseln nach einem Hash des Schluessels, damit benachbarte
// Seiten nicht wortgleich beginnen.
//
// Aufruf (im Backend-Container):
//   node scripts/seo-kategorien-texte.mjs [--dry-run] [--bereich genre|anbieter|kino_stadt] [--zeige 3]
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';
import {
  ladeGenreSeite, ladeAnbieterSeite, ladeKinoStadt,
  genresFuerSitemap, anbieterFuerSitemap, staedteFuerSitemap,
} from '../lib/seoData.js';

const LOCALE = 'de-de';

export function zahl(n) { return Number(n).toLocaleString('de-DE'); }

// Rundet nach unten auf eine glatte Stufe: 8128 -> "über 8.000", 12 -> "12".
export function ueber(n) {
  if (n < 20) return String(n);
  const schritt = n >= 1000 ? 500 : n >= 100 ? 50 : 10;
  return `über ${zahl(Math.floor(n / schritt) * schritt)}`;
}

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}
const wahl = (schluessel, varianten) => varianten[hash(schluessel) % varianten.length];

export function aufzaehlung(liste) {
  if (liste.length <= 1) return liste.join('');
  return `${liste.slice(0, -1).join(', ')} und ${liste[liste.length - 1]}`;
}
const namen = (titel, n) => aufzaehlung(titel.slice(0, n).map((t) => `„${t.title}“`));
const ucfirst = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const komma = (x) => Number(x).toFixed(1).replace('.', ',');

// ---- Genre ---------------------------------------------------------------
async function genreFakten(type, genre) {
  const [{ rows: jahre }, { rows: begleit }, { rows: schnitt }] = await Promise.all([
    pool.query(
      `SELECT (year/10*10) AS jz, count(*)::int AS n, min(year) AS von, max(year) AS bis
         FROM titles WHERE type = $1 AND genres @> ARRAY[$2::text] AND year IS NOT NULL AND tmdb_id IS NOT NULL
        GROUP BY 1 ORDER BY n DESC`, [type, genre]),
    pool.query(
      `SELECT g, count(*)::int AS n FROM titles, unnest(genres) g
        WHERE type = $1 AND genres @> ARRAY[$2::text] AND g <> $2 AND tmdb_id IS NOT NULL
        GROUP BY g ORDER BY n DESC, g LIMIT 3`, [type, genre]),
    pool.query(
      `SELECT round(avg(rating)::numeric, 1) AS r, count(*)::int AS n FROM titles
        WHERE type = $1 AND genres @> ARRAY[$2::text] AND rating > 0 AND coalesce(vote_count, 0) >= 100 AND tmdb_id IS NOT NULL`, [type, genre]),
  ]);
  return {
    hauptJz: jahre[0] ? jahre[0].jz : null,
    von: jahre.length ? Math.min(...jahre.map((j) => j.von)) : null,
    bis: jahre.length ? Math.max(...jahre.map((j) => j.bis)) : null,
    begleit: begleit.map((b) => b.g),
    schnitt: schnitt[0] && schnitt[0].n >= 20 ? Number(schnitt[0].r) : null,
  };
}

export function bauGenreText(d, f) {
  const serie = d.type === 'series';
  const w = serie ? 'Serien' : 'Filme';
  const g = d.genre;
  const k = `${d.genreSlug}:${d.type}`;
  const s = [];
  s.push(wahl(k, [
    `Im MovieMatch-Katalog stehen ${ueber(d.gesamt)} ${w} aus dem Genre ${g}.`,
    `${g} ist im MovieMatch-Katalog mit ${ueber(d.gesamt)} ${serie ? 'Serien' : 'Filmen'} vertreten.`,
    `${ucfirst(ueber(d.gesamt))} ${w} mit dem Genre ${g} führt der MovieMatch-Katalog.`,
  ]));
  if (f.von && f.bis && f.hauptJz) {
    s.push(wahl(k + 'j', [
      `Sie stammen aus den Jahren ${f.von} bis ${f.bis}, die meisten aus den ${f.hauptJz}er-Jahren.`,
      `Der Katalog reicht in diesem Genre von ${f.von} bis ${f.bis}; die größte Gruppe stammt aus den ${f.hauptJz}er-Jahren.`,
    ]));
  }
  if (f.begleit.length >= 2) {
    s.push(wahl(k + 'b', [
      `Häufig steht ${g} zusammen mit ${aufzaehlung(f.begleit)}.`,
      `Am öftesten wird das Genre mit ${aufzaehlung(f.begleit)} kombiniert.`,
    ]));
  }
  if (f.schnitt) {
    s.push(`Die TMDB-Bewertung liegt bei Titeln mit mindestens 100 Stimmen im Schnitt bei ${komma(f.schnitt)} von 10.`);
  }
  if (d.titel.length >= 2) {
    s.push(`An der Spitze der Liste stehen derzeit ${namen(d.titel, 3)}.`);
  }
  s.push('Sortiert wird nach der Bewertung, wobei Titel mit wenigen Stimmen nicht ganz nach oben rutschen.');
  return s.join(' ');
}

// ---- Anbieter ------------------------------------------------------------
async function anbieterFakten(slug, region) {
  const [{ rows: genres }, { rows: jahre }] = await Promise.all([
    pool.query(
      `SELECT g, count(*)::int AS n FROM streaming_cache, unnest(genres) g
        WHERE provider_id = $1 AND region = $2 GROUP BY g ORDER BY n DESC, g LIMIT 3`, [slug, region]),
    pool.query(
      `SELECT min(year) AS von, max(year) AS bis FROM streaming_cache WHERE provider_id = $1 AND region = $2 AND year IS NOT NULL`, [slug, region]),
  ]);
  return { genres: genres.map((x) => x.g), von: jahre[0].von, bis: jahre[0].bis };
}

export function bauAnbieterText(d, f) {
  const nF = d.filme.length;
  const nS = d.serien.length;
  const k = d.anbieterSlug;
  const s = [];
  const teile = [];
  if (nF) teile.push(`${ueber(nF)} ${nF === 1 ? 'Film' : 'Filmen'}`);
  if (nS) teile.push(`${ueber(nS)} ${nS === 1 ? 'Serie' : 'Serien'}`);
  const teileAkk = [];
  if (nF) teileAkk.push(`${ueber(nF)} ${nF === 1 ? 'Film' : 'Filme'}`);
  if (nS) teileAkk.push(`${ueber(nS)} ${nS === 1 ? 'Serie' : 'Serien'}`);
  s.push(wahl(k, [
    `Im aktuellen Streaming-Angebot von ${d.name} in Deutschland führt MovieMatch ${aufzaehlung(teileAkk)}.`,
    `${d.name} ist bei MovieMatch mit ${aufzaehlung(teile)} im deutschen Streaming-Angebot vertreten.`,
  ]));
  if (f.von && f.bis) {
    s.push(`Die Titel stammen aus den Jahren ${f.von} bis ${f.bis}.`);
  }
  if (f.genres.length >= 2) {
    s.push(wahl(k + 'g', [
      `Am häufigsten vertreten sind die Genres ${aufzaehlung(f.genres)}.`,
      `Den größten Anteil haben Titel aus den Genres ${aufzaehlung(f.genres)}.`,
    ]));
  }
  const spitze = [];
  if (d.filme.length >= 2) spitze.push(`bei den Filmen ${namen(d.filme, 2)}`);
  if (d.serien.length >= 2) spitze.push(`bei den Serien ${namen(d.serien, 2)}`);
  if (spitze.length) s.push(`An der Spitze der Bewertung stehen derzeit ${spitze.join(', ')}.`);
  s.push('Das Angebot ändert sich laufend; die Liste folgt ihm.');
  return s.join(' ');
}

// ---- Kino-Stadt ----------------------------------------------------------
// Hinter einem Ortsnamen koennen Kinos aus mehreren Laendern stehen (Hamburg
// in Deutschland und in den USA). Genannt werden deshalb nur Kinos aus der
// haeufigsten Postleitzahl-Gruppe (erste Ziffer) der Stadt.
export function bauStadtText(d) {
  const kinos = d.kinos;
  const n = kinos.length;
  const mitWeb = kinos.filter((x) => x.website).length;
  const ziffern = {};
  for (const x of kinos) if (x.plz) ziffern[x.plz[0]] = (ziffern[x.plz[0]] || 0) + 1;
  const haupt = Object.entries(ziffern).sort((a, b) => b[1] - a[1])[0];
  let kandidaten = kinos.filter((x) => x.website && x.strasse && (!haupt || (x.plz && x.plz[0] === haupt[0])));
  if (kandidaten.length < 3) kandidaten = kinos.filter((x) => x.website && x.strasse);
  const nennen = [...new Set(kandidaten.map((x) => x.name))].slice(0, 3);
  const k = d.stadtSlug;
  const s = [];
  s.push(wahl(k, [
    `In ${d.ort} führt MovieMatch ${n} Kinos`,
    `Für ${d.ort} sind bei MovieMatch ${n} Kinos gelistet`,
  ]) + (mitWeb ? `, ${mitWeb === n ? 'alle' : mitWeb} davon mit Website.` : '.'));
  if (nennen.length >= 2) s.push(`Dazu zählen ${aufzaehlung(nennen)}.`);
  // Ohne Websites bleibt der Text kurz: dann die Kinos mit Strasse nennen (echte Daten, kein Fuellstoff).
  if (s.join(' ').length < 170) {
    const mitAdresse = [...new Map(kinos.filter((x) => x.strasse).map((x) => [x.name, `${x.name} (${x.strasse})`])).values()].slice(0, 3);
    if (mitAdresse.length) s.push(`Gelistet sind unter anderem ${aufzaehlung(mitAdresse)}.`);
  }
  s.push('Adresse und Website stammen aus OpenStreetMap und stehen weiter unten bei jedem Kino.');
  return s.join(' ');
}

// ---- Lauf ----------------------------------------------------------------
async function schreiben(bereich, schluessel, text, dryRun, ersetzen = false) {
  if (dryRun) return true;
  const r = await pool.query(
    `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ($1, $2, $3, $4)
     ON CONFLICT (bereich, schluessel, locale) DO ${ersetzen ? 'UPDATE SET text = EXCLUDED.text' : 'NOTHING'}`,
    [bereich, schluessel, LOCALE, text]);
  return r.rowCount === 1;
}

async function main() {
  const a = process.argv.slice(2);
  const dryRun = a.includes('--dry-run');
  const bi = a.indexOf('--bereich');
  const nur = bi >= 0 ? a[bi + 1] : null;
  const zi = a.indexOf('--zeige');
  const zeige = zi >= 0 ? Number(a[zi + 1]) || 3 : 0;
  const region = 'DE';
  const z = { genre: [0, 0], anbieter: [0, 0], kino_stadt: [0, 0] }; // [neu, vorhanden/uebersprungen]
  let gezeigt = 0;
  const zeigen = (bereich, schluessel, text) => {
    if (zeige && gezeigt < zeige) { gezeigt++; console.log(`\n${bereich} ${schluessel} (${text.length} Zeichen):\n${text}`); }
  };

  if (!nur || nur === 'genre') {
    for (const { type, slug } of await genresFuerSitemap()) {
      const d = await ladeGenreSeite(type === 'series' ? 'serien' : 'filme', slug, 1, LOCALE);
      if (!d) { z.genre[1]++; continue; }
      if (d.text) { z.genre[1]++; continue; }
      const text = bauGenreText(d, await genreFakten(type, d.genre));
      zeigen('genre', `${slug}:${type}`, text);
      (await schreiben('genre', `${slug}:${type}`, text, dryRun)) ? z.genre[0]++ : z.genre[1]++;
    }
  }
  if (!nur || nur === 'anbieter') {
    for (const slug of await anbieterFuerSitemap(LOCALE)) {
      const d = await ladeAnbieterSeite(slug, LOCALE);
      if (!d || d.text) { z.anbieter[1]++; continue; }
      const text = bauAnbieterText(d, await anbieterFakten(slug, region));
      zeigen('anbieter', slug, text);
      (await schreiben('anbieter', slug, text, dryRun)) ? z.anbieter[0]++ : z.anbieter[1]++;
    }
  }
  if (!nur || nur === 'kino_stadt') {
    for (const slug of await staedteFuerSitemap()) {
      const d = await ladeKinoStadt(slug, LOCALE);
      // --kurze-ersetzen: vorhandene Generator-Texte unter 200 Zeichen neu bauen (laengere = Handarbeit, bleiben).
      const ersetzen = !!d && !!d.text && a.includes('--kurze-ersetzen') && d.text.length < 200;
      if (!d || (d.text && !ersetzen) || d.kinos.length < 3) { z.kino_stadt[1]++; continue; }
      const text = bauStadtText(d);
      if (ersetzen && text.length <= d.text.length) { z.kino_stadt[1]++; continue; }
      zeigen('kino_stadt', slug, text);
      (await schreiben('kino_stadt', slug, text, dryRun, ersetzen)) ? z.kino_stadt[0]++ : z.kino_stadt[1]++;
    }
  }
  for (const [b, [neu, rest]] of Object.entries(z)) {
    if (!nur || nur === b) console.log(`${b}: neu ${neu}${dryRun ? ' (Probelauf)' : ''}, schon mit Text/uebersprungen ${rest}`);
  }
  await pool.end();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
