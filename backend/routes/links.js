import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const router = createAsyncRouter();

// Wie lange eine Einladung einloesbar bleibt. Bewusst begrenzt: ein
// weitergeleiteter Link wuerde sonst dauerhaft Zugriff auf die eigene
// Titelliste eroeffnen.
const INVITE_TTL_TAGE = Number(process.env.LINK_INVITE_TTL_DAYS || 7);

function hashOf(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Fuer andere sichtbarer Name. Ohne gesetzten Namen bleibt nur ein neutraler
// Platzhalter -- die E-Mail-Adresse waere hier die falsche Notloesung, die geht
// verknuepfte Profile nichts an.
function anzeigename(row) {
  return (row.display_name && row.display_name.trim()) || 'Unbenannt';
}

router.use(requireAuth);

// Eigene verknuepfte Profile.
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.display_name
       FROM user_links l JOIN users u ON u.id = l.linked_user_id
      WHERE l.user_id = $1
      ORDER BY lower(coalesce(u.display_name, '')), u.id`,
    [req.session.userId]
  );
  res.json(rows.map((r) => ({ id: r.id, name: anzeigename(r) })));
});

// Titellisten aller verknuepften Profile -- Grundlage fuer den Abgleich, den
// das Frontend dann genauso im Browser rechnet wie den eigenen Taste-Score.
//
// Die Sterne-Bewertung (r) ist dabei ausdruecklich mit enthalten: ohne sie
// zaehlte bei einer verknuepften Person jeder Titel gleich, ein mit 4 Sternen
// abgestrafter Film praegte ihr Profil also genauso stark wie ihr
// Lieblingsfilm -- der gemeinsame Taste-Score waere entsprechend ungenau.
// Siehe datenschutz.html Abschnitt 7, wo diese Uebermittlung beschrieben ist.
// Nicht uebermittelt werden weiterhin E-Mail-Adresse und Kontodaten.
router.get('/progress', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT l.linked_user_id, p.title_id, p.seen, p.watchlist, p.rating
       FROM user_links l
       JOIN user_progress p ON p.user_id = l.linked_user_id
      WHERE l.user_id = $1 AND (p.seen OR p.watchlist)`,
    [req.session.userId]
  );
  const proProfil = {};
  for (const r of rows) {
    (proProfil[r.linked_user_id] ||= []).push({ t: r.title_id, s: r.seen, w: r.watchlist, r: r.rating });
  }
  res.json(proProfil);
});

// Neue Einladung. Der Rohtoken verlaesst den Server genau einmal -- gespeichert
// wird nur sein Hash (wie bei password_reset_tokens).
//
// Zwei Arten, siehe schema.sql:
//   share    -- "Watchliste teilen": verknuepft beim Annehmen, laeuft ab.
//   referral -- "Personen einladen": weist nur auf die App hin, kein Konto
//               noetig, kein Ablauf. Gibt nichts preis, deshalb auch kein Grund
//               ihn zu befristen -- so ein Link kann in einer Gruppe stehen
//               bleiben und noch Monate spaeter jemanden bringen.
// Beide sind mehrfach einloesbar (siehe user_link_invite_uses).
router.post('/invite', async (req, res) => {
  const kind = req.body && req.body.kind === 'referral' ? 'referral' : 'share';
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO user_link_invites (token_hash, inviter_id, kind, expires_at)
     VALUES ($1, $2, $3, CASE WHEN $3 = 'referral' THEN NULL
                              ELSE now() + ($4 || ' days')::interval END)`,
    [hashOf(token), req.session.userId, kind, String(INVITE_TTL_TAGE)]
  );
  const basis = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  res.status(201).json({
    token,
    kind,
    url: kind === 'referral' ? `${basis}/?ref=${token}` : `${basis}/?einladung=${token}`,
    expiresInDays: kind === 'referral' ? null : INVITE_TTL_TAGE,
  });
});

// Wer lädt hier ein? Wird vor dem Annehmen angezeigt, damit niemand blind
// zustimmt. Verrät nur den Anzeigenamen, nicht die E-Mail-Adresse.
router.get('/invite/:token', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT i.inviter_id, i.expires_at, i.accepted_by, u.display_name
       FROM user_link_invites i JOIN users u ON u.id = i.inviter_id
      WHERE i.token_hash = $1`,
    [hashOf(req.params.token)]
  );
  const einladung = rows[0];
  if (!einladung) return res.status(404).json({ error: 'invite_not_found' });
  // Kein "bereits eingeloest" mehr: Einladungen gelten fuer beliebig viele
  // Personen. Wer sie zweimal oeffnet, sieht schlicht alreadyLinked.
  if (einladung.expires_at && new Date(einladung.expires_at) < new Date()) {
    return res.status(410).json({ error: 'invite_expired' });
  }
  if (einladung.inviter_id === req.session.userId) return res.status(400).json({ error: 'invite_own' });

  const { rows: schon } = await pool.query(
    'SELECT 1 FROM user_links WHERE user_id = $1 AND linked_user_id = $2',
    [req.session.userId, einladung.inviter_id]
  );
  res.json({
    inviter: { id: einladung.inviter_id, name: anzeigename(einladung) },
    alreadyLinked: schon.length > 0,
  });
});

