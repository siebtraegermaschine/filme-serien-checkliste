import { pool } from '../db/pool.js';
import { sendMail } from '../lib/mailer.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const router = createAsyncRouter();

// Empfaenger bewusst hier und nicht in .env: Er gehoert zur Anwendung, nicht
// zur Umgebung -- lokal wie in Produktion soll dieselbe Adresse gelten.
const FEEDBACK_TO = 'info@digital-wings.com';
const MAX_LENGTH = 5000;

// Oeffentlich, kein Login noetig -- das Feedback-Formular im Nav-Menue ist
// bewusst niedrigschwellig (nur Textfeld + Absenden). Ist die Person eingeloggt,
// wird ihre E-Mail zur besseren Zuordnung automatisch mitgeschickt, ohne dass
// dafuer ein zusaetzliches Formularfeld noetig ist.
router.post('/', async (req, res) => {
  const { message } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'invalid_message' });
  }
  const text = message.trim().slice(0, MAX_LENGTH);

  let fromLine = 'Anonym (nicht angemeldet)';
  if (req.session && req.session.userId) {
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.session.userId]);
    if (rows[0]) fromLine = rows[0].email;
  }

  await sendMail({
    to: FEEDBACK_TO,
    subject: 'MovieMatch – Feedback',
    text: `Von: ${fromLine}\n\n${text}`,
  });

  res.status(204).end();
});

export default router;
