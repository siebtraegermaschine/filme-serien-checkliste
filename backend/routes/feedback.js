import { pool } from '../db/pool.js';
import { sendMail } from '../lib/mailer.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { limit } from '../middleware/limit.js';
import { melde } from '../lib/wache.js';

const router = createAsyncRouter();

// Ohne Anmeldung erreichbar und verschickt eine Mail -- also begrenzt (siehe
// middleware/limit.js). Fuenf Rueckmeldungen je Stunde und Adresse: Wer
// wirklich etwas zu sagen hat, kommt damit hin.
const GRENZE_FEEDBACK = limit('feedback', 5, 60);

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
router.post('/', GRENZE_FEEDBACK, async (req, res) => {
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
    // Der Wache melden -- die kann das jetzt naturgemaess nicht per Mail
    // hinausbringen und reicht es beim naechsten gelungenen Versand nach
    // (siehe lib/wache.js). Wichtig ist die Nummer: Danach laesst sich die
    // Nachricht mit `npm run feedback` wiederfinden.
    melde('mailversand', 'Mailversand fehlgeschlagen',
      `Feedback Nr. ${zeile.id} liegt in der Datenbank, die Mail ging nicht raus:\n${err.message}\n\n` +
      'Auslesen mit: npm run feedback').catch(() => {});
  }

  res.status(204).end();
});

export default router;
