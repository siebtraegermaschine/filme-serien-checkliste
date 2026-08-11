import { pool } from '../db/pool.js';
import { sendMail } from '../lib/mailer.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { speichereFeedback, MAX_LENGTH } from '../lib/feedback.js';
import { mengenGrenze } from '../middleware/rateLimit.js';

const router = createAsyncRouter();

// Empfaenger bewusst hier und nicht in .env: Er gehoert zur Anwendung, nicht
// zur Umgebung -- lokal wie in Produktion soll dieselbe Adresse gelten.
const FEEDBACK_TO = 'info@digital-wings.com';

// Oeffentlich, kein Login noetig -- das Feedback-Formular im Nav-Menue ist
// bewusst niedrigschwellig (nur Textfeld + Absenden). Ist die Person eingeloggt,
// wird ihre E-Mail zur besseren Zuordnung automatisch mitgeschickt, ohne dass
// dafuer ein zusaetzliches Formularfeld noetig ist.
router.post('/', mengenGrenze({ name: 'feedback', anzahl: 5, minuten: 60 }), async (req, res) => {
  const { message } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'invalid_message' });
  }
  const text = message.trim().slice(0, MAX_LENGTH);

  let email = null;
  if (req.session && req.session.userId) {
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.session.userId]);
    if (rows[0]) email = rows[0].email;
  }
  const fromLine = email || 'Anonym (nicht angemeldet)';

  // Erst in die Datenbank -- scheitert das, bricht die Anfrage ab und die
  // Person sieht einen Fehler, statt eine verlorene Nachricht fuer gesendet zu
  // halten.
  await speichereFeedback({ nachricht: text, userId: req.session?.userId ?? null, email });

  // Die Mail ist ab hier nur noch die Benachrichtigung. Scheitert sie, ist die
  // Rueckmeldung trotzdem gesichert und ueber `npm run feedback` zu lesen --
  // deshalb wird der Fehler protokolliert und nicht nach vorne gereicht.
  try {
    await sendMail({
      to: FEEDBACK_TO,
      subject: 'MovieMatch – Feedback',
      text: `Von: ${fromLine}\n\n${text}`,
    });
  } catch (err) {
    console.error('[feedback] Mailversand fehlgeschlagen, Rueckmeldung ist gespeichert:', err.message);
  }

  res.status(204).end();
});

export default router;
