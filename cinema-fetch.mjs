#!/usr/bin/env node
/*
 * cinema-fetch.mjs – aktuelle und kommende Kinostarts fuer den "Kino"-Bereich
 * der App. Ein Lauf gilt fuer EINE Region (TMDB_REGION, Default DE) -- fuer
 * mehrere Laender laeuft das Skript je Region einmal.
 *
 * Holt von TMDB per /discover/movie (region=TMDB_REGION, with_release_type=2|3 fuer
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

// Laender fuer die Altersfreigaben -- die TMDB-Antwort enthaelt ohnehin alle,
// weitere Regionen kosten hier keinen zusaetzlichen Abruf.
const CERT_REGIONS = (process.env.TMDB_CERT_REGIONS || 'DE,AT')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

// Englische Fassung aus den mitgelieferten Uebersetzungen (siehe stream-fetch.mjs).
function englischAus(detail) {
  const alle = ((detail.translations || {}).translations || [])
    .filter((t) => t.iso_639_1 === 'en' && t.data);
  const beste = alle.find((t) => t.iso_3166_1 === 'US' && (t.data.overview || t.data.title))
    || alle.find((t) => t.data.overview || t.data.title);
  if (!beste) return { titel: '', ov: '' };
  return { titel: (beste.data.title || '').trim(), ov: (beste.data.overview || '').trim() };
}

const enrichCache = new Map();
// Holt zusaetzlich zu Cast/Regie alle Kino-Veroeffentlichungstermine der
// Ziel-Region (release_dates, type 2=Limited/3=Theatrical) -- noetig, weil
// /discover/movie zwar korrekt nur Filme mit einem passenden Kinotermin im
// jeweiligen Zeitfenster liefert, das zurueckgegebene "release_date"-Feld dabei
// aber die urspruengliche (globale) Erstveroeffentlichung zeigt statt des
// tatsaechlich gesuchten (Wieder-)Auffuehrungstermins -- z.B. "Rocky" mit
// release_date 1977, obwohl der eigentliche Treffer eine Kino-Wiederauffuehrung
// 2026 ist (siehe discoverRange/main unten, wo aus regionDates das passende
// Datum herausgesucht wird).
async function enrich(id) {
  if (enrichCache.has(id)) return enrichCache.get(id);
  const result = { cast: [], dir: '', regionDates: [], fsk: null, certs: {}, tEn: '', ovEn: '' };
  try {
    const d = await tmdb(`/movie/${id}`, { language: LANG, append_to_response: 'credits,release_dates,translations' });
    const cr = d.credits || {};
    result.cast = (cr.cast || []).slice(0, 4).map((p) => p.name).filter(Boolean);
    const dd = (cr.crew || []).find((p) => p.job === 'Director');
    result.dir = dd ? dd.name : '';
    const rdResults = (d.release_dates && d.release_dates.results) || [];
    const regionEntry = rdResults.find((r) => r.iso_3166_1 === REGION);
    if (regionEntry) {
      result.regionDates = (regionEntry.release_dates || [])
        .filter((rd) => rd.type === 2 || rd.type === 3)
        .map((rd) => String(rd.release_date).slice(0, 10))
        .sort();
    }
    // Freigaben je Land -- oft nur an einem der Eintraege, daher der erste
    // nicht leere Wert je Land.
    for (const region of CERT_REGIONS) {
      const eintrag = rdResults.find((r) => r.iso_3166_1 === region);
      const wert = eintrag && (eintrag.release_dates || []).map((rd) => rd.certification).find((c) => c);
      if (wert) result.certs[region] = wert;
    }
    result.fsk = result.certs.DE || null;
    const en = englischAus(d);
    result.tEn = en.titel || ((d.original_language === 'en' && d.original_title) || '');
    result.ovEn = en.ov;
  } catch (e) { /* Titel ohne Credits/Release-Termine: Felder bleiben leer */ }
  enrichCache.set(id, result);
  return result;
}

// Siehe stream-fetch.mjs: Bei language=de-DE bleibt overview leer, wenn TMDB
// keine deutsche Uebersetzung hat -- auch wenn eine englische vorliegt. Gerade
// Kinostarts sind davon betroffen, weil dort viele Titel neu und noch wenig
// gepflegt sind (z.B. "Wife and Doc" unter "Bald im Kino"). Der englische Text
// wird deshalb nur fuer die Luecken nachgeholt.
const ovFallbackCache = new Map();
async function overviewFallback(id) {
  if (ovFallbackCache.has(id)) return ovFallbackCache.get(id);
  let text = '';
  try {
    const d = await tmdb(`/movie/${id}`, { language: 'en-US' });
    text = (d.overview || '').trim();
  } catch (e) { /* auch ohne englischen Text bleibt der Titel nutzbar */ }
  ovFallbackCache.set(id, text);
  return text;
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
    item.certifications = ex.certs;
    item.titleEn = ex.tEn;
    item.overviewEn = ex.ovEn;
    if (!item.overview) item.overview = ex.ovEn || await overviewFallback(item.tmdbId);
    // Das Kinodatum der Ziel-Region, das tatsaechlich in dieses Zeitfenster
    // faellt (deshalb hat /discover den Titel ja geliefert), ersetzt das
    // vorlaeufige (oft globale Erst-)Veroeffentlichungsdatum von oben.
    // originalReleaseDate bleibt nur gesetzt, wenn es sich im Jahr
    // unterscheidet -- sonst waeren beide Datumsfelder ohnehin identisch/
    // uninteressant (kein Wiederaufführungs-Hinweis fuer normale Neustarts).
    const regionMatch = ex.regionDates.find((d) => d >= item._gte && d <= item._lte);
    if (regionMatch) {
      item.releaseDate = regionMatch;
      if (!item.originalReleaseDate || item.originalReleaseDate.slice(0, 4) === regionMatch.slice(0, 4)) {
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
    // region: der Ingest verwaltet jede Region getrennt (siehe routes/cinema.js).
    body: JSON.stringify({ region: REGION, items: out }),
  });
  if (!res.ok) throw new Error(`Ingest-API ${res.status}: ${await res.text()}`);
  console.log(`An Backend übertragen: ${out.length} Titel (Region ${REGION}).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
