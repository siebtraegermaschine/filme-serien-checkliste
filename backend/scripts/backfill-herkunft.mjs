#!/usr/bin/env node
/*
 * backfill-herkunft.mjs -- traegt Herkunftsland, Originalsprache, Laufzeit
 * (Filme) und Staffelzahl (Serien) aus TMDB nach.
 *
 * Idempotent und wiederaufnehmbar: angefasst werden nur Zeilen mit
 * original_language IS NULL. Je (Typ, TMDB-ID) ein Abruf, auch wenn Katalog-
 * und Discovery-Zeile denselben Titel meinen. Wenige parallele Abrufe mit
 * Pause, 429 wird mit Retry-After abgewartet.
 *
 * Aufruf (auf dem Server; lang -> abkoppeln, siehe CLAUDE.md):
 *   docker compose -f docker-compose.yml --profile prod exec -T backend \
 *     node scripts/backfill-herkunft.mjs [--dry-run] [--limit=200]
 */
import 'dotenv/config';
import { pool } from '../db/pool.js';
import { merkmaleAusDetail } from '../lib/tmdbMerkmale.js';

const API = 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY;
const DRY = process.argv.includes('--dry-run');
const LIMIT = Number((process.argv.find((a) => a.startsWith('--limit=')) || '').slice(8)) || Infinity;
const PARALLEL = 3;
const PAUSE_MS = 100;

if (!KEY) { console.error('FEHLER: TMDB_API_KEY ist nicht gesetzt.'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TMDB_KIND = { movie: 'movie', series: 'tv' };

async function tmdb(pfad) {
  const url = new URL(API + pfad);
  url.searchParams.set('api_key', KEY);
  for (let versuch = 0; versuch < 5; versuch++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.status === 429) {
      await sleep((Number(res.headers.get('retry-after')) || 2 + versuch) * 1000);
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TMDB ${res.status} fuer ${pfad}`);
    return res.json();
  }
  throw new Error('TMDB Rate-Limit fuer ' + pfad);
}

async function main() {
  const { rows } = await pool.query(
    `SELECT t.type, COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id, array_agg(t.id) AS ids
       FROM titles t LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
      WHERE t.original_language IS NULL AND COALESCE(t.tmdb_id, r.tmdb_id) IS NOT NULL
      GROUP BY 1, 2 ORDER BY 1, 2`
  );
  const arbeit = rows.slice(0, LIMIT);
  console.log(`${arbeit.length} von ${rows.length} Titeln ohne Herkunftsdaten${DRY ? ' (Probelauf)' : ''}.`);

  let ok = 0, leer = 0, fehler = 0, i = 0, fertig = 0;
  const worker = async () => {
    while (i < arbeit.length) {
      const row = arbeit[i++];
      try {
        const detail = await tmdb(`/${TMDB_KIND[row.type]}/${row.tmdb_id}`);
        const m = merkmaleAusDetail(detail, row.type);
        if (!m.originalLanguage && !m.originCountry) leer++;
        else {
          if (!DRY) {
            await pool.query(
              `UPDATE titles SET origin_country = $1, original_language = $2, runtime = $3, seasons = $4
                WHERE id = ANY($5::bigint[])`,
              [m.originCountry, m.originalLanguage, m.runtime, m.seasons, row.ids]
            );
          }
          ok++;
        }
      } catch (err) {
        fehler++;
        console.log(`  ! ${row.type} ${row.tmdb_id}: ${err.message}`);
      }
      if (++fertig % 500 === 0) console.log(`  ... ${fertig}/${arbeit.length} (ok ${ok}, ohne Daten ${leer}, Fehler ${fehler})`);
      await sleep(PAUSE_MS);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  console.log(`\nFertig: ${ok} gesetzt, ${leer} ohne Daten bei TMDB, ${fehler} Fehler.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
