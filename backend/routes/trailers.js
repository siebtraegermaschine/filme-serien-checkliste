import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { resolveTmdbId } from './watchProviders.js';

const router = createAsyncRouter();

const API = 'https://api.themoviedb.org/3';
const LANG = process.env.TMDB_LANG || 'de-DE';
// Trailer wechseln praktisch nie -- deutlich laenger gueltig als die
// Verfuegbarkeit bei den Anbietern.
const TTL_HOURS = Number(process.env.TRAILER_TTL_HOURS || 24 * 30);

const TMDB_KIND = { movie: 'movie', series: 'tv' };

// TMDB liefert unter /videos alles bunt gemischt: offizielle Trailer, Teaser,
// herausgeschnittene Szenen, Making-ofs. Ohne Auswahl landet man schnell bei
// einem 15-Sekunden-Schnipsel statt beim Trailer. Kleinere Zahl = besser.
function bewerten(v) {
  const typRang = { Trailer: 0, Teaser: 1, Clip: 2, Featurette: 3 };
  if (!(v.type in typRang)) return null;          // Making-of & Co. gar nicht erst
  if (v.site !== 'YouTube') return null;          // nur YouTube ist einbettbar
  if (!v.key) return null;
  return typRang[v.type] * 10 + (v.official ? 0 : 5);
}

function besterTrailer(listen) {
  let best = null, bestRang = Infinity;
  // listen kommt in Wunschreihenfolge (deutsch zuerst); bei gleichem Rang
  // gewinnt dadurch die fruehere Liste.
  listen.forEach((liste, listenIndex) => {
    for (const v of liste) {
      const r = bewerten(v);
      if (r === null) continue;
      const gesamt = listenIndex * 100 + r;
      if (gesamt < bestRang) { bestRang = gesamt; best = v; }
    }
  });
  return best;
}

async function videosHolen(kind, tmdbId, sprache) {
  const url = new URL(`${API}/${kind}/${tmdbId}/videos`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  if (sprache) url.searchParams.set('language', sprache);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return (await res.json()).results || [];
}

function antwort(row) {
  return { key: row ? row.video_key : null, name: row ? row.video_name : null };
}

async function trailerAusliefern(res, type, tmdbId) {
  const { rows } = await pool.query(
    'SELECT * FROM title_videos_cache WHERE tmdb_id = $1 AND type = $2',
    [tmdbId, type]
  );
  const cached = rows[0];
  if (cached) {
    const alterStunden = (Date.now() - new Date(cached.fetched_at).getTime()) / 3_600_000;
    if (alterStunden < TTL_HOURS) return res.json(antwort(cached));
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) return res.json(antwort(cached || null));

  let best = null;
  try {
    // Deutsch zuerst, sonst die Standardsprache (meist englisch) -- gerade
    // aeltere und internationale Titel haben oft nur einen englischen Trailer.
    const [de, fallback] = await Promise.all([
      videosHolen(TMDB_KIND[type], tmdbId, LANG),
      videosHolen(TMDB_KIND[type], tmdbId, null),
    ]);
    best = besterTrailer([de, fallback]);
  } catch (err) {
    console.error(`trailers: TMDB-Abruf fehlgeschlagen (${type}/${tmdbId}):`, err.message);
    // Lieber einen veralteten Treffer ausliefern als gar keinen; ohne
    // Cache-Eintrag faellt die App auf die YouTube-Suche zurueck.
    return res.json(antwort(cached || null));
  }

  await pool.query(
    `INSERT INTO title_videos_cache (tmdb_id, type, video_key, video_name, fetched_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (tmdb_id, type) DO UPDATE SET
       video_key = EXCLUDED.video_key, video_name = EXCLUDED.video_name, fetched_at = now()`,
    [tmdbId, type, best ? best.key : null, best ? best.name : null]
  );
  res.json({ key: best ? best.key : null, name: best ? best.name : null });
}

// Beide Zugaenge wie bei den Anbietern: ueber die TMDB-ID direkt, oder ueber die
// interne Titel-ID fuer Katalog-Titel, deren TMDB-ID erst aufgeloest werden muss.
router.get('/by-title/:titleId', async (req, res) => {
  const titleId = Number.parseInt(req.params.titleId, 10);
  if (!Number.isInteger(titleId) || titleId <= 0) return res.status(400).json({ error: 'invalid_params' });
  const aufgeloest = await resolveTmdbId(titleId);
  if (!aufgeloest || !aufgeloest.tmdbId) return res.json({ key: null, name: null });
  return trailerAusliefern(res, aufgeloest.type, aufgeloest.tmdbId);
});

router.get('/:type/:tmdbId', async (req, res) => {
  const { type } = req.params;
  const tmdbId = Number.parseInt(req.params.tmdbId, 10);
  if (!TMDB_KIND[type] || !Number.isInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({ error: 'invalid_params' });
  }
  return trailerAusliefern(res, type, tmdbId);
});

export default router;
