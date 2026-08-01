#!/usr/bin/env node
/*
 * backfill-catalog-posters.mjs -- ersetzt die als Base64 eingebetteten Poster
 * der urspruenglich kuratierten Katalog-Titel durch echte TMDB-Posterpfade.
 *
 * Hintergrund: Die 600 Katalog-Titel wurden beim Relaunch ohne TMDB-Zuordnung
 * uebernommen; ihre Poster liegen deshalb als Base64 in titles.poster_base64 --
 * zusammen rund 4,2 MB, die bei JEDEM Katalog-Abruf mit uebertragen werden.
 * Ein TMDB-Pfad ist dagegen ein kurzer String, das Bild selbst holt der Browser
 * direkt vom TMDB-CDN (und cacht es dort).
 *
 * Vorgehen je Titel ohne poster_path:
 *   1. TMDB-ID bestimmen -- aus titles.tmdb_id, aus einer frueheren Aufloesung
 *      (title_tmdb_resolution) oder per Suche ueber Titel + Jahr + Typ.
 *   2. poster_path von TMDB holen.
 *   3. NUR wenn beides geklappt hat: poster_path setzen und poster_base64
 *      leeren. Ohne Treffer bleibt das Base64-Bild unangetastet -- lieber ein
 *      paar Kilobyte zu viel als ein Titel ohne Bild.
 *
 * Aufruf (auf dem Server, im Backend-Container):
 *   docker compose -f docker-compose.yml exec -T backend \
 *     node scripts/backfill-catalog-posters.mjs [--dry-run]
 *
 * --dry-run zeigt nur an, was passieren wuerde, und schreibt nichts.
 */
import 'dotenv/config';
import { pool } from '../db/pool.js';

const API = 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY;
const LANG = process.env.TMDB_LANG || 'de-DE';
const DRY = process.argv.includes('--dry-run');

if (!KEY) { console.error('FEHLER: TMDB_API_KEY ist nicht gesetzt.'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TMDB_KIND = { movie: 'movie', series: 'tv' };

// Identisch zu normTitle() in routes/watchProviders.js und im Frontend: der
// Katalog trennt Untertitel mit Doppelpunkt, TMDB meist mit Bindestrich.
function normTitle(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/:/g, '-')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ');
}

async function tmdb(path, params = {}) {
  const url = new URL(API + path);
  url.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let versuch = 0; versuch < 4; versuch++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.status === 429) { await sleep(2000 + versuch * 1000); continue; }
    if (!res.ok) throw new Error(`TMDB ${res.status} fuer ${path}`);
    return res.json();
  }
  throw new Error('TMDB Rate-Limit fuer ' + path);
}

async function sucheTmdbId(kind, title, year) {
  const nameField = kind === 'movie' ? 'title' : 'name';
  const origField = kind === 'movie' ? 'original_title' : 'original_name';
  const dateField = kind === 'movie' ? 'release_date' : 'first_air_date';
  const gesucht = normTitle(title);

  const suche = async (q) => (await tmdb(`/search/${kind}`, { language: LANG, query: q, include_adult: 'false' })).results || [];
  const primaer = await suche(title);
  const byId = new Map(primaer.map((r) => [r.id, r]));
  const haupt = title.split(/[:‐-―−-]/)[0].trim();
  if (haupt && haupt.length >= 3 && haupt !== title) {
    await sleep(120);
    for (const r of await suche(haupt)) if (!byId.has(r.id)) byId.set(r.id, r);
  }
  const kandidaten = [...byId.values()];
  const jahrVon = (r) => Number.parseInt(String(r[dateField] || '').slice(0, 4), 10);
  const titelPasst = (r) => normTitle(r[nameField]) === gesucht || normTitle(r[origField]) === gesucht;
  const jahrPasst = (r) => { const y = jahrVon(r); return Number.isInteger(y) && Math.abs(y - year) <= 1; };

  const exakt = kandidaten.find((r) => titelPasst(r) && (!year || jahrPasst(r)));
  if (exakt) return exakt;
  if (!year) return kandidaten.find(titelPasst) || null;
  return primaer.find(jahrPasst) || null;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT t.id, t.type, t.title, t.year, t.tmdb_id, r.tmdb_id AS aufgeloest,
            length(t.poster_base64) AS base64_groesse
       FROM titles t
       LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
      WHERE t.poster_path IS NULL AND t.poster_base64 IS NOT NULL
      ORDER BY t.id`
  );
  console.log(`${rows.length} Titel ohne Posterpfad gefunden${DRY ? ' (Probelauf, es wird nichts geschrieben)' : ''}.`);

  let ersetzt = 0, ohneTreffer = 0, gespart = 0;
  for (const row of rows) {
    const kind = TMDB_KIND[row.type];
    try {
      let tmdbId = row.tmdb_id || row.aufgeloest;
      if (!tmdbId) {
        const treffer = await sucheTmdbId(kind, row.title, row.year);
        tmdbId = treffer ? treffer.id : null;
        // Zuordnung festhalten, damit auch die Ansehen/Leihen/Kaufen-Buttons
        // davon profitieren (und die Suche nicht erneut noetig wird).
        if (!DRY) {
          await pool.query(
            `INSERT INTO title_tmdb_resolution (title_id, tmdb_id) VALUES ($1,$2)
             ON CONFLICT (title_id) DO UPDATE SET tmdb_id = EXCLUDED.tmdb_id, resolved_at = now()`,
            [row.id, tmdbId]
          );
        }
        if (treffer && treffer.poster_path) {
          if (!DRY) {
            await pool.query('UPDATE titles SET poster_path = $1, poster_base64 = NULL, updated_at = now() WHERE id = $2',
              [treffer.poster_path, row.id]);
          }
          ersetzt++; gespart += row.base64_groesse || 0;
          console.log(`  ✓ ${row.title} (${row.year}) -> ${treffer.poster_path}`);
          await sleep(120);
          continue;
        }
      }
      if (!tmdbId) {
        ohneTreffer++;
        console.log(`  – ${row.title} (${row.year}): keine TMDB-Zuordnung, Base64 bleibt`);
        await sleep(120);
        continue;
      }
      const detail = await tmdb(`/${kind}/${tmdbId}`, { language: LANG });
      if (detail.poster_path) {
        if (!DRY) {
          await pool.query('UPDATE titles SET poster_path = $1, poster_base64 = NULL, updated_at = now() WHERE id = $2',
            [detail.poster_path, row.id]);
        }
        ersetzt++; gespart += row.base64_groesse || 0;
        console.log(`  ✓ ${row.title} (${row.year}) -> ${detail.poster_path}`);
      } else {
        ohneTreffer++;
        console.log(`  – ${row.title} (${row.year}): TMDB hat kein Poster, Base64 bleibt`);
      }
    } catch (err) {
      ohneTreffer++;
      console.log(`  ! ${row.title}: ${err.message} -- Base64 bleibt`);
    }
    await sleep(120);
  }

  console.log(`\nErsetzt: ${ersetzt} | ohne Treffer (Base64 unveraendert): ${ohneTreffer}`);
  console.log(`Eingesparte Auslieferung: ${(gespart / 1e6).toFixed(2)} MB`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
