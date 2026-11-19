import crypto from 'node:crypto';
import { pool } from '../db/pool.js';

// Token-Anmeldung der nativen Apps. Undurchsichtiger Zufallswert (kein JWT),
// damit er serverseitig widerrufbar bleibt. SHA-256 statt bcrypt: Der Token
// wird bei jeder Anfrage geprueft und hat 256 Bit Entropie.
export const TOKEN_TAGE = 90;
const TOKEN_RE = /^[a-f0-9]{64}$/;
// Die Frist wird hoechstens einmal pro Stunde verlaengert, damit nicht jede
// Anfrage einen Schreibzugriff ausloest.
const AUFFRISCHEN_NACH_MS = 60 * 60 * 1000;

const hashVon = (klartext) => crypto.createHash('sha256').update(klartext).digest('hex');

export const istNativ = (req) => req.get?.('x-client') === 'native';

export async function erzeugeToken(userId, plattform, geraet) {
  const klartext = crypto.randomBytes(32).toString('hex');
  const p = ['ios', 'android'].includes(plattform) ? plattform : null;
  const g = typeof geraet === 'string' ? geraet.trim().slice(0, 80) || null : null;
  await pool.query(
    `INSERT INTO auth_tokens (user_id, token_hash, plattform, geraet, laeuft_ab_am)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [userId, hashVon(klartext), p, g, String(TOKEN_TAGE)]
  );
  return klartext;
}

// Liefert { id, userId } oder null. Verlaengert die Frist gleitend.
export async function pruefeToken(klartext) {
  if (typeof klartext !== 'string' || !TOKEN_RE.test(klartext)) return null;
  const { rows } = await pool.query(
    `SELECT id, user_id, zuletzt_am FROM auth_tokens
      WHERE token_hash = $1 AND laeuft_ab_am > now()`,
    [hashVon(klartext)]
  );
  const t = rows[0];
  if (!t) return null;
  if (Date.now() - new Date(t.zuletzt_am).getTime() > AUFFRISCHEN_NACH_MS) {
    // Fehlschlag darf die Anfrage nicht stoeren.
    pool.query(
      `UPDATE auth_tokens SET zuletzt_am = now(), laeuft_ab_am = now() + ($2 || ' days')::interval WHERE id = $1`,
      [t.id, String(TOKEN_TAGE)]
    ).catch((err) => console.error('tokenAuth: Auffrischen fehlgeschlagen:', err.message));
  }
  return { id: t.id, userId: t.user_id };
}

export const bearerAus = (req) => {
  const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  return m ? m[1] : null;
};

export async function widerrufeToken(userId, id) {
  const { rowCount } = await pool.query(`DELETE FROM auth_tokens WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rowCount > 0;
}

export async function widerrufeAlle(userId, executor = pool) {
  await executor.query(`DELETE FROM auth_tokens WHERE user_id = $1`, [userId]);
}

export async function listeGeraete(userId) {
  const { rows } = await pool.query(
    `SELECT id, plattform, geraet, erstellt_am, zuletzt_am FROM auth_tokens
      WHERE user_id = $1 AND laeuft_ab_am > now() ORDER BY zuletzt_am DESC`,
    [userId]
  );
  return rows.map((r) => ({ id: String(r.id), plattform: r.plattform, geraet: r.geraet,
    erstelltAm: r.erstellt_am.toISOString(), zuletztAm: r.zuletzt_am.toISOString() }));
}
