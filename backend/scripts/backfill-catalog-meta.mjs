#!/usr/bin/env node
/*
 * backfill-catalog-meta.mjs -- traegt Stimmenzahl und Altersfreigabe fuer die
 * kuratierten Katalog-Titel nach.
 *
 * Hintergrund: Die 600 Katalog-Titel wurden beim Relaunch einmalig eingespielt
 * und werden von KEINEM der taeglichen Jobs angefasst -- anders als Discovery-
 * und Streaming-Titel, die regelmaessig neu geholt werden. Neue Felder wie
 * vote_count oder certification bleiben bei ihnen deshalb dauerhaft leer, bis
 * sie einmal gezielt nachgetragen werden. Genau das macht dieses Skript.
 *
 * Die TMDB-ID kommt aus titles.tmdb_id oder aus title_tmdb_resolution (dort
 * haben die Katalog-Titel sie durch die frueheren Laeufe bereits stehen).
 * Titel ohne Zuordnung werden uebersprungen -- ohne ID gibt es nichts zu holen.
 *
 * Bewusst NUR source='catalog': Discovery- und Streaming-Titel holen sich neue
 * Felder beim naechsten Lauf ihres taeglichen Jobs von selbst. Ohne diese
 * Einschraenkung wuerde das Skript alle ~27.000 Titel abklappern und rund
 * anderthalb Stunden laufen, um dieselbe Arbeit doppelt zu machen.
 *
 * Aufruf (auf dem Server, im Backend-Container):
 *   docker compose -f docker-compose.yml exec -T backend \
 *     node scripts/backfill-catalog-meta.mjs [--dry-run]
 *
 * Beliebig oft wiederholbar: Es werden nur Titel angefasst, bei denen mindestens
 * eines der beiden Felder noch fehlt.
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

// Identisch zu den Fetch-Skripten: Filme fuehren die Freigabe unter
// release_dates (je Land mehrere Eintraege, oft mit leerem certification-Feld
// -- daher der erste nicht leere), Serien unter content_ratings.
function fskAus(detail, kind) {
  if (kind === 'movie') {
    const de = ((detail.release_dates || {}).results || []).find((r) => r.iso_3166_1 === 'DE');
    if (!de) return null;
    return (de.release_dates || []).map((r) => r.certification).find((c) => c) || null;
  }
  const de = ((detail.content_ratings || {}).results || []).find((r) => r.iso_3166_1 === 'DE');
  return (de && de.rating) || null;
}

async function tmdb(pfad, params = {}) {
  const url = new URL(API + pfad);
  url.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let versuch = 0; versuch < 4; versuch++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.status === 429) { await sleep(2000 + versuch * 1000); continue; }
    if (!res.ok) throw new Error(`TMDB ${res.status} fuer ${pfad}`);
    return res.json();
  }
  throw new Error('TMDB Rate-Limit fuer ' + pfad);
}

async function main() {
  const { rows } = await pool.query(
    `SELECT t.id, t.type, t.title, t.year,
            COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id
       FROM titles t
       LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
      WHERE t.source = 'catalog'
        AND (t.vote_count IS NULL OR t.certification IS NULL)
        AND COALESCE(t.tmdb_id, r.tmdb_id) IS NOT NULL
      ORDER BY t.id`
  );
  console.log(`${rows.length} Titel mit fehlender Stimmenzahl oder Freigabe${DRY ? ' (Probelauf, es wird nichts geschrieben)' : ''}.`);

  let stimmen = 0, freigaben = 0, fehler = 0;
  for (const row of rows) {
    const kind = TMDB_KIND[row.type];
    try {
      const detail = await tmdb(`/${kind}/${row.tmdb_id}`, {
        language: LANG,
        append_to_response: kind === 'movie' ? 'release_dates' : 'content_ratings',
      });
      const vc = detail.vote_count != null ? detail.vote_count : null;
      const fsk = fskAus(detail, kind);
      if (!DRY) {
        // COALESCE beim Schreiben: ein leeres Ergebnis darf einen bereits
        // vorhandenen Wert nicht ueberschreiben.
        await pool.query(
          `UPDATE titles SET
             vote_count = COALESCE($1, vote_count),
             certification = COALESCE($2, certification),
             updated_at = now()
           WHERE id = $3`,
          [vc, fsk, row.id]
        );
      }
      if (vc != null) stimmen++;
      if (fsk) freigaben++;
      console.log(`  ✓ ${row.title} (${row.year}) -- Stimmen: ${vc != null ? vc : '—'}, FSK: ${fsk || '—'}`);
    } catch (err) {
      fehler++;
      console.log(`  ! ${row.title}: ${err.message}`);
    }
    await sleep(120);
  }

  console.log(`\nStimmenzahl gesetzt: ${stimmen} | Freigabe gesetzt: ${freigaben} | Fehler: ${fehler}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
