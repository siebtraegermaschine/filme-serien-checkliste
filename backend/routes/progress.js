import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { zehnTitelPruefen } from '../lib/metrik.js';
import { track } from '../lib/track.js';

const router = createAsyncRouter();
router.use(requireAuth);

// Gibt ausschließlich den Fortschritt des eingeloggten Nutzers zurück -- der
// user_id-Wert kommt aus der Session, niemals aus Client-Eingaben.
// tmdbId/type sind mit dabei, damit das Frontend Streaming-Tab-Einträge (die
// nur eine tmdb_id kennen, noch keine interne title_id) trotzdem gegen den
// gespeicherten Fortschritt abgleichen kann.
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT up.title_id, up.seen, up.watchlist, up.via_stream, up.rating, up.pinned_category, t.tmdb_id, t.type
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
      pinnedCategory: r.pinned_category,
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
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 10)) {
    return res.status(400).json({ error: 'invalid_rating' });
  }
  // pinnedCategory braucht eine eigene "wurde mitgeschickt?"-Erkennung: anders
  // als bei den booleschen Feldern ist hier NULL selbst der gewollte Wert
  // ("loesen") -- COALESCE(neu, alt) wie bei den anderen Feldern wuerde ein
  // Loesen also stillschweigend ignorieren.
  const pinnedCategoryGesetzt = Object.prototype.hasOwnProperty.call(req.body || {}, 'pinnedCategory');
  const pinnedCategory = pinnedCategoryGesetzt ? (req.body.pinnedCategory ?? null) : null;
  if (pinnedCategoryGesetzt && pinnedCategory !== null && !['movie', 'series', 'cinema'].includes(pinnedCategory)) {
    return res.status(400).json({ error: 'invalid_pinned_category' });
  }

  const { rows: titleRows } = await pool.query(`SELECT id FROM titles WHERE id = $1`, [titleId]);
  if (!titleRows[0]) {
    return res.status(404).json({ error: 'title_not_found' });
  }

  let rows;
  try {
    ({ rows } = await pool.query(
      `INSERT INTO user_progress (user_id, title_id, seen, watchlist, via_stream, rating, pinned_category)
       VALUES ($1, $2, COALESCE($3, false), COALESCE($4, false), COALESCE($5, false), $6, CASE WHEN $8 THEN $7 ELSE NULL END)
       ON CONFLICT (user_id, title_id) DO UPDATE SET
         seen = COALESCE($3, user_progress.seen),
         watchlist = COALESCE($4, user_progress.watchlist),
         via_stream = COALESCE($5, user_progress.via_stream),
         rating = COALESCE($6, user_progress.rating),
         pinned_category = CASE WHEN $8 THEN $7 ELSE user_progress.pinned_category END,
         updated_at = now()
       RETURNING title_id, seen, watchlist, via_stream, rating, pinned_category`,
      [req.session.userId, titleId, seen ?? null, watchlist ?? null, viaStream ?? null, rating ?? null, pinnedCategory, pinnedCategoryGesetzt]
    ));
  } catch (err) {
    // Wettlauf zweier Geraete um dieselbe Pin-Kategorie -- das Frontend
    // deaktiviert den Knopf zwar, sobald eine Kategorie belegt ist, aber das
    // ist kein Ersatz fuer die harte Garantie durch den Unique-Index.
    if (err.code === '23505' && err.constraint === 'user_progress_pinned_unique') {
      return res.status(409).json({ error: 'pin_slot_taken' });
    }
    throw err;
  }

  // Anonymer Trichter-Schritt "zehn Titel erreicht" -- ohne await, das
  // Zaehlen darf das Speichern nicht verzoegern (siehe lib/metrik.js).
  zehnTitelPruefen(req.session.userId);

  // KPI title_rated (docs/kpi.md): nur ausdrueckliche POSITIV-Markierungen im
  // Body zaehlen (gesehen, Watchlist, Sterne) -- das blosse Anlegen der Zeile
  // ("+ Liste") und das Entfernen von Marken sind keine Bewertung. Eine
  // Meldung je Aufruf, sonst zaehlte "gesehen + Sterne" doppelt.
  const verdict = seen === true ? 'seen'
    : watchlist === true ? 'watchlist'
    : Number.isInteger(rating) ? 'stars'
    : null;
  if (verdict) {
    track('title_rated', {
      userId: req.session.userId,
      anonId: req.anonId,
      props: { title_id: titleId, verdict },
    });
  }

  res.json({
    titleId: rows[0].title_id,
    seen: rows[0].seen,
    watchlist: rows[0].watchlist,
    viaStream: rows[0].via_stream,
    rating: rows[0].rating,
    pinnedCategory: rows[0].pinned_category,
  });
});

export default router;
