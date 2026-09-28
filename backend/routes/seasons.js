import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { sprachWahl } from '../lib/i18n.js';
import { mengenGrenze } from '../middleware/rateLimit.js';
import { resolveTmdbId } from './watchProviders.js';

const router = createAsyncRouter();
const GRENZE = mengenGrenze({ name: 'seasons', anzahl: 120, minuten: 1 });

const API = 'https://api.themoviedb.org/3';
// Laufende Serien bekommen neue Folgen -- deshalb kuerzer als die Trailer.
const TTL_HOURS = Number(process.env.SEASONS_TTL_HOURS || 72);
const TMDB_LANG = { de: 'de-DE', en: 'en-US', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', nl: 'nl-NL', pt: 'pt-BR' };

async function tmdbJson(pfad, sprache) {
  const url = new URL(`${API}${pfad}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  url.searchParams.set('language', TMDB_LANG[sprache]);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

const frisch = (row) => row && (Date.now() - new Date(row.fetched_at).getTime()) / 3_600_000 < TTL_HOURS;

async function staffelnLiefern(res, tmdbId, sprache) {
  const { rows: [cached] } = await pool.query(
    'SELECT staffeln, fetched_at FROM serien_staffeln_cache WHERE tmdb_id = $1 AND sprache = $2', [tmdbId, sprache]);
  if (frisch(cached)) return res.json({ staffeln: cached.staffeln });
  if (!process.env.TMDB_API_KEY) return res.json({ staffeln: cached ? cached.staffeln : [] });
  try {
    const d = await tmdbJson(`/tv/${tmdbId}`, sprache);
    // Staffel 0 sind Specials -- die stehen bewusst mit drin, aber zuletzt.
    const staffeln = (d.seasons || []).map((s) => ({
      nr: s.season_number, name: s.name || '', folgen: s.episode_count || 0,
      datum: s.air_date || null, poster: s.poster_path || null,
    })).sort((a, b) => (a.nr === 0) - (b.nr === 0) || a.nr - b.nr);
    await pool.query(
      `INSERT INTO serien_staffeln_cache (tmdb_id, sprache, staffeln) VALUES ($1,$2,$3)
       ON CONFLICT (tmdb_id, sprache) DO UPDATE SET staffeln = EXCLUDED.staffeln, fetched_at = now()`,
      [tmdbId, sprache, JSON.stringify(staffeln)]);
    return res.json({ staffeln });
  } catch (err) {
    console.error(`seasons: Staffelliste fehlgeschlagen (${tmdbId}):`, err.message);
    return res.json({ staffeln: cached ? cached.staffeln : [] });
  }
}

async function folgenLiefern(res, tmdbId, nr, sprache) {
  const { rows: [cached] } = await pool.query(
    'SELECT folgen, fetched_at FROM serien_folgen_cache WHERE tmdb_id = $1 AND staffel = $2 AND sprache = $3',
    [tmdbId, nr, sprache]);
  if (frisch(cached)) return res.json({ folgen: cached.folgen });
  if (!process.env.TMDB_API_KEY) return res.json({ folgen: cached ? cached.folgen : [] });
  try {
    const d = await tmdbJson(`/tv/${tmdbId}/season/${nr}`, sprache);
    let episoden = d.episodes || [];
    // Fehlt der Text in der Wunschsprache, kommt der englische -- und wird als
    // solcher markiert ("en"), damit die Oberflaeche ihn kennzeichnen kann.
    const luecken = sprache !== 'en' && episoden.some((e) => !(e.overview || '').trim());
    const en = luecken ? await tmdbJson(`/tv/${tmdbId}/season/${nr}`, 'en').catch(() => null) : null;
    const enNachNr = new Map(((en && en.episodes) || []).map((e) => [e.episode_number, e]));
    const folgen = episoden.map((e) => {
      const eigen = (e.overview || '').trim();
      const ersatz = eigen ? '' : ((enNachNr.get(e.episode_number) || {}).overview || '').trim();
      return {
        nr: e.episode_number, name: e.name || '', datum: e.air_date || null,
        min: e.runtime || null, still: e.still_path || null,
        ov: eigen || ersatz, en: !eigen && !!ersatz,
      };
    });
    await pool.query(
      `INSERT INTO serien_folgen_cache (tmdb_id, staffel, sprache, folgen) VALUES ($1,$2,$3,$4)
       ON CONFLICT (tmdb_id, staffel, sprache) DO UPDATE SET folgen = EXCLUDED.folgen, fetched_at = now()`,
      [tmdbId, nr, sprache, JSON.stringify(folgen)]);
    return res.json({ folgen });
  } catch (err) {
    console.error(`seasons: Folgen fehlgeschlagen (${tmdbId}/S${nr}):`, err.message);
    return res.json({ folgen: cached ? cached.folgen : [] });
  }
}

const zahl = (v) => Number.parseInt(v, 10);

// Zwei Zugaenge wie bei Trailern: TMDB-ID direkt oder interne Titel-ID.
router.get('/by-title/:titleId', GRENZE, async (req, res) => {
  if (!(zahl(req.params.titleId) > 0)) return res.status(400).json({ error: 'invalid_params' });
  const a = await resolveTmdbId(zahl(req.params.titleId));
  if (!a || !a.tmdbId || a.type !== 'series') return res.json({ staffeln: [] });
  return staffelnLiefern(res, a.tmdbId, sprachWahl(req.query.lang));
});
router.get('/by-title/:titleId/:nr', GRENZE, async (req, res) => {
  const nr = zahl(req.params.nr);
  if (!(nr >= 0 && nr < 200) || !(zahl(req.params.titleId) > 0)) return res.status(400).json({ error: 'invalid_params' });
  const a = await resolveTmdbId(zahl(req.params.titleId));
  if (!a || !a.tmdbId || a.type !== 'series') return res.json({ folgen: [] });
  return folgenLiefern(res, a.tmdbId, nr, sprachWahl(req.query.lang));
});
router.get('/series/:tmdbId', GRENZE, async (req, res) => {
  const id = zahl(req.params.tmdbId);
  if (!(id > 0)) return res.status(400).json({ error: 'invalid_params' });
  return staffelnLiefern(res, id, sprachWahl(req.query.lang));
});
router.get('/series/:tmdbId/:nr', GRENZE, async (req, res) => {
  const id = zahl(req.params.tmdbId), nr = zahl(req.params.nr);
  if (!(id > 0) || !(nr >= 0 && nr < 200)) return res.status(400).json({ error: 'invalid_params' });
  return folgenLiefern(res, id, nr, sprachWahl(req.query.lang));
});

export default router;
