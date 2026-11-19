import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { mengenGrenze } from '../middleware/rateLimit.js';

const router = createAsyncRouter();
router.use(requireAuth);
const GRENZE = mengenGrenze({ name: 'push', anzahl: 30, minuten: 10 });

// Token (neu) eintragen. aktiv=true erst, wenn die Person Push in der App wirklich
// angeschaltet hat; ein Token wandert zum zuletzt angemeldeten Konto.
router.post('/register', GRENZE, async (req, res) => {
  const { token, plattform, aktiv } = req.body || {};
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096 || !['ios', 'android'].includes(plattform)) {
    return res.status(400).json({ error: 'invalid_push_token' });
  }
  await pool.query(
    `INSERT INTO push_tokens (user_id, token, plattform, aktiv) VALUES ($1,$2,$3,$4)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, plattform = EXCLUDED.plattform, aktiv = EXCLUDED.aktiv`,
    [req.userId, token, plattform, aktiv === true]
  );
  res.json({ ok: true });
});

router.post('/unregister', GRENZE, async (req, res) => {
  const { token } = req.body || {};
  if (typeof token !== 'string') return res.status(400).json({ error: 'invalid_push_token' });
  await pool.query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [token, req.userId]);
  res.json({ ok: true });
});

export default router;
