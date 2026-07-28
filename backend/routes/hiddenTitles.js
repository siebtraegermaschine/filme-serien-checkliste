import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { serializeTitle } from './titles.js';

const router = createAsyncRouter();

router.use(requireAuth);

// Titel, die diese Person per Swipe aus Discovery entfernt hat (siehe
// Einstellungen -> "Gelöschte Titel"). Voller Titel-Datensatz, damit die Seite
// genauso aussieht wie die normale Discovery-Ansicht (nur mit anderem Button).
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.* FROM user_hidden_titles h
     JOIN titles t ON t.id = h.title_id
     WHERE h.user_id = $1
     ORDER BY h.hidden_at DESC`,
    [req.session.userId]
  );
  res.json(rows.map(serializeTitle));
});

// Blendet einen Titel aus der eigenen Discovery-Ansicht aus (idempotent).
router.post('/:titleId', async (req, res) => {
  const titleId = Number(req.params.titleId);
  if (!Number.isInteger(titleId)) {
    return res.status(400).json({ error: 'invalid_title_id' });
  }
  await pool.query(
    `INSERT INTO user_hidden_titles (user_id, title_id) VALUES ($1, $2)
     ON CONFLICT (user_id, title_id) DO NOTHING`,
    [req.session.userId, titleId]
  );
  res.status(204).end();
});

// "Zu Discovery hinzufügen" -- macht das Ausblenden rueckgaengig.
router.delete('/:titleId', async (req, res) => {
  const titleId = Number(req.params.titleId);
  if (!Number.isInteger(titleId)) {
    return res.status(400).json({ error: 'invalid_title_id' });
  }
  await pool.query(
    `DELETE FROM user_hidden_titles WHERE user_id = $1 AND title_id = $2`,
    [req.session.userId, titleId]
  );
  res.status(204).end();
});

export default router;
