import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { geheimnisStimmt } from '../lib/vergleich.js';

const router = createAsyncRouter();

// Wie weit die Auslieferung zurueck- bzw. vorausblickt. 8 Stunden Rueckblick:
// ein laufendes bzw. gerade beendetes Spiel soll unter "Heute" noch stehen.
// 70 Tage voraus decken "Demnaechst" grosszuegig ab, ohne die ganze Saison
// (~1000 Spiele) in jede Antwort zu packen.
const RUECKBLICK = "8 hours";
const VORAUSBLICK = "70 days";

// Oeffentlich, kein Login noetig -- analog zu /api/cinema. Sender-Katalog und
// Wettbewerbsnamen kommen aus sport_meta (letzter Ingest), die Spiele als
// kompakte Zeilen sortiert nach Anstoss.
router.get('/', async (_req, res) => {
  const [meta, spiele] = await Promise.all([
    pool.query('SELECT key, value FROM sport_meta'),
    pool.query(
      `SELECT * FROM sport_matches
        WHERE anstoss > now() - $1::interval AND anstoss < now() + $2::interval
        ORDER BY anstoss`, [RUECKBLICK, VORAUSBLICK]),
  ]);
  const m = Object.fromEntries(meta.rows.map((r) => [r.key, r.value]));
  res.json({
    sender: m.sender || {},
    wettbewerbe: m.wettbewerbe || {},
    spiele: spiele.rows.map((r) => ({
      id: String(r.external_id),
      c: r.wettbewerb,
      rd: r.runde,
      ko: r.anstoss.toISOString(),
      h: r.heim, hk: r.heim_kurz, hl: r.heim_logo,
      a: r.gast, ak: r.gast_kurz, al: r.gast_logo,
      fin: r.beendet,
      th: r.tore_heim, ta: r.tore_gast,
      tv: Array.isArray(r.tv) ? r.tv : [],
    })),
  });
});

// GET/PUT /api/sport/abos -- die eigenen Sport-Abos (Sender-Slugs). NULL heisst
// "nie konfiguriert"; das Frontend leitet dann eine Vorauswahl aus den
// Streaminganbietern ab (siehe index.html, sportAbosLaden).
router.get('/abos', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT sport_abos FROM users WHERE id = $1', [req.session.userId]);
  res.json({ abos: rows[0] ? rows[0].sport_abos : null });
});

router.put('/abos', requireAuth, async (req, res) => {
  const { abos } = req.body || {};
  if (!Array.isArray(abos)) return res.status(400).json({ error: 'invalid_payload' });
  // Nur plausible Slugs (Katalog kann sich mit jedem Ingest aendern, deshalb
  // Format- statt Katalogpruefung) -- und eine harte Obergrenze.
  const sauber = [...new Set(abos
    .map((a) => String(a).toLowerCase().trim())
    .filter((a) => /^[a-z0-9-]{1,24}$/.test(a)))].slice(0, 20);
  await pool.query('UPDATE users SET sport_abos = $1 WHERE id = $2', [sauber, req.session.userId]);
  res.json({ abos: sauber });
});

