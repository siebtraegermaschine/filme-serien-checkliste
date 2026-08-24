/*
 * Web-Push-Abos (24.08.2026): kontofrei wie der ganze Sport-Bereich -- das
 * Abo gehoert dem Geraet (der PushSubscription des Browsers), identifiziert
 * ueber seinen Endpoint. Versand: lib/sportPush.js, Krypto: lib/webpush.js.
 */
import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { ladeVapid, jwkZuRohpunkt, b64url } from '../lib/webpush.js';
import { ARTEN } from '../lib/sportPush.js';
import { mengenGrenze } from '../middleware/rateLimit.js';

const router = createAsyncRouter();

// Oeffentlicher VAPID-Schluessel fuer PushManager.subscribe (base64url des
// unkomprimierten P-256-Punkts). Entsteht beim allerersten Abruf.
router.get('/vapid', async (_req, res) => {
  const jwks = await ladeVapid(pool);
  res.json({ key: b64url(jwkZuRohpunkt(jwks.privat)) });
});

const B64URL = /^[A-Za-z0-9_-]{10,300}$/;

function sauberesAbo(body) {
  const { endpoint, p256dh, auth, vereine, arten } = body || {};
  if (typeof endpoint !== 'string' || !/^https:\/\/[^\s]{10,900}$/.test(endpoint)) return null;
  if (typeof p256dh !== 'string' || !B64URL.test(p256dh)) return null;
  if (typeof auth !== 'string' || !B64URL.test(auth)) return null;
  if (!Array.isArray(vereine) || !Array.isArray(arten)) return null;
  const namen = [...new Set(vereine.map((v) => String(v).trim()).filter((v) => v && v.length <= 80))].slice(0, 3);
  // Nur bekannte Zeitstufen (lib/sportPush.js) -- in der Reihenfolge des
  // Katalogs, damit gleiche Auswahlen gleich aussehen.
  const stufen = ARTEN.filter((a) => arten.indexOf(a) !== -1);
  return { endpoint, p256dh, auth, vereine: namen, arten: stufen };
}

// Anlegen ODER aktualisieren (z.B. neue Vereinsauswahl) -- der Endpoint ist
// der Schluessel. Ein Abo ohne Vereine waere nutzlos und wird abgelehnt.
router.post('/abo', mengenGrenze({ name: 'push', anzahl: 30, minuten: 10 }), async (req, res) => {
  const abo = sauberesAbo(req.body);
  // Ohne Verein oder ohne gewaehlte Zeitstufe gaebe es nichts zu schicken --
  // das Frontend bestellt in dem Fall ab (DELETE), statt ein taubes Abo
  // anzulegen.
  if (!abo || !abo.vereine.length || !abo.arten.length) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  // Angemeldet: Abo dem Konto zuordnen -- dann zieht eine geaenderte
  // Vereinsauswahl alle Geraete dieser Person nach (PUT /api/sport/ansicht).
  // Ohne Konto bleibt user_id NULL und das Abo gehoert nur diesem Geraet.
  const userId = req.session.userId || null;
  await pool.query(
    `INSERT INTO push_abos (endpoint, p256dh, auth, vereine, arten, user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET
       p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, vereine = EXCLUDED.vereine,
       arten = EXCLUDED.arten, user_id = EXCLUDED.user_id`,
    [abo.endpoint, abo.p256dh, abo.auth, abo.vereine, abo.arten, userId]);
  // Angemeldet: Auswahl ans Konto, damit das naechste Geraet sie schon
  // vorgemerkt vorfindet (siehe GET /api/sport/ansicht).
  if (userId) {
    await pool.query('UPDATE users SET sport_push_arten = $1 WHERE id = $2', [abo.arten, userId]);
  }
  res.status(204).end();
});

// Abbestellen. Kein Fehler bei unbekanntem Endpoint -- Ziel ist "weg", und
// das ist es dann ja.
router.delete('/abo', mengenGrenze({ name: 'push', anzahl: 30, minuten: 10 }), async (req, res) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return res.status(400).json({ error: 'invalid_payload' });
  await pool.query('DELETE FROM push_abos WHERE endpoint = $1', [endpoint]);
  res.status(204).end();
});

export default router;
