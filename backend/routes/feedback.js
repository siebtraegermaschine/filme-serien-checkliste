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
//
// Reihenfolge: ERST speichern, DANN mailen. Frueher war es umgekehrt und damit
// ungesichert -- schlug Resend fehl, war die Nachricht weg. Jetzt scheitert die
// Anfrage nur, wenn das Speichern scheitert; ein misslungener Versand wird
// protokolliert, die Person bekommt trotzdem ihr "Danke".
// Ein 500 an dieser Stelle waere schlechter: Die Nachricht liegt ja bereits
// sicher in der Datenbank, und wer einen Fehler sieht, schickt sie ein zweites
// Mal.
router.post('/', async (req, res) => {
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
  // Nur bei einem gefundenen Konto verknuepfen: Eine Sitzung kann auf ein
  // inzwischen geloeschtes Konto zeigen, und der Fremdschluessel liefe dann ins
  // Leere.
  const userId = email ? req.session.userId : null;

  const { rows: [zeile] } = await pool.query(
    `INSERT INTO feedback (nachricht, user_id, email) VALUES ($1, $2, $3) RETURNING id`,
    [text, userId, email]
  );

  const fromLine = email || 'Anonym (nicht angemeldet)';
  try {
    await sendMail({
      to: FEEDBACK_TO,
      subject: 'MovieMatch – Feedback',
      text: `Von: ${fromLine}\n\n${text}`,
    });
  } catch (err) {
    console.error(`[feedback] Versand fuer Nr. ${zeile.id} fehlgeschlagen:`, err.message);
  }

  res.status(204).end();
});

export default router;
