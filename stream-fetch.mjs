#!/usr/bin/env node
/*
 * stream-fetch.mjs – erzeugt streaming.json für die "Streaming"-Ansicht der App.
 *
 * Holt von TMDB (Daten via JustWatch) die aktuell im Abo (Flatrate) verfügbaren
 * Filme & Serien der konfigurierten Plattformen für die Region DE und schreibt
 * sie in ./streaming.json – im gleichen Feld-Format wie die Discovery-Kandidaten
 * ({id,t,y,g,d,c,p,r}), damit die "+ Liste"-Funktion identisch funktioniert.
 *
 * Läuft NUR in der GitHub Action (oder lokal) – der API-Key kommt aus der
 * Umgebungsvariable TMDB_API_KEY (GitHub Secret) und landet NIE im Client-Code.
 *
 * Aufruf:  TMDB_API_KEY=xxxx node stream-fetch.mjs
 * Node >= 18 (globales fetch).
 */

const API = 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY;
const REGION = process.env.TMDB_REGION || 'DE';
const LANG = process.env.TMDB_LANG || 'de-DE';
const COUNT = parseInt(process.env.STREAM_COUNT || '60', 10);   // Titel je Typ & Plattform
const MIN_VOTES = parseInt(process.env.STREAM_MIN_VOTES || '300', 10);
const MIN_YEAR = parseInt(process.env.STREAM_MIN_YEAR || '1980', 10);

// Gewünschte Plattformen – per Name gematcht (robuster als feste IDs).
const WANT = [
  // fbid = feste TMDB-Provider-ID als Fallback, falls die Namens-Erkennung scheitert
  // (z. B. wurde "Apple TV+" bei JustWatch/TMDB in "Apple TV" umbenannt).
  { id: 'amazon',  name: 'Amazon Prime Video', fbid: 9,   match: ['Amazon Prime Video'] },
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
  while (out.length < COUNT && page <= 8) {
    const d = await tmdb(`/discover/${kind}`, {
      language: LANG,
      watch_region: REGION,
      with_watch_providers: providerId,
      with_watch_monetization_types: 'flatrate',
      sort_by: 'vote_average.desc',
      'vote_count.gte': MIN_VOTES,
      [dateField]: `${MIN_YEAR}-01-01`,
      include_adult: 'false',
      page,
    });
    for (const it of (d.results || [])) {
      if (seen.has(it.id)) continue; seen.add(it.id);
      const dateStr = kind === 'movie' ? it.release_date : it.first_air_date;
      const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
      out.push({
        id: String(it.id),
        t: kind === 'movie' ? it.title : it.name,
        y: year,
        g: (it.genre_ids || []).map(id => gmap[id]).filter(Boolean),
        d: '',                                    // Regie: hier nicht abgefragt (Rate-Limit)
        c: [],                                    // Besetzung: dito
        p: it.poster_path || null,
        r: it.vote_average != null ? Math.round(it.vote_average * 10) / 10 : null,
      });
      if (out.length >= COUNT) break;
    }
    if (page >= (d.total_pages || 1)) break;
    page++;
    await sleep(250);
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
}

main().catch(e => { console.error(e); process.exit(1); });
