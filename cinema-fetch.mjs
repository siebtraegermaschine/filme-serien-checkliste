#!/usr/bin/env node
/*
 * cinema-fetch.mjs – aktuelle und kommende Kinostarts (Deutschland) fuer den
 * "Kino"-Bereich der App.
 *
 * Holt von TMDB per /discover/movie (region=DE, with_release_type=2|3 fuer
 * "Limited"/"Theatrical") drei sich nicht ueberschneidende Zeitfenster:
 *   - "now":   Kinostart in den letzten NOW_LOOKBACK_DAYS Tagen (inkl. heute)
 *              -- deckt sowohl ganz neu gestartete als auch laenger laufende
 *              Filme ab, sortiert im Frontend nach Kinostart absteigend.
 *   - "soon":  Kinostart in den naechsten SOON_WINDOW_DAYS Tagen danach.
 *   - "later": Kinostart bis zu ein Jahr danach.
 *
 * Laeuft NUR in der GitHub Action (oder lokal) -- der API-Key kommt aus der
 * Umgebungsvariable TMDB_API_KEY (GitHub Secret) und landet NIE im Client-Code.
 * Schickt das Ergebnis per POST an /api/cinema/ingest (Auth ueber
 * CINEMA_INGEST_SECRET), analog zu stream-fetch.mjs/streaming_cache.
 *
 * Aufruf:  TMDB_API_KEY=xxxx STREAMING_API_URL=https://... CINEMA_INGEST_SECRET=xxx node cinema-fetch.mjs
 * Node >= 18 (globales fetch).
 */

const API = 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY;
const REGION = process.env.TMDB_REGION || 'DE';
const LANG = process.env.TMDB_LANG || 'de-DE';
const STREAMING_API_URL = process.env.STREAMING_API_URL || '';
const CINEMA_INGEST_SECRET = process.env.CINEMA_INGEST_SECRET || '';

const NOW_LOOKBACK_DAYS = 60;  // wie weit "aktuell im Kino" rueckwirkend reicht
const SOON_WINDOW_DAYS = 28;   // Ende von "in Kuerze im Kino" (~4 Wochen)
const LATER_WINDOW_DAYS = 365; // Ende von "bald im Kino" (~1 Jahr)

