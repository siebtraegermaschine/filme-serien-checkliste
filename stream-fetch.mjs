#!/usr/bin/env node
/*
 * stream-fetch.mjs – erzeugt streaming.json für die "Streaming"-Ansicht der App.
 *
 * Holt von TMDB (Daten via JustWatch) die aktuell im Abo (Flatrate) verfügbaren
 * Filme & Serien der konfigurierten Plattformen für die Region DE und schreibt
 * sie in ./streaming.json – im gleichen Feld-Format wie die Discovery-Kandidaten
 * ({id,t,y,g,d,c,p,r}), plus "ov" (Kurzbeschreibung/Plot) für die Detailansicht.
 *
 * Läuft NUR in der GitHub Action (oder lokal) – der API-Key kommt aus der
 * Umgebungsvariable TMDB_API_KEY (GitHub Secret) und landet NIE im Client-Code.
 *
 * Ist STREAMING_API_URL gesetzt, wird das Ergebnis zusätzlich per POST an den
 * eigenen Backend-Endpoint /api/streaming/ingest geschickt (Auth über
 * STREAMING_INGEST_SECRET) – das ist der Zielzustand nach dem Relaunch, damit
 * die Daten in Postgres statt in streaming.json landen. Ohne STREAMING_API_URL
 * verhält sich das Skript wie bisher (nur lokale Datei) – nützlich solange kein
 * Backend erreichbar ist.
 *
 * Aufruf:  TMDB_API_KEY=xxxx node stream-fetch.mjs
 * Node >= 18 (globales fetch).
 */

const API = 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY;
const REGION = process.env.TMDB_REGION || 'DE';
const LANG = process.env.TMDB_LANG || 'de-DE';
// Keine Mindest-Stimmenzahl mehr per Default: TMDB-Stimmenzahl und IMDb-
// Stimmenzahl sind zwei unabhaengige Zaehlungen -- gerade neuere oder nicht-
// englischsprachige Titel (z.B. "Unfamiliar", DE-Produktion) haben bei TMDB oft
// nur eine Handvoll Stimmen, obwohl sie bei IMDb laengst tausende haben und
// ganz reguplaer im Streaming-Angebot laufen. Verfuegbarkeit beim Anbieter ist
// hier schon das eigentliche Signal, die Bewertung zeigt sich trotzdem ganz
// normal in der App. Optional weiterhin per Env-Var einschraenkbar.
const MIN_VOTES = process.env.STREAM_MIN_VOTES ? parseInt(process.env.STREAM_MIN_VOTES, 10) : null;
// Keine Jahresuntergrenze mehr per Default (auch Klassiker wie "2001: Odyssee im
// Weltraum" (1968) sollen auftauchen) -- optional weiterhin per Env-Var einschraenkbar.
const MIN_YEAR = process.env.STREAM_MIN_YEAR ? parseInt(process.env.STREAM_MIN_YEAR, 10) : null;
const STREAMING_API_URL = process.env.STREAMING_API_URL || '';
const STREAMING_INGEST_SECRET = process.env.STREAMING_INGEST_SECRET || '';

// Gewünschte Plattformen – per Name gematcht (robuster als feste IDs).
const WANT = [
  // fbid = feste TMDB-Provider-ID als Fallback, falls die Namens-Erkennung scheitert
  // (z. B. wurde "Apple TV+" bei JustWatch/TMDB in "Apple TV" umbenannt).
  { id: 'amazon',  name: 'Amazon Prime',       fbid: 9,   match: ['Amazon Prime Video'] },
  { id: 'netflix', name: 'Netflix',            fbid: 8,   match: ['Netflix'] },
  { id: 'disney',  name: 'Disney+',            fbid: 337, match: ['Disney Plus', 'Disney+'] },
  { id: 'apple',   name: 'Apple TV+',          fbid: 350, match: ['Apple TV Plus', 'Apple TV+', 'Apple TV'] },
];

