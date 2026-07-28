import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const router = createAsyncRouter();
router.use(requireAuth);

// Gibt ausschließlich den Fortschritt des eingeloggten Nutzers zurück -- der
// user_id-Wert kommt aus der Session, niemals aus Client-Eingaben.
// tmdbId/type sind mit dabei, damit das Frontend Streaming-Tab-Einträge (die
// nur eine tmdb_id kennen, noch keine interne title_id) trotzdem gegen den
// gespeicherten Fortschritt abgleichen kann.
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT up.title_id, up.seen, up.watchlist, up.via_stream, up.rating, t.tmdb_id, t.type
     FROM user_progress up JOIN titles t ON t.id = up.title_id
     WHERE up.user_id = $1`,
    [req.session.userId]
  );
  res.json(
    rows.map((r) => ({
      titleId: r.title_id,
      seen: r.seen,
      watchlist: r.watchlist,
      viaStream: r.via_stream,
      rating: r.rating,
      tmdbId: r.tmdb_id,
      type: r.type,
    }))
  );
});

// Ohne seen/watchlist im Body legt dies nur eine Fortschritts-Zeile mit den
// Standardwerten (false/false) an, falls noch keine existiert -- genutzt vom
// "+ Liste"-Button in Discovery, der einen Titel nur zur eigenen Liste
// hinzufügen will, ohne direkt eine gesehen-/Watchlist-Angabe zu machen
// (siehe GET /api/titles/mine, das anhand der Zeilen-Existenz filtert).
router.put('/:titleId', async (req, res) => {
  const titleId = Number(req.params.titleId);
  if (!Number.isInteger(titleId)) {
    return res.status(400).json({ error: 'invalid_title_id' });
  }
  const { seen, watchlist, viaStream, rating } = req.body || {};
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return res.status(400).json({ error: 'invalid_rating' });
  }

  const { rows: titleRows } = await pool.query(`SELECT id FROM titles WHERE id = $1`, [titleId]);
  if (!titleRows[0]) {
    return res.status(404).json({ error: 'title_not_found' });
  }

  const { rows } = await pool.query(
    `INSERT INTO user_progress (user_id, title_id, seen, watchlist, via_stream, rating)
     VALUES ($1, $2, COALESCE($3, false), COALESCE($4, false), COALESCE($5, false), $6)
     ON CONFLICT (user_id, title_id) DO UPDATE SET
       seen = COALESCE($3, user_progress.seen),
       watchlist = COALESCE($4, user_progress.watchlist),
       via_stream = COALESCE($5, user_progress.via_stream),
       rating = COALESCE($6, user_progress.rating),
       updated_at = now()
     RETURNING title_id, seen, watchlist, via_stream, rating`,
    [req.session.userId, titleId, seen ?? null, watchlist ?? null, viaStream ?? null, rating ?? null]
  );

  res.json({ titleId: rows[0].title_id, seen: rows[0].seen, watchlist: rows[0].watchlist, viaStream: rows[0].via_stream, rating: rows[0].rating });
});

export default router;