router.post('/invite/:token/accept', async (req, res) => {
  const tokenHash = hashOf(req.params.token);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT inviter_id, expires_at, kind FROM user_link_invites WHERE token_hash = $1`,
      [tokenHash]
    );
    const einladung = rows[0];
    if (!einladung) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'invite_not_found' }); }
    if (einladung.expires_at && new Date(einladung.expires_at) < new Date()) {
      await client.query('ROLLBACK'); return res.status(410).json({ error: 'invite_expired' });
    }
    if (einladung.inviter_id === req.session.userId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'invite_own' }); }

    // Beide Richtungen -- eine Verknuepfung ist immer gegenseitig.
    // Der Hinweis "X hat deine Einladung angenommen" haengt an der Zeile der
    // EINLADENDEN Person und nur an einer neuen Verknuepfung: Wer denselben
    // Link zweimal oeffnet, loest keinen zweiten Hinweis aus.
    const { rowCount: neu } = await client.query(
      `INSERT INTO user_links (user_id, linked_user_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [einladung.inviter_id, req.session.userId]
    );
    await client.query(
      `INSERT INTO user_links (user_id, linked_user_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [req.session.userId, einladung.inviter_id]
    );
    if (neu) {
      await client.query(
        'UPDATE user_links SET hinweis_offen = true WHERE user_id = $1 AND linked_user_id = $2',
        [einladung.inviter_id, req.session.userId]
      );
    }
    // Zaehlt die Einloesung. Ohne FOR UPDATE-Sperre auf der Einladung: Sie ist
    // nicht mehr kontingentiert, gleichzeitige Annahmen koennen sich also nicht
    // mehr in die Quere kommen. Doppelte faengt der Primaerschluessel ab.
    await client.query(
      `INSERT INTO user_link_invite_uses (token_hash, user_id) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [tokenHash, req.session.userId]
    );
    await client.query('COMMIT');

    const { rows: partner } = await pool.query('SELECT id, display_name FROM users WHERE id = $1', [einladung.inviter_id]);
    res.json({ linked: { id: partner[0].id, name: anzeigename(partner[0]) } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Offene Hinweise: Wer hat seit dem letzten Besuch eine Einladung angenommen?
// Wird beim Start abgeholt und danach mit dem Aufruf darunter quittiert --
// eine E-Mail waere fuer diese Kleinigkeit zu viel, und ohne Hinweis waechst
// die Personenliste stillschweigend.
router.get('/hinweise', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.display_name
       FROM user_links l JOIN users u ON u.id = l.linked_user_id
      WHERE l.user_id = $1 AND l.hinweis_offen
      ORDER BY l.created_at`,
    [req.session.userId]
  );
  res.json(rows.map((r) => ({ id: r.id, name: anzeigename(r) })));
});

router.post('/hinweise/gelesen', async (req, res) => {
  await pool.query(
    'UPDATE user_links SET hinweis_offen = false WHERE user_id = $1 AND hinweis_offen',
    [req.session.userId]
  );
  res.status(204).end();
});

// Loest die Verknuepfung -- immer beidseitig.
router.delete('/:userId', async (req, res) => {
  const anderer = Number.parseInt(req.params.userId, 10);
  if (!Number.isInteger(anderer) || anderer <= 0) return res.status(400).json({ error: 'invalid_params' });
  await pool.query(
    `DELETE FROM user_links
      WHERE (user_id = $1 AND linked_user_id = $2) OR (user_id = $2 AND linked_user_id = $1)`,
    [req.session.userId, anderer]
  );
  res.status(204).end();
});

export default router;