// Wird ausschliesslich von der GitHub Action (sport-fetch.mjs) aufgerufen --
// Server-zu-Server-Auth per Bearer-Token, analog /api/cinema/ingest. Der
// Fallback auf CINEMA_INGEST_SECRET erspart ein neues Server-Secret: gleiche
// Vertrauensstufe (GitHub Action -> Backend), gleicher Verwahrort.
router.post('/ingest', async (req, res) => {
  const expected = process.env.SPORT_INGEST_SECRET || process.env.CINEMA_INGEST_SECRET;
  const provided = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !geheimnisStimmt(provided, expected)) {
    return res.status(401).json({ error: 'invalid_ingest_secret' });
  }

  const { items, sender, wettbewerbe } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ error: 'invalid_payload' });

  // Welche Wettbewerbe dieser Lauf verwaltet -- nur DEREN Bestand darf der
  // Cleanup unten anfassen (derselbe Gedanke wie die Regionen beim Kino).
  const laufWettbewerbe = [...new Set(items.map((i) => i && i.wettbewerb).filter(Boolean))];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // clock_timestamp() statt now() -- Begruendung siehe routes/cinema.js
    // (now() ist der eingefrorene Transaktions-Start, der Cleanup unten
    // wuerde sonst alles gerade Eingefuegte sofort wieder loeschen).
    const { rows: [{ now: runStartedAt }] } = await client.query('SELECT clock_timestamp() AS now');

    // Plausibilitaetsschutz wie beim Kino: Ein Lauf, der nur einen Bruchteil
    // des kuenftigen Bestands liefert (OpenLigaDB-Aussetzer, halb gescheiterter
    // Abruf), darf den Spielplan nicht leerraeumen. Gemessen am KUENFTIGEN
    // Bestand der Lauf-Wettbewerbe -- Vergangenes altert von selbst heraus.
    const { rows: [{ anzahl: bestand }] } = await client.query(
      `SELECT COUNT(*)::int AS anzahl FROM sport_matches
        WHERE anstoss > now() AND wettbewerb = ANY($1)`, [laufWettbewerbe]);
    if (bestand >= 40 && items.length < bestand * 0.5) {
      await client.query('ROLLBACK');
      console.error(`Sport-Ingest abgelehnt: nur ${items.length} Spiele geliefert, kuenftiger Bestand ist ${bestand}.`);
      return res.status(409).json({
        error: 'implausible_payload', geliefert: items.length, bestand,
        hinweis: 'Zu wenige Spiele im Vergleich zum Bestand -- nichts uebernommen.',
      });
    }

    for (const item of items) {
      if (!item || !item.externalId || !item.wettbewerb || !item.anstoss || !item.heim || !item.gast) continue;
      await client.query(
        `INSERT INTO sport_matches
           (external_id, wettbewerb, saison, runde, anstoss, heim, gast, heim_kurz, gast_kurz,
            heim_logo, gast_logo, beendet, tore_heim, tore_gast, tv, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, clock_timestamp())
         ON CONFLICT (external_id) DO UPDATE SET
           wettbewerb = EXCLUDED.wettbewerb, saison = EXCLUDED.saison, runde = EXCLUDED.runde,
           anstoss = EXCLUDED.anstoss, heim = EXCLUDED.heim, gast = EXCLUDED.gast,
           heim_kurz = EXCLUDED.heim_kurz, gast_kurz = EXCLUDED.gast_kurz,
           heim_logo = EXCLUDED.heim_logo, gast_logo = EXCLUDED.gast_logo,
           beendet = EXCLUDED.beendet, tore_heim = EXCLUDED.tore_heim, tore_gast = EXCLUDED.tore_gast,
           tv = EXCLUDED.tv, fetched_at = clock_timestamp()`,
        [
          item.externalId, item.wettbewerb, String(item.saison || ''), item.runde || null,
          item.anstoss, item.heim, item.gast, item.heimKurz || null, item.gastKurz || null,
          item.heimLogo || null, item.gastLogo || null, !!item.beendet,
          item.toreHeim != null ? item.toreHeim : null,
          item.toreGast != null ? item.toreGast : null,
          JSON.stringify(Array.isArray(item.tv) ? item.tv : []),
        ]
      );
    }

    // Kuenftige Spiele, die dieser Lauf NICHT mehr kennt, sind abgesetzt oder
    // verlegt-und-neu-angelegt -- weg damit. Vergangene Spiele raeumt die
    // zweite Loeschung nach kurzer Frist ab (Historie zeigt die App nicht).
    await client.query(
      `DELETE FROM sport_matches
        WHERE wettbewerb = ANY($1) AND anstoss > $2 AND fetched_at < $2`,
      [laufWettbewerbe, runStartedAt]);
    await client.query(`DELETE FROM sport_matches WHERE anstoss < now() - interval '5 days'`);

    // Sender-Katalog/Wettbewerbsnamen des Laufs festhalten (Quelle:
    // sport-rechte.json) -- die Ausspielung oben liest sie von hier.
    for (const [key, value] of [['sender', sender], ['wettbewerbe', wettbewerbe]]) {
      if (!value || typeof value !== 'object') continue;
      await client.query(
        `INSERT INTO sport_meta (key, value, updated_at) VALUES ($1, $2, clock_timestamp())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = clock_timestamp()`,
        [key, JSON.stringify(value)]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.status(204).end();
});

export default router;