if (!KEY) { console.error('FEHLER: TMDB_API_KEY ist nicht gesetzt.'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

// Besetzung (≤4) und Regie/Erfinder je Titel – ein Extra-Request mit append_to_response,
// Ergebnisse werden gecacht, damit auf mehreren Plattformen gelistete Titel nur einmal abgefragt werden.
const enrichCache = new Map();
async function enrich(kind, id) {
  const ck = kind + ':' + id;
  if (enrichCache.has(ck)) return enrichCache.get(ck);
  const result = { cast: [], dir: '' };
  try {
    const d = await tmdb(`/${kind}/${id}`, { language: LANG, append_to_response: 'credits' });
    const cr = d.credits || {};
    result.cast = (cr.cast || []).slice(0, 4).map(p => p.name).filter(Boolean);
    if (kind === 'movie') {
      const dd = (cr.crew || []).find(p => p.job === 'Director');
      result.dir = dd ? dd.name : '';
    } else {
      result.dir = (d.created_by || []).map(p => p.name).filter(Boolean).join(', ');
    }
  } catch (e) { /* Titel ohne Credits: Felder bleiben leer */ }
  enrichCache.set(ck, result);
  return result;
}

async function genreMap(kind) {              // kind: 'movie' | 'tv'
  const d = await tmdb(`/genre/${kind}/list`, { language: LANG });
  const m = {}; (d.genres || []).forEach(g => m[g.id] = g.name); return m;
}

async function resolveProviderIds(kind) {    // Name -> ID über TMDB
  const d = await tmdb(`/watch/providers/${kind}`, { language: LANG, watch_region: REGION });
  const list = d.results || [];
  const byName = {};
  for (const p of list) byName[p.provider_name] = p.provider_id;
  return byName;
}

async function discover(kind, providerId, gmap) {
  const dateField = kind === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
  const out = [];
  const seen = new Set();
  let page = 1;
  let totalPages = 1;
  do {
    const params = {
      language: LANG,
      watch_region: REGION,
      with_watch_providers: providerId,
      with_watch_monetization_types: 'flatrate',
      sort_by: 'vote_average.desc',
      include_adult: 'false',
      page,
    };
    if (MIN_VOTES) params['vote_count.gte'] = MIN_VOTES;
    if (MIN_YEAR) params[dateField] = `${MIN_YEAR}-01-01`;
    const d = await tmdb(`/discover/${kind}`, params);
    totalPages = Math.min(d.total_pages || 1, 500); // TMDB-Limit: max. 500 Seiten je Query
    for (const it of (d.results || [])) {
      if (seen.has(it.id)) continue; seen.add(it.id);
      const dateStr = kind === 'movie' ? it.release_date : it.first_air_date;
      const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
      out.push({
        id: String(it.id),
        t: kind === 'movie' ? it.title : it.name,
        y: year,
        g: (it.genre_ids || []).map(id => gmap[id]).filter(Boolean),
        d: '',                                    // Regie/Erfinder – unten via enrich() nachgeladen
        c: [],                                    // Besetzung – unten via enrich() nachgeladen
        p: it.poster_path || null,
        r: it.vote_average != null ? Math.round(it.vote_average * 10) / 10 : null,
        vc: it.vote_count != null ? it.vote_count : null,
        ov: (it.overview || '').trim(),            // Kurzbeschreibung/Plot für die Detailansicht
      });
    }
    page++;
    await sleep(250);
  } while (page <= totalPages);
  for (const item of out) {
    const ex = await enrich(kind, item.id);
    item.c = ex.cast;
    item.d = ex.dir;
    await sleep(120);            // sanftes Tempo gegen das Rate-Limit
  }
  return out;
}

async function main() {
  const [movieGenres, tvGenres, movieProv, tvProv] = await Promise.all([
    genreMap('movie'), genreMap('tv'),
    resolveProviderIds('movie'), resolveProviderIds('tv'),
  ]);

  const providers = [];
  for (const w of WANT) {
    const mId = w.match.map(n => movieProv[n]).find(Boolean) || w.fbid;
    const tId = w.match.map(n => tvProv[n]).find(Boolean) || w.fbid;
    if (!mId && !tId) { console.warn(`WARN: keine Provider-ID für ${w.name} gefunden – übersprungen.`); continue; }
    console.log(`→ ${w.name}  (Film-ID ${mId ?? '—'}, Serien-ID ${tId ?? '—'})`);
    const f = mId ? await discover('movie', mId, movieGenres) : [];
    const s = tId ? await discover('tv', tId, tvGenres) : [];
    providers.push({ id: w.id, name: w.name, f, s });
    await sleep(300);
  }

  const doc = { generated: new Date().toISOString(), region: REGION, providers };
  const { writeFileSync } = await import('node:fs');
  writeFileSync('streaming.json', JSON.stringify(doc));
  const tot = providers.reduce((a, p) => a + p.f.length + p.s.length, 0);
  console.log(`streaming.json geschrieben: ${providers.length} Plattformen, ${tot} Titel.`);

  if (STREAMING_API_URL) {
    if (!STREAMING_INGEST_SECRET) {
      console.error('FEHLER: STREAMING_API_URL gesetzt, aber STREAMING_INGEST_SECRET fehlt.');
      process.exit(1);
    }
    const res = await fetch(new URL('/api/streaming/ingest', STREAMING_API_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${STREAMING_INGEST_SECRET}`,
      },
      body: JSON.stringify(doc),
    });
    if (!res.ok) {
      throw new Error(`Ingest-API ${res.status}: ${await res.text()}`);
    }
    console.log(`An Backend übertragen: ${STREAMING_API_URL}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