if (!KEY) { console.error('FEHLER: TMDB_API_KEY ist nicht gesetzt.'); process.exit(1); }
if (!STREAMING_API_URL || !CINEMA_INGEST_SECRET) {
  console.error('FEHLER: STREAMING_API_URL und CINEMA_INGEST_SECRET muessen gesetzt sein.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }

async function tmdb(path, params = {}) {
  const u = new URL(API + path);
  u.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(u);
    if (res.status === 429) { await sleep(2000 + attempt * 1000); continue; }
    if (!res.ok) throw new Error(`TMDB ${res.status} für ${path}`);
    return res.json();
  }
  throw new Error('TMDB Rate-Limit für ' + path);
}

async function genreMap() {
  const d = await tmdb('/genre/movie/list', { language: LANG });
  const m = {}; (d.genres || []).forEach((g) => (m[g.id] = g.name)); return m;
}

const enrichCache = new Map();
// Holt zusaetzlich zu Cast/Regie alle deutschen Kino-Veroeffentlichungstermine
// (release_dates, type 2=Limited/3=Theatrical) -- noetig, weil /discover/movie
// zwar korrekt nur Filme mit einem passenden DE-Kinotermin im jeweiligen
// Zeitfenster liefert, das zurueckgegebene "release_date"-Feld dabei aber die
// urspruengliche (globale) Erstveroeffentlichung zeigt statt des tatsaechlich
// gesuchten (Wieder-)Auffuehrungstermins -- z.B. "Rocky" mit release_date 1977,
// obwohl der eigentliche Treffer eine Kino-Wiederauffuehrung 2026 ist (siehe
// discoverRange/main unten, wo aus deDates das passende Datum herausgesucht wird).
async function enrich(id) {
  if (enrichCache.has(id)) return enrichCache.get(id);
  const result = { cast: [], dir: '', deDates: [], fsk: null };
  try {
    const d = await tmdb(`/movie/${id}`, { language: LANG, append_to_response: 'credits,release_dates' });
    const cr = d.credits || {};
    result.cast = (cr.cast || []).slice(0, 4).map((p) => p.name).filter(Boolean);
    const dd = (cr.crew || []).find((p) => p.job === 'Director');
    result.dir = dd ? dd.name : '';
    const rdResults = (d.release_dates && d.release_dates.results) || [];
    const deEntry = rdResults.find((r) => r.iso_3166_1 === 'DE');
    if (deEntry) {
      result.deDates = (deEntry.release_dates || [])
        .filter((rd) => rd.type === 2 || rd.type === 3)
        .map((rd) => String(rd.release_date).slice(0, 10))
        .sort();
      // Freigabe steht in derselben Antwort -- oft nur an einem der Eintraege,
      // daher der erste nicht leere Wert.
      result.fsk = (deEntry.release_dates || []).map((rd) => rd.certification).find((c) => c) || null;
    }
  } catch (e) { /* Titel ohne Credits/Release-Termine: Felder bleiben leer */ }
  enrichCache.set(id, result);
  return result;
}

async function discoverRange(gteDate, lteDate, sortDir, gmap, category, out, seen) {
  let page = 1;
  let totalPages = 1;
  do {
    const d = await tmdb('/discover/movie', {
      language: LANG,
      region: REGION,
      with_release_type: '2|3',
      'release_date.gte': fmtDate(gteDate),
      'release_date.lte': fmtDate(lteDate),
      sort_by: `primary_release_date.${sortDir}`,
      include_adult: 'false',
      page,
    });
    totalPages = Math.min(d.total_pages || 1, 500);
    for (const it of d.results || []) {
      if (seen.has(it.id)) continue; seen.add(it.id);
      const year = it.release_date ? parseInt(it.release_date.slice(0, 4), 10) : null;
      out.push({
        tmdbId: it.id,
        title: it.title,
        year,
        genres: (it.genre_ids || []).map((g) => gmap[g]).filter(Boolean),
        posterPath: it.poster_path || null,
        rating: it.vote_average != null ? Math.round(it.vote_average * 10) / 10 : null,
        voteCount: it.vote_count != null ? it.vote_count : null,
        overview: (it.overview || '').trim(),
        // Vorlaeufig die von /discover gelieferte (oft globale Erst-)
        // Veroeffentlichung -- wird unten in main() ggf. durch das tatsaechlich
        // passende deutsche Kinodatum ersetzt (siehe enrich/deDates).
        releaseDate: it.release_date || null,
        originalReleaseDate: it.release_date || null,
        category,
        _gte: fmtDate(gteDate),
        _lte: fmtDate(lteDate),
      });
    }
    page++;
    await sleep(200);
  } while (page <= totalPages);
}

async function main() {
  const gmap = await genreMap();
  const today = new Date();
  const out = [];
  const seen = new Set();

  console.log('Discover "now" (aktuell im Kino)...');
  await discoverRange(addDays(today, -NOW_LOOKBACK_DAYS), today, 'desc', gmap, 'now', out, seen);
  console.log(`  ${out.length} Filme.`);

  const beforeSoon = out.length;
  console.log('Discover "soon" (in Kürze im Kino)...');
  await discoverRange(addDays(today, 1), addDays(today, SOON_WINDOW_DAYS), 'asc', gmap, 'soon', out, seen);
  console.log(`  ${out.length - beforeSoon} Filme.`);

  const beforeLater = out.length;
  console.log('Discover "later" (bald im Kino)...');
  await discoverRange(addDays(today, SOON_WINDOW_DAYS + 1), addDays(today, LATER_WINDOW_DAYS), 'asc', gmap, 'later', out, seen);
  console.log(`  ${out.length - beforeLater} Filme.`);

  console.log(`Reichere ${out.length} Titel mit Cast/Regie/Kinotermin an...`);
  let done = 0;
  for (const item of out) {
    const ex = await enrich(item.tmdbId);
    item.cast = ex.cast;
    item.director = ex.dir;
    item.certification = ex.fsk;
    // Das deutsche Kinodatum, das tatsaechlich in dieses Zeitfenster faellt
    // (deshalb hat /discover den Titel ja geliefert), ersetzt das vorlaeufige
    // (oft globale Erst-)Veroeffentlichungsdatum von oben. originalReleaseDate
    // bleibt nur gesetzt, wenn es sich im Jahr unterscheidet -- sonst waeren
    // beide Datumsfelder ohnehin identisch/uninteressant (kein Wiederaufführungs-
    // Hinweis fuer ganz normale Neustarts).
    const deMatch = ex.deDates.find((d) => d >= item._gte && d <= item._lte);
    if (deMatch) {
      item.releaseDate = deMatch;
      if (!item.originalReleaseDate || item.originalReleaseDate.slice(0, 4) === deMatch.slice(0, 4)) {
        item.originalReleaseDate = null;
      }
    } else {
      item.originalReleaseDate = null;
    }
    delete item._gte;
    delete item._lte;
    done++;
    if (done % 100 === 0) console.log(`  ... ${done}/${out.length}`);
    await sleep(130);
  }

  const res = await fetch(new URL('/api/cinema/ingest', STREAMING_API_URL), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CINEMA_INGEST_SECRET}`,
    },
    body: JSON.stringify({ items: out }),
  });
  if (!res.ok) throw new Error(`Ingest-API ${res.status}: ${await res.text()}`);
  console.log(`An Backend übertragen: ${out.length} Titel.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
