/*
 * titel-lokalisieren.mjs -- lokalisierte Titel fuer Titel ohne offizielle
 * TMDB-Uebersetzung (title_en = ''). Alle Schritte idempotent, ueberschreiben
 * nie einen vorhandenen Wert; --trocken fuehrt alles in einer Transaktion aus
 * und rollt zurueck.
 *
 *   holen             Originaltitel/-sprache per TMDB (kostenlos) nachtragen,
 *                     nur wo original_title leer ist. Braucht TMDB_API_KEY.
 *   regeln            title_en = lateinischer Originaltitel, wo title_en leer.
 *   export <datei>    Rest (Original nicht lateinisch/fehlt) als JSON fuer
 *                     Vorschlaege (Subagenten, Abo).
 *   einspielen <datei> Vorschlaege [{id,en,fr,es,it,nl,pt}] nur in leere Felder.
 *
 * Aufruf im Backend-Verzeichnis: node scripts/titel-lokalisieren.mjs regeln --trocken
 */
import 'dotenv/config';
import fs from 'node:fs';
import { pool } from '../db/pool.js';
import { englischAusOriginal, vorschlagFehler, ZIEL_SPRACHEN } from '../lib/titelLokal.js';

const [modus, datei] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TROCKEN = process.argv.includes('--trocken');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1]) || null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OHNE_EN = `(t.title_en IS NULL OR t.title_en = '')`;

async function mitTransaktion(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query(TROCKEN ? 'ROLLBACK' : 'COMMIT');
    if (TROCKEN) console.log('(trocken: zurueckgerollt)');
    return r;
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

async function holen() {
  const KEY = process.env.TMDB_API_KEY;
  if (!KEY) throw new Error('TMDB_API_KEY fehlt');
  const { rows } = await pool.query(
    `SELECT t.id, t.type, COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id
       FROM titles t LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
      WHERE ${OHNE_EN} AND (t.original_title IS NULL OR t.original_title = '')
        AND COALESCE(t.tmdb_id, r.tmdb_id) IS NOT NULL ORDER BY t.id ${LIMIT ? `LIMIT ${LIMIT}` : ''}`
  );
  console.log(`${rows.length} Titel ohne Originaltitel.`);
  let ok = 0, fehlt = 0;
  for (const [i, z] of rows.entries()) {
    const art = z.type === 'series' ? 'tv' : 'movie';
    let d = null;
    for (let v = 0; v < 4; v++) {
      const res = await fetch(`https://api.themoviedb.org/3/${art}/${z.tmdb_id}?api_key=${KEY}&language=en-US`);
      if (res.status === 429) { await sleep(2000 + v * 1000); continue; }
      if (res.ok) d = await res.json();
      break;
    }
    const orig = d && (art === 'movie' ? d.original_title : d.original_name);
    if (orig) {
      if (!TROCKEN) await pool.query(
        `UPDATE titles SET original_title = $1, original_language = COALESCE(original_language, $2)
          WHERE id = $3 AND (original_title IS NULL OR original_title = '')`,
        [orig, d.original_language || null, z.id]);
      ok++;
    } else fehlt++;
    if ((i + 1) % 200 === 0) console.log(`  ... ${i + 1}/${rows.length}`);
    await sleep(120);
  }
  console.log(`Fertig: ${ok} Originaltitel${TROCKEN ? ' (trocken, nicht gespeichert)' : ''}, ${fehlt} ohne Antwort.`);
}

async function regeln() {
  const { rows } = await pool.query(
    `SELECT id, title_en, original_title FROM titles t WHERE ${OHNE_EN} AND original_title <> ''`);
  await mitTransaktion(async (c) => {
    let n = 0;
    for (const z of rows) {
      const en = englischAusOriginal(z);
      if (!en) continue;
      const r = await c.query(`UPDATE titles SET title_en = $1 WHERE id = $2 AND (title_en IS NULL OR title_en = '')`, [en, z.id]);
      n += r.rowCount;
    }
    console.log(`${n} title_en aus lateinischem Originaltitel gesetzt.`);
  });
}

async function exportieren() {
  const { rows } = await pool.query(
    `SELECT t.id, t.type, t.year, t.title, t.original_title, t.original_language, t.vote_count
       FROM titles t WHERE ${OHNE_EN} ORDER BY t.vote_count DESC NULLS LAST`);
  fs.writeFileSync(datei, JSON.stringify(rows, null, 1));
  console.log(`${rows.length} Titel nach ${datei}.`);
}

async function einspielen() {
  const liste = JSON.parse(fs.readFileSync(datei, 'utf8'));
  await mitTransaktion(async (c) => {
    const z = { en: 0, ...Object.fromEntries(ZIEL_SPRACHEN.map((s) => [s, 0])), abgelehnt: 0 };
    for (const v of liste) {
      for (const [feld, wert] of Object.entries(v)) {
        if (feld === 'id' || wert == null) continue;
        if (feld !== 'en' && !ZIEL_SPRACHEN.includes(feld)) continue;
        if (vorschlagFehler(wert)) { z.abgelehnt++; continue; }
        const t = wert.trim();
        const r = feld === 'en'
          ? await c.query(`UPDATE titles SET title_en = $1 WHERE id = $2 AND (title_en IS NULL OR title_en = '')`, [t, v.id])
          : await c.query(
              `UPDATE titles SET uebersetzungen = jsonb_set(COALESCE(uebersetzungen, '{}'::jsonb), ARRAY[$1::text],
                 COALESCE(uebersetzungen -> $1::text, '{}'::jsonb) || jsonb_build_object('t', $2::text))
               WHERE id = $3 AND COALESCE(uebersetzungen -> $1::text ->> 't', '') = ''`, [feld, t, v.id]);
        z[feld] += r.rowCount;
      }
    }
    console.log('Eingespielt:', JSON.stringify(z));
  });
}

const modi = { holen, regeln, export: exportieren, einspielen };
if (!modi[modus]) { console.error('Modus: holen | regeln | export <datei> | einspielen <datei> [--trocken]'); process.exit(1); }
await modi[modus]();
await pool.end();
