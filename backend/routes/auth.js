import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { sendPasswordResetMail } from '../lib/mailer.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { WIDERRUFSFRIST_TAGE } from '../lib/kontoAufraeumen.js';

const router = createAsyncRouter();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 Stunde

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || null,
    // Gesetzt, solange eine beantragte Loeschung noch widerrufbar ist. Das
    // Frontend zeigt daraufhin den Hinweis samt Widerrufs-Knopf.
    deletionRequestedAt: row.deletion_requested_at ? row.deletion_requested_at.toISOString() : null,
    deletionDays: WIDERRUFSFRIST_TAGE,
  };
}

/* Wer hat wen geworben? Kommt als Token aus dem Link, ueber den die Person in
   der App gelandet ist -- "Personen einladen" (?ref=) genauso wie "Watchliste
   teilen" (?einladung=). Rein statistisch: Die Verknuepfung der Listen
   entsteht davon NICHT, die verlangt weiterhin das ausdrueckliche Annehmen.
   Ein unbekannter oder abgelaufener Token ist kein Fehler -- dann bleibt der
   Vermerk einfach leer, statt die Registrierung scheitern zu lassen. */
async function werberFinden(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await pool.query(
    'SELECT inviter_id FROM user_link_invites WHERE token_hash = $1',
    [hash]
  );
  return rows[0] ? rows[0].inviter_id : null;
}

router.post('/register', async (req, res) => {
  const { email, password, displayName, inviteToken } = req.body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'weak_password' });
  }
  // Pflichtfeld, weil verknuepfte Profile sonst namenlos in der Liste stehen.
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (!name || name.length > 40) {
    return res.status(400).json({ error: 'invalid_display_name' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const werber = await werberFinden(inviteToken);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, display_name, invited_by_user_id) VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, deletion_requested_at`,
      [normalizedEmail, passwordHash, name, werber]
    );
    req.session.userId = rows[0].id;
    res.status(201).json(publicUser(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'email_taken' });
    }
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'invalid_credentials' });
  }

  const { rows } = await pool.query(
    `SELECT id, email, display_name, password_hash, deletion_requested_at FROM users WHERE email = $1`,
    [email.trim().toLowerCase()]
  );
  const user = rows[0];
  // Bewusst konstante Fehlermeldung + immer bcrypt.compare aufrufen (auch bei
  // unbekannter E-Mail gegen einen Dummy-Hash), um Timing-/Enumeration-Angriffe
  // auf existierende Accounts zu erschweren.
  const hashToCompare = user?.password_hash || '$2b$12$invalidsaltinvalidsaltinvalidsalthashvalue1234567890ab';
  const ok = await bcrypt.compare(password, hashToCompare);

  if (!user || !ok) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  req.session.userId = user.id;
  res.json(publicUser(user));
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('fs.sid');
    res.status(204).end();
  });
});

router.get('/me', async (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'not_authenticated' });
  }
  const { rows } = await pool.query(`SELECT id, email, display_name, deletion_requested_at FROM users WHERE id = $1`, [req.session.userId]);
  if (!rows[0]) {
    return res.status(401).json({ error: 'not_authenticated' });
  }
  res.json(publicUser(rows[0]));
});

// Anzeigename setzen oder aendern. Konten aus der Zeit vor dieser Funktion
// haben keinen -- die App fragt beim naechsten Besuch einmalig nach.
router.put('/display-name', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'not_authenticated' });
  const { displayName } = req.body || {};
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (!name || name.length > 40) return res.status(400).json({ error: 'invalid_display_name' });
  const { rows } = await pool.query(
    'UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, email, display_name, deletion_requested_at',
    [name, req.session.userId]
  );
  res.json(publicUser(rows[0]));
});

router.post('/request-password-reset', async (req, res) => {
  const { email } = req.body || {};
  if (typeof email === 'string' && EMAIL_RE.test(email)) {
    const normalizedEmail = email.trim().toLowerCase();
    const { rows } = await pool.query(`SELECT id, email FROM users WHERE email = $1`, [normalizedEmail]);
    const user = rows[0];
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      );
      const resetUrl = `${process.env.APP_BASE_URL || ''}/reset-password?token=${rawToken}`;
      await sendPasswordResetMail({ to: user.email, resetUrl });
    }
  }
  // Immer identische Antwort, unabhängig davon ob die E-Mail existiert
  // (verhindert Account-Enumeration über diesen Endpoint).
  res.status(202).json({ ok: true });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await pool.query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash]
  );
  const tokenRow = rows[0];
  if (!tokenRow) {
    return res.status(400).json({ error: 'invalid_or_expired_token' });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, tokenRow.user_id]);
    await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE id = $1`, [tokenRow.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.status(204).end();
});

// Aenderungen an Passwort/E-Mail verlangen bewusst das aktuelle Passwort erneut
// (nicht nur die laufende Session) -- Schutz falls ein Geraet/Session-Cookie in
// falsche Haende geraet (z.B. gemeinsam genutztes Geraet). Der Nutzer hatte das
// nicht explizit gefordert, ist aber Standard-Sicherheitspraxis fuer sensible
// Account-Aenderungen.
router.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [req.session.userId]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(currentPassword, user.password_hash));
  if (!ok) {
    return res.status(401).json({ error: 'wrong_current_password' });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, req.session.userId]);
  res.status(204).end();
});

