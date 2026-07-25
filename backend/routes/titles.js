import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const router = createAsyncRouter();

function serializeTitle(row) {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    type: row.type,
    title: row.title,
    originalTitle: row.original_title,
    year: row.year,
    genres: row.genres,
    director: row.director,
    cast: row.cast_names,
    keywords: row.keywords,
    rating: row.rating != null ? Number(row.rating) : null,
    plot: row.plot,
    posterPath: row.poster_path,
    posterBase64: row.poster_base64,
    source: row.source,
  };
}

// Öffentlich, kein Login nötig: der Katalog ist frei durchsuchbar (siehe
// konzept-relaunch.md Abschnitt 4). Login greift erst bei Schreibaktionen.
// ?source=catalog (Standard-Filme/Serien-Tab) bzw. ?source=discovery
// (Discovery-Pool) -- der Aufrufer entscheidet explizit, welcher Titel-Pool
// gemeint ist, damit der große Discovery-Pool nicht ungewollt im normalen
// Filme/Serien-Tab landet.
router.get('/', async (req, res) => {
  const { type, search, source } = req.query;
  const conditions = [];
  const params = [];

  if (type === 'movie' || type === 'series') {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  if (typeof source === 'string' && source.trim()) {
    const sources = source.split(',').map((s) => s.trim()).filter(Boolean);
    if (sources.length) {
      params.push(sources);
      conditions.push(`source = ANY($${params.length})`);
    }
  }
  if (typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`title ILIKE $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM titles ${where} ORDER BY title ASC LIMIT 5000`,
    params
  );
  res.json(rows.map(serializeTitle));
});

// Katalog-Titel (source='catalog', immer sichtbar) plus alle Titel, die die
// eingeloggte Person selbst aus Discovery/Streaming zu ihrer Liste hinzugefügt
// hat (erkennbar an einer vorhandenen user_progress-Zeile). Ersetzt
// FILME.concat(ADDED.f...) bzw. SERIEN.concat(ADDED.s...) aus der alten App --
// mit dem Unterschied, dass "hinzugefügt" jetzt korrekt user-spezifisch ist
// (vorher zufällig user-spezifisch, weil in localStorage).
router.get('/mine', requireAuth, async (req, res) => {
  const { type } = req.query;
  const params = [req.session.userId];
  let typeCondition = '';
  if (type === 'movie' || type === 'series') {
    params.push(type);
    typeCondition = `AND t.type = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT t.* FROM titles t
     WHERE (t.source = 'catalog' OR EXISTS (
       SELECT 1 FROM user_progress up WHERE up.title_id = t.id AND up.user_id = $1
     )) ${typeCondition}
     ORDER BY t.title ASC LIMIT 5000`,
    params
  );
  res.json(rows.map(serializeTitle));
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM titles WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json(serializeTitle(rows[0]));
});

// Legt einen Titel an, der bisher nur als Discovery-/Streaming-Kandidat
// existierte (TMDB-Daten, noch nicht im zentralen Katalog). Erfordert Login,
// da dies Teil einer Schreibaktion ist ("+ Liste" / Watchlist ab Streaming-Tab).
// Idempotent über tmdb_id: mehrfaches Aufrufen legt keinen Duplikat-Titel an.
router.post('/ensure', requireAuth, async (req, res) => {
  const {
    tmdbId,
    type,
    title,
    year,
    genres,
    director,
    cast,
    keywords,
    posterPath,
    rating,
    plot,
    source,
  } = req.body || {};

  if (!tmdbId || (type !== 'movie' && type !== 'series') || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'invalid_title_payload' });
  }

  const { rows } = await pool.query(
    `INSERT INTO titles (tmdb_id, type, title, year, genres, director, cast_names, keywords, poster_path, rating, plot, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       title = EXCLUDED.title,
       year = EXCLUDED.year,
       genres = EXCLUDED.genres,
       director = EXCLUDED.director,
       cast_names = EXCLUDED.cast_names,
       keywords = EXCLUDED.keywords,
       poster_path = EXCLUDED.poster_path,
       rating = EXCLUDED.rating,
       plot = EXCLUDED.plot,
       updated_at = now()
     RETURNING *`,
    [
      tmdbId,
      type,
      title.trim(),
      year || null,
      Array.isArray(genres) ? genres : [],
      director || null,
      Array.isArray(cast) ? cast : [],
      Array.isArray(keywords) ? keywords : [],
      posterPath || null,
      rating != null ? rating : null,
      plot || null,
      source === 'streaming' ? 'streaming' : 'discovery',
    ]
  );

  res.status(201).json(serializeTitle(rows[0]));
});

export default router;
