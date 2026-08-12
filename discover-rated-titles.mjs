#!/usr/bin/env node
/*
 * discover-rated-titles.mjs – traegt alle Filme & Serien ab einer TMDB-
 * Bewertungs-/Stimmenzahl-Schwelle dauerhaft in den Discovery-Pool der App
 * ein (unabhaengig vom aktuellen Streaming-Angebot). Im Unterschied zu
 * stream-fetch.mjs/streaming_cache gibt es hier KEIN taegliches Loeschen --
 * einmal aufgenommene Titel bleiben fuer immer per Suche/"Aehnliche Titel"
 * auffindbar, auch wenn sie in der ersten Discovery-Ansicht (250 Titel) nicht
 * auftauchen. Laeuft woechentlich (siehe .github/workflows/rated-titles.yml),
 * damit neu ueber die Schwelle steigende oder neu erschienene Titel
 * dazukommen -- rein additiv, bestehende Katalog-Titel werden nie angefasst
 * (siehe Schutzlogik in backend/routes/titles.js, Route POST /bulk-ingest).
 *
 * Aufruf:  TMDB_API_KEY=xxxx STREAMING_API_URL=https://... TITLES_INGEST_SECRET=xxx node discover-rated-titles.mjs
 * Node >= 18 (globales fetch).
 */

const API = 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY;
const LANG = process.env.TMDB_LANG || 'de-DE';
const MIN_RATING = parseFloat(process.env.RATED_MIN_RATING || '5');
const MIN_VOTES = parseInt(process.env.RATED_MIN_VOTES || '100', 10);
const STREAMING_API_URL = process.env.STREAMING_API_URL || '';
const TITLES_INGEST_SECRET = process.env.TITLES_INGEST_SECRET || '';

