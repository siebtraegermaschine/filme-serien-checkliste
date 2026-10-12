#!/usr/bin/env node
/*
 * backfill-reihen.mjs -- traegt die TMDB-Collection (Reihe/Franchise) und das
 * Erscheinungsdatum fuer Filme nach.
 *
 * Idempotent und wiederaufnehmbar: angefasst werden nur Filme mit
 * collection_geprueft = false. Auch Filme OHNE Reihe (und TMDB-404) werden
 * danach als geprueft markiert, sonst fragt jeder Lauf sie erneut ab.
 * Je TMDB-ID ein Abruf (Katalog- und Discovery-Zeile desselben Films teilen
 * ihn); 3 parallele Abrufe mit Pause, 429 wartet Retry-After ab.
 *
 * Aufruf (auf dem Server; lang -> abkoppeln, siehe CLAUDE.md):
 *   docker compose -f docker-compose.yml --profile prod exec -T backend \
 *     node scripts/backfill-reihen.mjs [--dry-run] [--limit=200]
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

async function tmdb(pfad) {
  const url = new URL(API + pfad);
  url.searchParams.set('api_key', KEY);
  // Deutsch, damit der Reihenname (z. B. "Der Herr der Ringe - Filmreihe") deutsch kommt.
  url.searchParams.set('language', 'de-DE');
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
    `SELECT COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id, array_agg(t.id) AS ids
       FROM titles t LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
      WHERE t.type = 'movie' AND NOT t.collection_geprueft AND COALESCE(t.tmdb_id, r.tmdb_id) IS NOT NULL
      GROUP BY 1 ORDER BY 1`
  );
  const arbeit = rows.slice(0, LIMIT);
  console.log(`${arbeit.length} von ${rows.length} Filmen noch nicht auf Reihen geprueft${DRY ? ' (Probelauf)' : ''}.`);

  let mitReihe = 0, ohne = 0, fehler = 0, i = 0, fertig = 0;
  const worker = async () => {
    while (i < arbeit.length) {
      const row = arbeit[i++];
      try {
        const detail = await tmdb(`/movie/${row.tmdb_id}`);
        const m = merkmaleAusDetail(detail, 'movie');
        if (m.collectionId) mitReihe++; else ohne++;
        if (!DRY) {
          await pool.query(
            `UPDATE titles SET collection_id = $1, collection_name = $2,
                    erschienen_am = COALESCE($3::date, erschienen_am), collection_geprueft = true
              WHERE id = ANY($4::bigint[])`,
            [m.collectionId, m.collectionName, m.erschienenAm, row.ids]
          );
        }
      } catch (err) {
        fehler++;
        console.log(`  ! movie ${row.tmdb_id}: ${err.message}`);
      }
      if (++fertig % 500 === 0) console.log(`  ... ${fertig}/${arbeit.length} (mit Reihe ${mitReihe}, ohne ${ohne}, Fehler ${fehler})`);
      await sleep(PAUSE_MS);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  console.log(`\nFertig: ${mitReihe} mit Reihe, ${ohne} ohne Reihe, ${fehler} Fehler.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
