import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { mengenGrenze } from '../middleware/rateLimit.js';

const router = createAsyncRouter();
const MAX_LENGTH = 200;

// Oeffentlich und ohne Login -- damit auch ein offener Schreibpfad in die
// Datenbank. Das Frontend meldet einen Begriff erst 800ms nach der letzten
// Eingabe und dedupliziert (siehe index.html, logSearchQuery); echte Nutzung
// erzeugt also hoechstens eine Handvoll Eintraege pro Minute. 60 je Stunde und
// IP liegt weit darueber, stoppt aber ein Skript, das die Tabelle sonst
// unbegrenzt vollschreiben koennte.
const GRENZE = mengenGrenze({ name: 'search-log', anzahl: 60, minuten: 60 });

// Protokolliert manuell eingegebene Suchbegriffe fuer spaetere Auswertung. Ist
// die Person eingeloggt, wird ihre E-Mail zur Zuordnung mitgespeichert, sonst
// bleibt das Feld NULL (anonyme Suche).
router.post('/', GRENZE, async (req, res) => {
  const { query } = req.body || {};
  if (typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'invalid_query' });
  }
  const text = query.trim().slice(0, MAX_LENGTH);

  let email = null;
  if (req.session && req.session.userId) {
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.session.userId]);
    if (rows[0]) email = rows[0].email;
  }

  await pool.query('INSERT INTO search_queries (query, user_email) VALUES ($1, $2)', [text, email]);
  res.status(204).end();
});

export default router;
