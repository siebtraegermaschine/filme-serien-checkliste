import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const router = createAsyncRouter();

const API = 'https://api.themoviedb.org/3';
const REGION = process.env.TMDB_REGION || 'DE';
// Wie lange ein gecachter Eintrag als frisch gilt. Streaming-Rechte wechseln
// meist zum Monatsanfang, taeglich neu zu fragen reicht also dicke -- und
// begrenzt zugleich, wie oft ein oft geoeffneter Titel TMDB belastet.
const TTL_HOURS = Number(process.env.WATCH_PROVIDERS_TTL_HOURS || 24);

// 'series' ist die interne Bezeichnung, TMDB nennt es 'tv'.
const TMDB_KIND = { movie: 'movie', series: 'tv' };

// Reduziert die TMDB-Anbieterobjekte auf das, was die App tatsaechlich
// anzeigt. display_priority ist die von TMDB/JustWatch gelieferte
// Sortierempfehlung (kleiner = prominenter) und bestimmt hier die Reihenfolge;
// sie selbst wird nicht mitgespeichert.
function mapProviders(list) {
  return (list || [])
    .slice()
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path || null }));
}

function rowToPayload(row) {
  return {
    flatrate: row.flatrate || [],
    rent: row.rent || [],
    buy: row.buy || [],
    region: row.region,
    fetchedAt: row.fetched_at,
  };
}

const EMPTY = { flatrate: [], rent: [], buy: [], region: REGION, fetchedAt: null };

// Sucht die TMDB-ID eines Katalog-Titels ueber Titel + Jahr + Typ. Bewusst
// streng: ohne Jahresuebereinstimmung (±1 Jahr, damit abweichende
// Kino-/Erstausstrahlungsjahre nicht stoeren) wird KEIN Treffer akzeptiert --
// lieber keine Buttons als die Verfuegbarkeit eines falschen Films.
async function searchTmdbId(kind, title, year) {
  const key = process.env.TMDB_API_KEY;
  if (!key || !title) return null;
  const url = new URL(`${API}/search/${kind}`);
  url.searchParams.set('api_key', key);
  url.searchParams.set('language', process.env.TMDB_LANG || 'de-DE');
  url.searchParams.set('query', title);
  url.searchParams.set('include_adult', 'false');
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  const results = data.results || [];
  if (!results.length) return null;
  if (!year) return results[0].id;
  const dateField = kind === 'movie' ? 'release_date' : 'first_air_date';
  const match = results.find((r) => {
    const y = Number.parseInt(String(r[dateField] || '').slice(0, 4), 10);
    return Number.isInteger(y) && Math.abs(y - year) <= 1;
  });
  return match ? match.id : null;
}

