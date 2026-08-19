import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { mengenGrenze } from '../middleware/rateLimit.js';
import { track } from '../lib/track.js';

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
//   share    -- "Watchlist teilen": verknuepft beim Annehmen, laeuft ab.
//   referral -- "Personen einladen": weist nur auf die App hin, kein Konto
//               noetig, kein Ablauf. Gibt nichts preis, deshalb auch kein Grund
//               ihn zu befristen -- so ein Link kann in einer Gruppe stehen
//               bleiben und noch Monate spaeter jemanden bringen.
// Beide sind mehrfach einloesbar (siehe user_link_invite_uses).
router.post('/invite', mengenGrenze({ name: 'invite', anzahl: 20, minuten: 60 }), async (req, res) => {
  const kind = req.body && req.body.kind === 'referral' ? 'referral' : 'share';
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO user_link_invites (token_hash, inviter_id, kind, expires_at)
     VALUES ($1, $2, $3, CASE WHEN $3 = 'referral' THEN NULL
                              ELSE now() + ($4 || ' days')::interval END)`,
    [hashOf(token), req.session.userId, kind, String(INVITE_TTL_TAGE)]
  );
  // KPI-Ereignis (docs/kpi.md) -- ohne await, wie ueberall: invite_id ist der
  // Hash, nie der einloesbare Rohtoken.
  track('invite_sent', {
    userId: req.session.userId,
    anonId: req.anonId,
    props: { invite_id: hashOf(token), channel: kind },
  });
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

    // KPI-Ereignis: Annehmen mit Konto. Die Gast-Teilnahme (guest: true)
    // kommt vom Client ueber POST /api/events (siehe routes/events.js).
    track('invite_accepted', {
      userId: req.session.userId,
      anonId: req.anonId,
      props: { invite_id: tokenHash, guest: false },
    });

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

/* ---- Verknuepfungs-Anfragen ----
   Gehoert zum Knopf "Mit X verknuepfen" in der Kopfzeile einer geteilten
   Ansicht (?titel=TOKEN, siehe routes/share.js). Anders als beim
   Einladungslink hat die teilende Person dem Oeffnen ihrer Listen nicht vorab
   zugestimmt -- sie wollte eine Liste zeigen. Deshalb entsteht aus dem Klick
   erst eine Anfrage, und die Verknuepfung erst aus dem Annehmen.

   Bezugspunkt ist immer der Momentaufnahme-Token, nie eine Kontonummer: Nur
   wer den geteilten Link hat, kann die dahinterstehende Person anfragen.
   Blind durch die Kontonummern gehen kann damit niemand. */

// Die beiden Zeilen einer Verknuepfung. hinweis_offen kommt auf die Zeile der
// ANFRAGENDEN Seite -- sie soll beim naechsten Start erfahren, dass es geklappt
// hat (siehe GET /hinweise).
async function verknuepfen(client, a, b, hinweisFuer) {
  await client.query(
    `INSERT INTO user_links (user_id, linked_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [a, b]);
  const { rowCount: neu } = await client.query(
    `INSERT INTO user_links (user_id, linked_user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [b, a]);
  if (neu && hinweisFuer) {
    await client.query(
      'UPDATE user_links SET hinweis_offen = true WHERE user_id = $1 AND linked_user_id = $2',
      [hinweisFuer, hinweisFuer === a ? b : a]);
  }
  await client.query(
    'DELETE FROM user_link_anfragen WHERE (von_id = $1 AND an_id = $2) OR (von_id = $2 AND an_id = $1)', [a, b]);
}

// Anfrage stellen. Der Deckel je Stunde ist bewusst niedriger als bei den
// Einladungen: Anfragen landen ungefragt bei anderen Leuten.
router.post('/anfrage', mengenGrenze({ name: 'link-anfrage', anzahl: 20, minuten: 60 }), async (req, res) => {
  const token = String((req.body && req.body.token) || '');
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ error: 'invalid_params' });
  const { rows } = await pool.query('SELECT user_id FROM titel_momentaufnahmen WHERE token = $1', [token]);
  if (!rows.length) return res.status(404).json({ error: 'unbekannt' });
  const ziel = String(rows[0].user_id);
  const ich = String(req.session.userId);
  if (ziel === ich) return res.status(400).json({ error: 'anfrage_eigene' });
  const { rows: person } = await pool.query('SELECT id, display_name FROM users WHERE id = $1', [ziel]);
  if (!person.length) return res.status(404).json({ error: 'unbekannt' });
  const name = anzeigename(person[0]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: schon } = await client.query(
      'SELECT 1 FROM user_links WHERE user_id = $1 AND linked_user_id = $2', [ich, ziel]);
    if (schon.length) { await client.query('ROLLBACK'); return res.json({ status: 'verknuepft', name }); }
    // Gegenanfrage liegt vor: Dann sind beide Zustimmungen da, und der Klick
    // hier ist die zweite -- ein zweiter Dialog waere Schikane.
    const { rows: gegen } = await client.query(
      'SELECT 1 FROM user_link_anfragen WHERE von_id = $1 AND an_id = $2', [ziel, ich]);
    if (gegen.length) {
      await verknuepfen(client, ich, ziel, null);
      await client.query('COMMIT');
      return res.json({ status: 'verknuepft', name });
    }
    // rowCount 0 heisst: Die Anfrage lag schon vor. Fuer die Gegenseite aendert
    // sich dadurch nichts -- nur die Rueckmeldung ist eine andere.
    const { rowCount: gestellt } = await client.query(
      'INSERT INTO user_link_anfragen (von_id, an_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [ich, ziel]);
    await client.query('COMMIT');
    res.json({ status: gestellt ? 'offen' : 'schon_gefragt', name });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// Offene Anfragen an mich. Wird beim Start abgeholt, genau wie /hinweise.
router.get('/anfragen', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.display_name
       FROM user_link_anfragen a JOIN users u ON u.id = a.von_id
      WHERE a.an_id = $1
      ORDER BY a.created_at`,
    [req.session.userId]
  );
  res.json(rows.map((r) => ({ id: String(r.id), name: anzeigename(r) })));
});

// Annehmen oder ablehnen. Beides raeumt die Anfrage weg; abgelehnt wird nichts
// gespeichert -- eine Sperrliste waere die naechste Ausbaustufe, solange es
// keine gibt, kann dieselbe Person mit demselben Link erneut fragen.
router.post('/anfragen/:userId', async (req, res) => {
  const anderer = String(req.params.userId || '');
  if (!/^[0-9]+$/.test(anderer)) return res.status(400).json({ error: 'invalid_params' });
  const ich = String(req.session.userId);
  const annehmen = !!(req.body && req.body.annehmen);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      'DELETE FROM user_link_anfragen WHERE von_id = $1 AND an_id = $2', [anderer, ich]);
    if (!rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'anfrage_weg' }); }
    if (!annehmen) { await client.query('COMMIT'); return res.json({ linked: null }); }
    await verknuepfen(client, ich, anderer, anderer);
    await client.query('COMMIT');
    const { rows: partner } = await pool.query('SELECT id, display_name FROM users WHERE id = $1', [anderer]);
    res.json({ linked: { id: String(partner[0].id), name: anzeigename(partner[0]) } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
  // Eine noch offene Anfrage in eine der beiden Richtungen faellt mit weg --
  // sonst stuende sie nach dem Loesen als Angebot wieder im Raum.
  await pool.query(
    `DELETE FROM user_link_anfragen
      WHERE (von_id = $1 AND an_id = $2) OR (von_id = $2 AND an_id = $1)`,
    [req.session.userId, anderer]
  );
  res.status(204).end();
});

export default router;
