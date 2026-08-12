/*
 * backfill-english.mjs -- englische Titel/Inhaltsangaben und Altersfreigaben
 * je Land fuer den BESTAND nachtragen (Weg A aus PLAN-INTERNATIONALISIERUNG.md).
 *
 * Neue Titel bekommen diese Felder laengst ueber die taeglichen/woechentlichen
 * Fetch-Laeufe (stream-fetch.mjs, cinema-fetch.mjs, discover-rated-titles.mjs)
 * mitgeliefert. Dieses Skript holt sie einmalig fuer alles nach, was schon in
 * `titles` steht -- rund 27.000 Zeilen, also rund 27.000 TMDB-Abrufe. Mit der
 * eingebauten Pause dauert der volle Lauf mehrere Stunden; er ist jederzeit
 * abbrechbar und setzt beim naechsten Start dort fort, wo noch Felder fehlen
 * (es werden nur Zeilen ohne title_en/overview_en angefragt).
 *
 * Die TMDB-Kennung kommt aus titles.tmdb_id oder -- fuer die 600 kuratierten
 * Katalog-Titel -- aus title_tmdb_resolution. Titel ganz ohne Kennung werden
 * uebersprungen und am Ende gezaehlt.
 *
 * Aufruf im Backend-Verzeichnis:
 *   TMDB_API_KEY=xxxx node scripts/backfill-english.mjs
 *   TMDB_API_KEY=xxxx node scripts/backfill-english.mjs --limit=500   # Probelauf
 */
import 'dotenv/config';
import { pool } from '../db/pool.js';

const API = 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY;
const CERT_REGIONS = (process.env.TMDB_CERT_REGIONS || 'DE,AT')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const LIMIT_ARG = (process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1];
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : null;

if (!KEY) { console.error('FEHLER: TMDB_API_KEY ist nicht gesetzt.'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(path, params = {}) {
  const u = new URL(API + path);
  u.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(u);
    if (res.status === 429) { await sleep(2000 + attempt * 1000); continue; }
    if (res.status === 404) return null;   // Titel bei TMDB entfernt -- kein Fehler
    if (!res.ok) throw new Error(`TMDB ${res.status} für ${path}`);
    return res.json();
  }
  throw new Error('TMDB Rate-Limit für ' + path);
}

function englischAus(detail, kind) {
  const alle = ((detail.translations || {}).translations || [])
    .filter((t) => t.iso_639_1 === 'en' && t.data);
  const beste = alle.find((t) => t.iso_3166_1 === 'US' && (t.data.overview || t.data.title || t.data.name))
    || alle.find((t) => t.data.overview || t.data.title || t.data.name);
  if (!beste) return { titel: '', ov: '' };
  return {
    titel: ((kind === 'movie' ? beste.data.title : beste.data.name) || '').trim(),
    ov: (beste.data.overview || '').trim(),
  };
}

function zertifikate(detail, kind) {
  const certs = {};
  for (const region of CERT_REGIONS) {
    if (kind === 'movie') {
      const eintrag = ((detail.release_dates || {}).results || []).find((r) => r.iso_3166_1 === region);
      const wert = eintrag && (eintrag.release_dates || []).map((r) => r.certification).find((c) => c);
      if (wert) certs[region] = wert;
    } else {
      const eintrag = ((detail.content_ratings || {}).results || []).find((r) => r.iso_3166_1 === region);
      if (eintrag && eintrag.rating) certs[region] = eintrag.rating;
    }
  }
  return certs;
}

async function main() {
  // Nur Zeilen, denen noch etwas fehlt -- so ist das Skript nach Abbruch
  // fortsetzbar und laesst sich spaeter erneut laufen lassen, ohne alles
  // nochmal anzufragen. Die Freigaben werden dabei einfach mitgenommen.
  const { rows } = await pool.query(
    `SELECT t.id, t.type, COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id
       FROM titles t
       LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
      WHERE (t.title_en IS NULL OR t.overview_en IS NULL)
      ORDER BY t.id
      ${LIMIT ? `LIMIT ${LIMIT}` : ''}`
  );
  console.log(`${rows.length} Titel zu bearbeiten (Freigabe-Laender: ${CERT_REGIONS.join(', ')}).`);

  let ohneKennung = 0, geschrieben = 0, leer = 0, done = 0;
  for (const row of rows) {
    done++;
    if (!row.tmdb_id) { ohneKennung++; continue; }
    const kind = row.type === 'series' ? 'tv' : 'movie';
    let d;
    try {
      d = await tmdb(`/${kind}/${row.tmdb_id}`, {
        append_to_response: kind === 'movie' ? 'translations,release_dates' : 'translations,content_ratings',
      });
    } catch (err) {
      console.error(`  Fehler bei titles.id=${row.id} (tmdb ${row.tmdb_id}): ${err.message}`);
      await sleep(1000);
      continue;
    }
    if (!d) { leer++; continue; }
    const en = englischAus(d, kind);
    const tEn = en.titel || ((d.original_language === 'en' && (kind === 'movie' ? d.original_title : d.original_name)) || '');
    const certs = zertifikate(d, kind);
    // Leerstrings statt NULL fuer "gesucht, nichts gefunden": sonst fragte
    // jeder weitere Lauf dieselben Titel erneut erfolglos an.
    await pool.query(
      `UPDATE titles SET
         title_en    = COALESCE(NULLIF($1, ''), title_en, ''),
         overview_en = COALESCE(NULLIF($2, ''), overview_en, ''),
         certifications = certifications || $3
       WHERE id = $4`,
      [tEn, en.ov, certs, row.id]
    );
    if (tEn || en.ov) geschrieben++; else leer++;
    if (done % 200 === 0) console.log(`  ... ${done}/${rows.length} (${geschrieben} mit englischer Fassung)`);
    await sleep(120);
  }

  console.log(`\nFertig: ${geschrieben} mit englischer Fassung, ${leer} ohne Uebersetzung bei TMDB, ${ohneKennung} ohne TMDB-Kennung uebersprungen.`);
}

main()
  .catch((err) => { console.error('Backfill fehlgeschlagen:', err); process.exitCode = 1; })
  .finally(() => pool.end());