router.put('/email', requireAuth, async (req, res) => {
  const { currentPassword, newEmail } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newEmail !== 'string' || !EMAIL_RE.test(newEmail)) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [req.session.userId]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(currentPassword, user.password_hash));
  if (!ok) {
    return res.status(401).json({ error: 'wrong_current_password' });
  }

  const normalizedEmail = newEmail.trim().toLowerCase();
  try {
    const { rows: updated } = await pool.query(
      `UPDATE users SET email = $1 WHERE id = $2 RETURNING id, email, display_name, deletion_requested_at`,
      [normalizedEmail, req.session.userId]
    );
    res.json(publicUser(updated[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'email_taken' });
    }
    throw err;
  }
});

// Loeschung des Kontos BEANTRAGEN. Verlangt wie Passwort- und E-Mail-Aenderung
// das aktuelle Passwort erneut -- ein fremdes Geraet mit offener Sitzung soll
// das Konto nicht ausloeschen koennen.
//
// Bewusst keine sofortige Loeschung: Es bleiben WIDERRUFSFRIST_TAGE Tage, in
// denen sich der Antrag durch erneutes Anmelden zurueckziehen laesst. Die Daten
// bleiben so lange unveraendert; erst der Aufraeumlauf entfernt sie endgueltig
// (siehe lib/kontoAufraeumen.js). Alle Sitzungen werden sofort beendet, damit
// niemand mit einem offenen Fenster weiterarbeitet, ohne den Antrag zu kennen.
router.delete('/account', requireAuth, async (req, res) => {
  const { currentPassword } = req.body || {};
  if (typeof currentPassword !== 'string') {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [req.session.userId]);
  const user = rows[0];
  const ok = user && (await bcrypt.compare(currentPassword, user.password_hash));
  if (!ok) {
    return res.status(401).json({ error: 'wrong_current_password' });
  }

  const userId = req.session.userId;
  const { rows: [beantragt] } = await pool.query(
    `UPDATE users SET deletion_requested_at = now() WHERE id = $1 RETURNING deletion_requested_at`,
    [userId]
  );
  await pool.query(`DELETE FROM session WHERE sess->>'userId' = $1`, [String(userId)]);

  const faellig = new Date(beantragt.deletion_requested_at.getTime() + WIDERRUFSFRIST_TAGE * 86400000);
  req.session.destroy(() => {
    res.clearCookie('fs.sid');
    res.json({ deletionRequestedAt: beantragt.deletion_requested_at.toISOString(),
               deletionDueAt: faellig.toISOString(),
               deletionDays: WIDERRUFSFRIST_TAGE });
  });
});

// Beantragte Loeschung zuruecknehmen. Kein Passwort noetig -- wer angemeldet
// ist, hat es gerade eingegeben, und eine zusaetzliche Huerde beim Widerruf
// waere die falsche Richtung.
router.post('/account/restore', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE users SET deletion_requested_at = NULL WHERE id = $1
     RETURNING id, email, display_name, deletion_requested_at`,
    [req.session.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json(publicUser(rows[0]));
});

export default router;
