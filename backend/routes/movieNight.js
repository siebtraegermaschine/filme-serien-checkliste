/*
 * Movie Night: gemeinsame Abstimmung ueber eine Handvoll Titel.
 *
 * Ablauf: Eine angemeldete Person startet eine Runde aus ihrer aktuellen
 * Liste (bis 30 Kandidaten) und teilt den Link (?nacht=TOKEN). Wer den Link
 * oeffnet, stimmt je Titel mit Ja/Nein ab -- OHNE Konto, nur mit Namen und
 * einem zufaelligen Geraete-Kennzeichen (kommt vom Client, bleibt je Runde
 * stabil, damit erneutes Abstimmen die eigene Stimme ersetzt statt doppelt
 * zu zaehlen). Der Zwischenstand ist fuer alle sichtbar; gewonnen hat der
 * Titel mit den meisten Ja-Stimmen.
 *
 * Bewusst schlank: kein Live-Kanal (der Client fragt den Stand alle paar
 * Sekunden ab), keine Bearbeitung, kein Loeschen -- Runden verfallen nach
 * 48 Stunden und werden beim Anlegen neuer Runden aufgeraeumt.
 */
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { mengenGrenze } from '../middleware/rateLimit.js';
import { sprachWahl, sprachFeld } from '../lib/i18n.js';
import { track } from '../lib/track.js';

const router = createAsyncRouter();

const MAX_KANDIDATEN = 30;
const VERFALL_STUNDEN = 48;
const GRENZE_ANLEGEN = mengenGrenze({ name: 'movienight-neu', anzahl: 10, minuten: 60 });
const GRENZE_STIMMEN = mengenGrenze({ name: 'movienight-stimme', anzahl: 120, minuten: 15 });

// Runde anlegen. titleIds sind interne titles.id -- nur existierende zaehlen.
router.post('/', requireAuth, GRENZE_ANLEGEN, async (req, res) => {
  const roh = Array.isArray(req.body?.titleIds) ? req.body.titleIds : [];
  const ids = [...new Set(roh.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_KANDIDATEN);
  if (ids.length < 2) return res.status(400).json({ error: 'zu_wenige_kandidaten' });
  const { rows: vorhanden } = await pool.query('SELECT id FROM titles WHERE id = ANY($1)', [ids]);
  const geprueft = vorhanden.map((r) => Number(r.id));
  if (geprueft.length < 2) return res.status(400).json({ error: 'zu_wenige_kandidaten' });

  // Abgelaufene Runden bei der Gelegenheit wegwerfen -- billiger als ein
  // eigener Aufraeum-Zeitplan fuer eine kleine Tabelle.
  await pool.query(`DELETE FROM movie_night_runden WHERE created_at < now() - interval '${VERFALL_STUNDEN} hours'`);

  const token = crypto.randomBytes(16).toString('hex');
  const { rows: [neu] } = await pool.query(
    'INSERT INTO movie_night_runden (token, ersteller_user_id, titel_ids) VALUES ($1, $2, $3) RETURNING id',
    [token, req.session.userId, geprueft]
  );
  // KPI: Eine Movie-Night-Runde IST die Match-Session (docs/kpi.md). Beim
  // Start ist nur die erstellende Person dabei; den tatsaechlichen Stand
  // tragen die Stimmen-Ereignisse nach (participant_count je Stimme).
  track('session_started', {
    userId: req.session.userId,
    anonId: req.anonId,
    sessionId: String(neu.id),
    props: { participant_count: 1 },
  });
  res.status(201).json({ token });
});

async function rundeLaden(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) return null;
  const { rows } = await pool.query(
    `SELECT id, titel_ids, created_at FROM movie_night_runden
      WHERE token = $1 AND created_at > now() - interval '${VERFALL_STUNDEN} hours'`,
    [token]
  );
  return rows[0] || null;
}

// Runde samt Kandidaten und Zwischenstand -- oeffentlich (der Link IST der
// Zugang, wie beim geteilten Titel).
router.get('/:token', async (req, res) => {
  const runde = await rundeLaden(req.params.token);
  if (!runde) return res.status(404).json({ error: 'runde_nicht_gefunden' });
  const lang = sprachWahl(req.query.lang);

  const { rows: titel } = await pool.query(
    `SELECT id, title, title_en, uebersetzungen, year, poster_path, rating, vote_count
       FROM titles WHERE id = ANY($1)`,
    [runde.titel_ids]
  );
  const { rows: stimmen } = await pool.query(
    `SELECT title_id, teilnehmer, name, stimme FROM movie_night_stimmen WHERE runde_id = $1`,
    [runde.id]
  );
  const jaProTitel = {};
  const teilnehmer = new Map();
  for (const s of stimmen) {
    if (s.stimme) jaProTitel[s.title_id] = (jaProTitel[s.title_id] || 0) + 1;
    teilnehmer.set(s.teilnehmer, s.name);
  }
  // In der Reihenfolge der Runde (die kam aus der sortierten Liste der
  // erstellenden Person), nicht in Datenbank-Reihenfolge.
  const jeId = new Map(titel.map((t) => [Number(t.id), t]));
  res.json({
    titel: runde.titel_ids.map((id) => jeId.get(Number(id))).filter(Boolean).map((t) => ({
      id: String(t.id),
      t: sprachFeld(lang, t.title, t.title_en, t.uebersetzungen, 't'),
      y: t.year,
      p: t.poster_path,
      r: t.rating != null ? Number(t.rating) : null,
      ja: jaProTitel[t.id] || 0,
    })),
    teilnehmer: [...teilnehmer.values()].filter(Boolean),
    erstellt: runde.created_at.toISOString(),
  });
});

