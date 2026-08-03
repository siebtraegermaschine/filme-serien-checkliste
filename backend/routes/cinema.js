import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const router = createAsyncRouter();

function rowToCand(row) {
  return {
    id: String(row.tmdb_id),
    t: row.title,
    y: row.year,
    g: row.genres,
    d: row.director,
    c: row.cast_names,
    p: row.poster_path,
    r: row.rating != null ? Number(row.rating) : null,
    // vc/fsk fehlten hier, obwohl cinema_cache beide Spalten fuehrt (alle 545
    // Zeilen haben eine Stimmenzahl, 180 eine Freigabe). Die Folgen im Frontend:
    // gewichteteNote() wertete jeden Kinotitel ohne Stimmenzahl auf glatt 6,760,
    // "Sortieren nach TMDB-Bewertung" ergab damit eine beliebige Reihenfolge --
    // und fskErlaubt() zaehlt eine fehlende Freigabe als unbelegt, wodurch ein
    // aktiver Altersfilter die Kino-Seite vollstaendig leerte.
    vc: row.vote_count,
    fsk: row.certification,
    ov: row.overview,
    rd: row.release_date ? row.release_date.toISOString().slice(0, 10) : null,
    ord: row.original_release_date ? row.original_release_date.toISOString().slice(0, 10) : null,
  };
}

// Öffentlich, kein Login nötig -- analog zu /api/streaming. "now" nach Kinostart
// absteigend (neueste zuerst), "soon"/"later" aufsteigend (bald startende zuerst).
router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM cinema_cache ORDER BY release_date`);
  const buckets = { now: [], soon: [], later: [] };
  for (const row of rows) {
    if (buckets[row.category]) buckets[row.category].push(rowToCand(row));
  }
  buckets.now.reverse();
  res.json(buckets);
});

// Wird ausschließlich von der GitHub Action (cinema-fetch.mjs) mit dem Secret
// CINEMA_INGEST_SECRET aufgerufen -- kein Nutzer-Login, sondern Server-zu-
// Server-Authentifizierung per Bearer-Token (analog /api/streaming/ingest).
router.post('/ingest', async (req, res) => {
  const expected = process.env.CINEMA_INGEST_SECRET;
  const provided = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'invalid_ingest_secret' });
  }

  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // clock_timestamp() statt now(): now() bliebe fuer die GESAMTE Transaktion
    // auf den Start eingefroren (Transaktions-Zeitstempel) -- damit haetten die
    // gerade eingefuegten/aktualisierten Zeilen denselben (oder sogar einen
    // fruoeheren) fetched_at-Wert wie runStartedAt, und der DELETE-Cleanup
    // weiter unten haette JEDEN gerade uebertragenen Titel sofort wieder
    // geloescht (genau das ist beim ersten echten Import passiert: 537
    // uebertragene Titel, hinterher 0 Zeilen in cinema_cache).
    const { rows: [{ now: runStartedAt }] } = await client.query('SELECT clock_timestamp() AS now');
    for (const item of items) {
      if (!item || !item.tmdbId || !item.title || !item.category) continue;
      await client.query(
        `INSERT INTO cinema_cache
           (tmdb_id, title, year, genres, director, cast_names, poster_path, rating, vote_count, certification, overview, release_date, category, original_release_date, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, clock_timestamp())
         ON CONFLICT (tmdb_id) DO UPDATE SET
           title = EXCLUDED.title, year = EXCLUDED.year, genres = EXCLUDED.genres,
           director = EXCLUDED.director, cast_names = EXCLUDED.cast_names,
           poster_path = EXCLUDED.poster_path, rating = EXCLUDED.rating,
           vote_count = EXCLUDED.vote_count,
           certification = EXCLUDED.certification,
           overview = COALESCE(NULLIF(EXCLUDED.overview, ''), cinema_cache.overview),
           release_date = EXCLUDED.release_date, category = EXCLUDED.category,
           original_release_date = EXCLUDED.original_release_date,
           fetched_at = clock_timestamp()`,
        [
          item.tmdbId,
          item.title,
          item.year || null,
          Array.isArray(item.genres) ? item.genres : [],
          item.director || null,
          Array.isArray(item.cast) ? item.cast : [],
          item.posterPath || null,
          item.rating != null ? item.rating : null,
          item.voteCount != null ? item.voteCount : null,
          item.certification || null,
          item.overview || null,
          item.releaseDate || null,
          item.category,
          item.originalReleaseDate || null,
        ]
      );
    }
    await client.query('DELETE FROM cinema_cache WHERE fetched_at < $1', [runStartedAt]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.status(204).end();
});

export default router;
