import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const router = createAsyncRouter();

export function serializeTitle(row) {
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

  // Kein LIMIT: der Client baut aus dieser Antwort seinen kompletten Titel-Pool
  // (Suche, Watchlist-/Gesehen-Verknuepfung per title_id) -- ein Deckel wuerde
  // alphabetisch spaeter einsortierte Titel silent abschneiden. Frueher lag hier
  // ein LIMIT 5000, das seit der Discovery-Katalog-Erweiterung (~16.000 Titel)
  // dazu fuehrte, dass Titel wie "Unfamiliar" nie eine echte title_id vom Client
  // bekamen und ihr Watchlist-/Gesehen-Status nie dauerhaft gespeichert wurde.
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM titles ${where} ORDER BY title ASC`,
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

// Wird ausschließlich von der GitHub Action (discover-rated-titles.mjs) mit dem
// Secret TITLES_INGEST_SECRET aufgerufen -- kein Nutzer-Login, sondern
// Server-zu-Server-Authentifizierung per Bearer-Token (analog /api/streaming/ingest).
// Traegt alle Filme/Serien ab einer TMDB-Bewertung/Stimmenzahl-Schwelle dauerhaft
// in den Discovery-Pool ein (im Unterschied zu streaming_cache gibt es hier KEIN
// taegliches Loeschen -- diese Titel sollen fuer immer per Suche/"Aehnliche Titel"
// auffindbar bleiben, siehe Nutzer-Anforderung).
//
// Rein additiv/aktualisierend, absichtlich vorsichtig beim Ueberschreiben:
// - source='catalog'-Zeilen werden NIE angefasst (Katalog ist manuell kuratiert).
// - `keywords` wird nie ueberschrieben (enthaelt ggf. von Hand/Skript uebersetzte
//   deutsche Hashtags; TMDB-Keywords sind ohnehin nur englisch verfuegbar, siehe
//   apply-keyword-translation.mjs -- neue Zeilen bekommen bewusst KEINE Keywords,
//   das Frontend faellt dafuer automatisch auf das (bereits deutsche) Genre zurueck).
// - `plot` wird nur ueberschrieben, wenn der neue Wert nicht leer ist (schuetzt
//   von Hand recherchierte Kurzbeschreibungen, siehe backfill-overviews.mjs).
router.post('/bulk-ingest', async (req, res) => {
  const expected = process.env.TITLES_INGEST_SECRET;
  const provided = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'invalid_ingest_secret' });
  }

  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    for (const item of items) {
      if (!item || !item.tmdbId || (item.type !== 'movie' && item.type !== 'series') || !item.title) continue;
      const { rowCount } = await client.query(
        `INSERT INTO titles (tmdb_id, type, title, year, genres, director, cast_names, keywords, poster_path, rating, plot, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'{}',$8,$9,$10,'discovery')
         ON CONFLICT (tmdb_id) DO UPDATE SET
           year = EXCLUDED.year,
           genres = EXCLUDED.genres,
           director = EXCLUDED.director,
           cast_names = EXCLUDED.cast_names,
           poster_path = EXCLUDED.poster_path,
           rating = EXCLUDED.rating,
           plot = COALESCE(NULLIF(EXCLUDED.plot, ''), titles.plot),
           updated_at = now()
         WHERE titles.source <> 'catalog'`,
        [
          item.tmdbId,
          item.type,
          String(item.title).trim(),
          item.year || null,
          Array.isArray(item.genres) ? item.genres : [],
          item.director || null,
          Array.isArray(item.cast) ? item.cast : [],
          item.posterPath || null,
          item.rating != null ? item.rating : null,
          item.plot || null,
        ]
      );
      inserted += rowCount;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ processed: items.length, written: inserted });
});

export default router;