if (!KEY) { console.error('FEHLER: TMDB_API_KEY ist nicht gesetzt.'); process.exit(1); }
if (!STREAMING_API_URL || !TITLES_INGEST_SECRET) {
  console.error('FEHLER: STREAMING_API_URL und TITLES_INGEST_SECRET muessen gesetzt sein.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function genreMap(kind) {
  const d = await tmdb(`/genre/${kind}/list`, { language: LANG });
  const m = {}; (d.genres || []).forEach((g) => (m[g.id] = g.name)); return m;
}


// Laender fuer die Altersfreigaben -- die TMDB-Antwort enthaelt ohnehin alle,
// weitere Regionen kosten hier keinen zusaetzlichen Abruf.
const CERT_REGIONS = (process.env.TMDB_CERT_REGIONS || 'DE,AT,CH,GB,FR,IT,ES,NL,PT,PL,DK,SE,NO,FI,BE,IE,CZ,GR,HU,RO,BG,HR,SI,SK,LT,LV,EE,LU,MT,CY')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

// Altersfreigaben je Land aus dem ohnehin geholten Detail-Datensatz lesen.
// Filme fuehren sie unter release_dates (je Land mehrere Eintraege, oft mit
// leerem certification-Feld -- daher der erste nicht leere), Serien unter
// content_ratings. Ergebnis z.B. { DE: '12', AT: '14' }.
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

// Englische Fassung aus den mitgelieferten Uebersetzungen (siehe stream-fetch.mjs).
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

const enrichCache = new Map();
async function enrich(kind, id) {
  const ck = kind + ':' + id;
  if (enrichCache.has(ck)) return enrichCache.get(ck);
  const result = { cast: [], dir: '', fsk: null, certs: {}, tEn: '', ovEn: '' };
  try {
    const d = await tmdb(`/${kind}/${id}`, { language: LANG,
      // Freigaben und Uebersetzungen haengen sich an den ohnehin noetigen
      // Detailaufruf an -- kein zusaetzlicher Abruf, die Laufzeit bleibt gleich.
      append_to_response: kind === 'movie' ? 'credits,release_dates,translations' : 'credits,content_ratings,translations' });
    const cr = d.credits || {};
    result.cast = (cr.cast || []).slice(0, 4).map((p) => p.name).filter(Boolean);
    if (kind === 'movie') {
      const dd = (cr.crew || []).find((p) => p.job === 'Director');
      result.dir = dd ? dd.name : '';
    } else {
      result.dir = (d.created_by || []).map((p) => p.name).filter(Boolean).join(', ');
    }
    result.certs = zertifikate(d, kind);
    result.fsk = result.certs.DE || null;
    const en = englischAus(d, kind);
    result.tEn = en.titel || ((d.original_language === 'en' && (kind === 'movie' ? d.original_title : d.original_name)) || '');
    result.ovEn = en.ov;
  } catch (e) { /* Titel ohne Credits: Felder bleiben leer */ }
  enrichCache.set(ck, result);
  return result;
}

async function overviewWithFallback(kind, id, primaryOverview) {
  const ov = (primaryOverview || '').trim();
  if (ov) return ov;
  try {
    const d = await tmdb(`/${kind}/${id}`, { language: 'en-US' });
    return (d.overview || '').trim();
  } catch (e) { return ''; }
}

function addItem(it, kind, gmap, out, seen) {
  if (seen.has(it.id)) return;
  seen.add(it.id);
  const dateStr = kind === 'movie' ? it.release_date : it.first_air_date;
  const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
  out.push({
    tmdbId: it.id,
    type: kind === 'movie' ? 'movie' : 'series',
    title: kind === 'movie' ? it.title : it.name,
    year,
    genres: (it.genre_ids || []).map((id2) => gmap[id2]).filter(Boolean),
    posterPath: it.poster_path || null,
    rating: it.vote_average != null ? Math.round(it.vote_average * 10) / 10 : null,
    voteCount: it.vote_count != null ? it.vote_count : null,
    overviewRaw: it.overview || '',
  });
}

function fetchRange(kind, gteRating, lteRating, page) {
  return tmdb(`/discover/${kind}`, {
    language: LANG,
    sort_by: 'vote_average.desc',
    'vote_average.gte': gteRating,
    'vote_average.lte': lteRating,
    'vote_count.gte': MIN_VOTES,
    include_adult: 'false',
    page,
  });
}

// TMDB begrenzt /discover hart auf 500 Seiten (= 10.000 Treffer) je Abfrage --
// bei Filmen (~22.000 ab Bewertung>=5) wuerde eine einzelne, unaufgeteilte
// Abfrage nur die (nach Bewertung sortierten) Top 10.000 liefern, der Rest
// bliebe unerreichbar. Deshalb wird der Bewertungsbereich rekursiv in immer
// kleinere Bloecke aufgeteilt, bis jeder Block sicher unter dem Limit bleibt.
const MAX_PER_BUCKET = 9800;

async function discoverRange(kind, gmap, gteRating, lteRating, out, seen) {
  const d = await fetchRange(kind, gteRating, lteRating, 1);
  const total = d.total_results || 0;
  if (total === 0) return;
  const totalPages = Math.min(d.total_pages || 1, 500);

  if (total > MAX_PER_BUCKET && lteRating - gteRating > 0.02) {
    const mid = Math.round(((gteRating + lteRating) / 2) * 100) / 100;
    if (mid > gteRating && mid < lteRating) {
      await discoverRange(kind, gmap, gteRating, mid, out, seen);
      await discoverRange(kind, gmap, Math.round((mid + 0.01) * 100) / 100, lteRating, out, seen);
      return;
    }
  }

  console.log(`  Bereich ${gteRating.toFixed(2)}-${lteRating.toFixed(2)}: ${total} Treffer (${totalPages} Seiten)`);
  for (const it of d.results || []) addItem(it, kind, gmap, out, seen);
  for (let page = 2; page <= totalPages; page++) {
    await sleep(200);
    const dp = await fetchRange(kind, gteRating, lteRating, page);
    for (const it of dp.results || []) addItem(it, kind, gmap, out, seen);
  }
}

async function discoverAll(kind, gmap) {
  const out = [];
  const seen = new Set();
  await discoverRange(kind, gmap, MIN_RATING, 10, out, seen);
  return out;
}

async function main() {
  if (process.argv.includes('--resend')) {
    const { readFileSync } = await import('node:fs');
    const backupPath = new URL('./rated-titles-last-run.json', import.meta.url);
    const all = JSON.parse(readFileSync(backupPath, 'utf8'));
    console.log(`--resend: ${all.length} Titel aus Backup geladen, Discover/Enrich uebersprungen.`);
    await sendBatched(all);
    return;
  }

  const [movieGenres, tvGenres] = await Promise.all([genreMap('movie'), genreMap('tv')]);
  console.log('Discover läuft (Filme)...');
  const movies = await discoverAll('movie', movieGenres);
  console.log(`  ${movies.length} Filme gefunden.`);
  console.log('Discover läuft (Serien)...');
  const series = await discoverAll('tv', tvGenres);
  console.log(`  ${series.length} Serien gefunden.`);

  const all = [...movies, ...series];
  console.log(`Reichere ${all.length} Titel mit Cast/Regie/Overview-Fallback an...`);
  let done = 0;
  for (const item of all) {
    const kind = item.type === 'series' ? 'tv' : 'movie';
    const ex = await enrich(kind, item.tmdbId);
    item.cast = ex.cast;
    item.director = ex.dir;
    item.certification = ex.fsk;
    item.certifications = ex.certs;
    item.titleEn = ex.tEn;
    item.overviewEn = ex.ovEn;
    item.plot = (item.overviewRaw || '').trim() || ex.ovEn || await overviewWithFallback(kind, item.tmdbId, item.overviewRaw);
    delete item.overviewRaw;
    done++;
    if (done % 200 === 0) console.log(`  ... ${done}/${all.length}`);
    await sleep(130);
  }

  // Sicherheitsnetz: vor dem Versand lokal zwischenspeichern -- ein Netzwerk-/
  // Server-Fehler beim finalen POST soll nicht den ganzen (u.U. 20-30 Minuten
  // dauernden) Discover+Enrich-Lauf verwerfen. Bei --resend kann der zuletzt
  // gespeicherte Stand erneut verschickt werden, ohne alles neu zu holen.
  const { writeFileSync } = await import('node:fs');
  const backupPath = new URL('./rated-titles-last-run.json', import.meta.url);
  writeFileSync(backupPath, JSON.stringify(all));
  console.log(`Backup geschrieben: ${backupPath.pathname}`);

  await sendBatched(all);
}

async function sendBatched(all) {
  // In Batches senden statt alles in einem Request -- haelt die Payload pro
  // Request klein (Body-Limit der bulk-ingest-Route) und einzelne Batches
  // koennen bei einem Fehler gezielt wiederholt werden.
  const BATCH_SIZE = 500;
  let totalWritten = 0;
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE);
    console.log(`Sende Batch ${i / BATCH_SIZE + 1} (${batch.length} Titel) an ${STREAMING_API_URL} ...`);
    const res = await fetch(new URL('/api/titles/bulk-ingest', STREAMING_API_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TITLES_INGEST_SECRET}`,
      },
      body: JSON.stringify({ items: batch }),
    });
    if (!res.ok) throw new Error(`Ingest-API ${res.status}: ${await res.text()}`);
    const result = await res.json();
    totalWritten += result.written;
    console.log(`  ... ${result.processed} verarbeitet, ${result.written} geschrieben/aktualisiert.`);
  }
  console.log(`Fertig: insgesamt ${totalWritten} geschrieben/aktualisiert.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