// Stimmen abgeben oder ersetzen. `teilnehmer` ist das Geraete-Kennzeichen des
// Clients (32 Hex-Zeichen), `name` die frei gewaehlte Anzeige.
router.post('/:token/stimmen', GRENZE_STIMMEN, async (req, res) => {
  const runde = await rundeLaden(req.params.token);
  if (!runde) return res.status(404).json({ error: 'runde_nicht_gefunden' });
  const { teilnehmer, name, stimmen } = req.body || {};
  if (typeof teilnehmer !== 'string' || !/^[a-f0-9]{16,64}$/.test(teilnehmer)) {
    return res.status(400).json({ error: 'invalid_teilnehmer' });
  }
  const anzeigeName = (typeof name === 'string' ? name : '').trim().slice(0, 40);
  if (!stimmen || typeof stimmen !== 'object') return res.status(400).json({ error: 'invalid_stimmen' });

  const erlaubt = new Set(runde.titel_ids.map(Number));
  const paare = Object.entries(stimmen)
    .map(([id, wert]) => [Number(id), !!wert])
    .filter(([id]) => erlaubt.has(id));
  if (!paare.length) return res.status(400).json({ error: 'invalid_stimmen' });

  const werte = [];
  const platzhalter = paare.map(([id, wert], i) => {
    const b = i * 5;
    werte.push(runde.id, teilnehmer, anzeigeName, id, wert);
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
  });
  await pool.query(
    `INSERT INTO movie_night_stimmen (runde_id, teilnehmer, name, title_id, stimme)
     VALUES ${platzhalter.join(',')}
     ON CONFLICT (runde_id, teilnehmer, title_id)
       DO UPDATE SET stimme = EXCLUDED.stimme, name = EXCLUDED.name, abgegeben_at = now()`,
    werte
  );
  // KPI-Ereignisse -- ohne await, das Abstimmen wartet darauf nicht.
  stimmenTracken(runde, paare, req);
  res.status(204).end();
});

/* KPI (docs/kpi.md): jede abgegebene Stimme als title_rated (verdict yes/no),
   danach EINMAL je Runde match_completed, sobald mindestens zwei Personen
   teilnehmen und mindestens ein Titel von allen Teilnehmenden ein Ja hat.
   participant_count in den props ist der Stand zum Zeitpunkt der Stimme --
   buildSnapshot nimmt je Session das Maximum. Runden verfallen nach 48
   Stunden; die Ereignisse bleiben, deshalb passiert die Match-Pruefung hier
   und nicht erst in der Auswertung. */
async function stimmenTracken(runde, paare, req) {
  try {
    const sessionId = String(runde.id);
    const basis = { userId: req.session?.userId ?? null, anonId: req.anonId, sessionId };
    const { rows: [z] } = await pool.query(
      'SELECT COUNT(DISTINCT teilnehmer)::int AS n FROM movie_night_stimmen WHERE runde_id = $1',
      [runde.id]
    );
    const anzahl = z.n;
    for (const [titleId, wert] of paare) {
      await track('title_rated', { ...basis,
        props: { title_id: titleId, verdict: wert ? 'yes' : 'no', participant_count: anzahl } });
    }
    if (anzahl < 2) return;
    const { rows: schon } = await pool.query(
      `SELECT 1 FROM analytics_events WHERE name = 'match_completed' AND session_id = $1 LIMIT 1`,
      [sessionId]
    );
    if (schon.length) return;
    const { rows: gemeinsame } = await pool.query(
      `SELECT title_id FROM movie_night_stimmen
        WHERE runde_id = $1 AND stimme
        GROUP BY title_id
        HAVING COUNT(DISTINCT teilnehmer) = $2
        ORDER BY title_id LIMIT 1`,
      [runde.id, anzahl]
    );
    if (!gemeinsame.length) return;
    await track('match_completed', { ...basis,
      props: { participant_count: anzahl, title_id: Number(gemeinsame[0].title_id) } });
  } catch (err) {
    console.error('stimmenTracken fehlgeschlagen:', err.message);
  }
}

export default router;
