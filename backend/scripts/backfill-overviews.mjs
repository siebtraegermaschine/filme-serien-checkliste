#!/usr/bin/env node
/*
 * Trägt fehlende Kurzbeschreibungen (titles.plot / streaming_cache.overview)
 * per TMDB-Detailabruf nach. Betrifft vor allem Discovery-Titel, die beim
 * einmaligen Seed (seed-from-index-html.mjs) ohne "ov"-Feld ins alte CAND-
 * Array übernommen wurden, sowie einzelne Streaming-Titel ohne deutschen
 * TMDB-Overview.
 *
 * Holt zuerst mit language=de-DE, faellt bei leerem Ergebnis auf en-US zurueck
 * (besser eine englische Kurzbeschreibung als gar keine) -- betroffene Zeilen
 * werden am Ende als "nur EN" aufgelistet, damit sie bei Bedarf manuell/durch
 * Recherche auf Deutsch nachgezogen werden koennen.
 *
 * Idempotent: bearbeitet nur Zeilen mit NULL/leerem plot bzw. overview, daher
 * jederzeit gefahrlos erneut ausfuehrbar (z.B. nachdem TMDB fuer einen Titel
 * spaeter doch eine deutsche Beschreibung hinterlegt hat).
 *
 * Aufruf:  TMDB_API_KEY=xxxx node scripts/backfill-overviews.mjs [--dry-run]
 */
import 'dotenv/config';
import { pool } from '../db/pool.js';

const KEY = process.env.TMDB_API_KEY;
const LANG_PRIMARY = process.env.TMDB_LANG || 'de-DE';
const DRY_RUN = process.argv.includes('--dry-run');

if (!KEY) { console.error('FEHLER: TMDB_API_KEY ist nicht gesetzt.'); process.exit(1); }

const API = 'https://api.themoviedb.org/3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdbOverview(kind, tmdbId, language) {
  const u = new URL(`${API}/${kind}/${tmdbId}`);
  u.searchParams.set('api_key', KEY);
  u.searchParams.set('language', language);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(u);
    if (res.status === 429) { await sleep(2000 + attempt * 1000); continue; }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TMDB ${res.status} für ${kind}/${tmdbId}`);
    const d = await res.json();
    return (d.overview || '').trim();
  }
  throw new Error(`TMDB Rate-Limit für ${kind}/${tmdbId}`);
}

// TMDB nutzt 'movie'/'tv' als kind, unsere DB 'movie'/'series'.
const kindOf = (type) => (type === 'series' ? 'tv' : 'movie');

async function fetchOverview(type, tmdbId) {
  const kind = kindOf(type);
  let ov = await tmdbOverview(kind, tmdbId, LANG_PRIMARY);
  if (ov) return { overview: ov, lang: LANG_PRIMARY };
  await sleep(120);
  ov = await tmdbOverview(kind, tmdbId, 'en-US');
  if (ov) return { overview: ov, lang: 'en-US' };
  return { overview: null, lang: null };
}

async function backfillTitles() {
  const { rows } = await pool.query(
    `SELECT id, tmdb_id, type, title FROM titles WHERE source = 'discovery' AND (plot IS NULL OR plot = '') ORDER BY id`
  );
  console.log(`titles: ${rows.length} Zeilen ohne plot.`);
  const stillEmpty = [];
  const enOnly = [];
  let updated = 0;
  for (const row of rows) {
    const { overview, lang } = await fetchOverview(row.type, row.tmdb_id);
    if (!overview) { stillEmpty.push(row); await sleep(150); continue; }
    if (lang === 'en-US') enOnly.push(row);
    if (!DRY_RUN) {
      await pool.query('UPDATE titles SET plot = $1, updated_at = now() WHERE id = $2', [overview, row.id]);
    }
    updated++;
    if (updated % 100 === 0) console.log(`  ... ${updated}/${rows.length}`);
    await sleep(150);
  }
  console.log(`titles: ${updated} aktualisiert, ${stillEmpty.length} weiterhin ohne Overview (auch EN leer), ${enOnly.length} nur auf Englisch verfügbar.`);
  if (stillEmpty.length) console.log('  Ohne jede Overview (id/title):', stillEmpty.map((r) => `${r.id}:${r.title}`).join(', '));
  if (enOnly.length) console.log('  Nur Englisch (id/title):', enOnly.map((r) => `${r.id}:${r.title}`).join(', '));
}

async function backfillStreamingCache() {
  const { rows } = await pool.query(
    `SELECT provider_id, type, tmdb_id, title FROM streaming_cache WHERE overview IS NULL OR overview = '' ORDER BY title`
  );
  console.log(`streaming_cache: ${rows.length} Zeilen ohne overview.`);
  const stillEmpty = [];
  const enOnly = [];
  let updated = 0;
  for (const row of rows) {
    const { overview, lang } = await fetchOverview(row.type, row.tmdb_id);
    if (!overview) { stillEmpty.push(row); await sleep(150); continue; }
    if (lang === 'en-US') enOnly.push(row);
    if (!DRY_RUN) {
      await pool.query(
        'UPDATE streaming_cache SET overview = $1 WHERE provider_id = $2 AND type = $3 AND tmdb_id = $4',
        [overview, row.provider_id, row.type, row.tmdb_id]
      );
    }
    updated++;
    await sleep(150);
  }
  console.log(`streaming_cache: ${updated} aktualisiert, ${stillEmpty.length} weiterhin ohne Overview, ${enOnly.length} nur auf Englisch verfügbar.`);
  if (stillEmpty.length) console.log('  Ohne jede Overview (provider/title):', stillEmpty.map((r) => `${r.provider_id}:${r.title}`).join(', '));
  if (enOnly.length) console.log('  Nur Englisch (provider/title):', enOnly.map((r) => `${r.provider_id}:${r.title}`).join(', '));
}

async function main() {
  if (DRY_RUN) console.log('--dry-run: es wird NICHTS in die DB geschrieben, nur ausgewertet.');
  await backfillTitles();
  await backfillStreamingCache();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