// Liefert die TMDB-ID zu einer internen titles.id -- entweder direkt aus
// titles.tmdb_id, aus einer frueheren Aufloesung, oder per TMDB-Suche.
// Gibt {tmdbId, type} zurueck; tmdbId ist null, wenn nichts gefunden wurde.
async function resolveTmdbId(titleId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.tmdb_id, t.type, t.title, t.year, r.tmdb_id AS resolved_id,
            (r.title_id IS NOT NULL) AS has_resolution
       FROM titles t
       LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
      WHERE t.id = $1`,
    [titleId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.tmdb_id) return { tmdbId: row.tmdb_id, type: row.type };
  // Schon einmal gesucht? Dann Ergebnis wiederverwenden -- auch ein negatives
  // (resolved_id IS NULL), damit erfolglose Suchen sich nicht wiederholen.
  if (row.has_resolution) return { tmdbId: row.resolved_id, type: row.type };

  let found = null;
  try {
    found = await searchTmdbId(TMDB_KIND[row.type], row.title, row.year);
  } catch (err) {
    // Fehlgeschlagene Suche NICHT als "nichts gefunden" festschreiben --
    // beim naechsten Mal soll es erneut versucht werden.
    console.error(`watch-providers: TMDB-Suche fehlgeschlagen (${row.title}):`, err.message);
    return { tmdbId: null, type: row.type };
  }
  await pool.query(
    `INSERT INTO title_tmdb_resolution (title_id, tmdb_id) VALUES ($1, $2)
     ON CONFLICT (title_id) DO UPDATE SET tmdb_id = EXCLUDED.tmdb_id, resolved_at = now()`,
    [titleId, found]
  );
  return { tmdbId: found, type: row.type };
}

// GET /api/watch-providers/by-title/:titleId -- Einstieg fuer Titel, deren
// TMDB-ID im Frontend nicht bekannt ist (die 600 kuratierten Katalog-Titel
// haben durchweg tmdb_id NULL). Loest sie bei Bedarf per Suche auf.
router.get('/by-title/:titleId', async (req, res) => {
  const titleId = Number.parseInt(req.params.titleId, 10);
  if (!Number.isInteger(titleId) || titleId <= 0) {
    return res.status(400).json({ error: 'invalid_params' });
  }
  const resolved = await resolveTmdbId(titleId);
  if (!resolved || !resolved.tmdbId) return res.json(EMPTY);
  return respondWithProviders(res, resolved.type, resolved.tmdbId);
});

// GET /api/watch-providers/:type/:tmdbId -- oeffentlich (kein Login noetig,
// analog /api/streaming und /api/cinema). Liefert IMMER 200 mit leeren Listen,
// wenn nichts bekannt ist oder TMDB gerade klemmt: die Detailansicht soll
// deshalb nicht kaputtgehen, sie zeigt dann schlicht "nicht verfuegbar".
router.get('/:type/:tmdbId', async (req, res) => {
  const { type } = req.params;
  const tmdbId = Number.parseInt(req.params.tmdbId, 10);
  if (!TMDB_KIND[type] || !Number.isInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({ error: 'invalid_params' });
  }
  return respondWithProviders(res, type, tmdbId);
});

async function respondWithProviders(res, type, tmdbId) {
  const { rows } = await pool.query(
    `SELECT * FROM watch_providers_cache
      WHERE tmdb_id = $1 AND type = $2 AND region = $3`,
    [tmdbId, type, REGION]
  );
  const cached = rows[0];
  if (cached) {
    const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / 3_600_000;
    if (ageHours < TTL_HOURS) return res.json(rowToPayload(cached));
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    // Ohne Key kann nicht nachgeladen werden. Ein (abgelaufener) Cache-Eintrag
    // ist immer noch besser als nichts, sonst leere Listen.
    if (cached) return res.json(rowToPayload(cached));
    return res.json(EMPTY);
  }

  let data;
  try {
    const url = new URL(`${API}/${TMDB_KIND[type]}/${tmdbId}/watch/providers`);
    url.searchParams.set('api_key', key);
    const tmdbRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!tmdbRes.ok) throw new Error(`TMDB ${tmdbRes.status}`);
    data = await tmdbRes.json();
  } catch (err) {
    // Netzwerkfehler/Rate-Limit: lieber veraltete Daten ausliefern als gar keine.
    console.error(`watch-providers: TMDB-Abruf fehlgeschlagen (${type}/${tmdbId}):`, err.message);
    if (cached) return res.json(rowToPayload(cached));
    return res.json(EMPTY);
  }

  const regional = (data.results || {})[REGION] || {};
  const payload = {
    flatrate: mapProviders(regional.flatrate),
    rent: mapProviders(regional.rent),
    buy: mapProviders(regional.buy),
  };

  await pool.query(
    `INSERT INTO watch_providers_cache (tmdb_id, type, region, flatrate, rent, buy, link, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (tmdb_id, type, region) DO UPDATE SET
       flatrate = EXCLUDED.flatrate, rent = EXCLUDED.rent, buy = EXCLUDED.buy,
       link = EXCLUDED.link, fetched_at = now()`,
    [
      tmdbId,
      type,
      REGION,
      JSON.stringify(payload.flatrate),
      JSON.stringify(payload.rent),
      JSON.stringify(payload.buy),
      regional.link || null,
    ]
  );

  res.json({ ...payload, region: REGION, fetchedAt: new Date().toISOString() });
}

export default router;
