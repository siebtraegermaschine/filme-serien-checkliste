// Push-Versand ueber firebase-admin. AUS, solange PUSH_ENABLED nicht "1" ist
// UND FIREBASE_SERVICE_ACCOUNT (JSON des Dienstkontos) fehlt. Zum Einschalten:
// `npm i firebase-admin` im backend/, beide Variablen setzen. Das Paket wird
// erst dann dynamisch geladen, ohne Schluessel laeuft nichts und nichts kostet.
import { pool } from '../db/pool.js';

let messaging = null;
let versucht = false;

export function pushAktiv() {
  return process.env.PUSH_ENABLED === '1' && !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

async function dienst() {
  if (messaging || versucht) return messaging;
  versucht = true;
  try {
    const modul = 'firebase-admin';
    const admin = (await import(modul)).default;
    const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    messaging = admin.messaging(app);
  } catch (err) {
    console.error('[push] firebase-admin nicht nutzbar:', err.message);
  }
  return messaging;
}

// Eine gebuendelte Nachricht je Konto; kaputte Tokens werden entfernt.
export async function sendePush(userId, { titel, text, daten = {} }) {
  if (!pushAktiv()) return { gesendet: 0 };
  const { rows } = await pool.query('SELECT token FROM push_tokens WHERE user_id = $1 AND aktiv', [userId]);
  if (!rows.length) return { gesendet: 0 };
  const m = await dienst();
  if (!m) return { gesendet: 0 };
  const res = await m.sendEachForMulticast({
    tokens: rows.map((r) => r.token),
    notification: { title: titel, body: text },
    data: daten,
  });
  const tot = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') tot.push(rows[i].token);
  });
  if (tot.length) await pool.query('DELETE FROM push_tokens WHERE token = ANY($1)', [tot]);
  return { gesendet: res.successCount };
}
