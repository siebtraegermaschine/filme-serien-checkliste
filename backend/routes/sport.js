import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { geheimnisStimmt } from '../lib/vergleich.js';
import { sportKontext } from '../lib/seoSport.js';
import { LIGEN_MIT_TABELLE, ligaTabelle, torschuetzen, teamForm, direktvergleich } from '../lib/sportDaten.js';

const router = createAsyncRouter();

// Wie weit die Auslieferung zurueck- bzw. vorausblickt. 8 Stunden Rueckblick:
// ein laufendes bzw. gerade beendetes Spiel soll unter "Heute" noch stehen.
// Voraus die GANZE Saison: Der Vereins-Filter ("Deine Ansicht") soll alle
// Spieltage zeigen -- mit dem frueheren 70-Tage-Fenster endete die Liste
// scheinbar am 7. Spieltag (Christian, 20. August 2026). ~1000 Spiele sind
// als Antwort verkraftbar (einmal je Seitenbesuch, gzip drueckt kraeftig).
const RUECKBLICK = "8 hours";
const VORAUSBLICK = "370 days";

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
  // Wo die SEO-Spielseiten wohnen (couchultras.com, sobald aktiv) -- das
  // Frontend baut daraus die Teilen-Links beim Wischen einer Spielkarte.
  const ktx = sportKontext();
  res.json({
    seiten: { basis: ktx.basis, prefix: ktx.spielPrefix },
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

/* GET /api/sport/tabelle/:comp -- Ligatabelle samt Torschuetzenliste fuer
   die Tabellen-Ansicht der App (nur bl1/bl2/bl3, siehe LIGEN_MIT_TABELLE).
   Die Saison kommt aus dem eigenen Spielplan: die des naechsten Spiels des
   Wettbewerbs (zum Saisonwechsel liegt sonst noch die Vorsaison obenauf),
   ersatzweise die des juengsten. Datenquelle OpenLigaDB, 6h-Cache in
   lib/sportDaten.js -- die App-Last schlaegt nicht auf die Community-API
   durch. */
router.get('/tabelle/:comp', async (req, res) => {
  const comp = String(req.params.comp || '').toLowerCase();
  if (!LIGEN_MIT_TABELLE.has(comp)) return res.status(404).json({ error: 'no_table' });
  const { rows } = await pool.query(
    `SELECT saison FROM sport_matches
      WHERE wettbewerb = $1 AND saison <> ''
      ORDER BY (anstoss > now() - interval '8 hours') DESC, anstoss
      LIMIT 1`, [comp]);
  if (!rows.length) return res.status(404).json({ error: 'no_matches' });
  const saison = rows[0].saison;
  const [tabelle, schuetzen] = await Promise.all([
    ligaTabelle(comp, saison),
    torschuetzen(comp, saison),
  ]);
  res.json({
    saison,
    tabelle: (tabelle || []).map((t) => ({
      name: t.teamName, kurz: t.shortName || null, logo: t.teamIconUrl || null,
      sp: t.matches, s: t.won, u: t.draw, n: t.lost,
      tore: t.goals, gegen: t.opponentGoals, pkt: t.points,
    })),
    torschuetzen: schuetzen || [],
  });
});

/* GET /api/sport/spiel/:id/details -- Direktvergleich und Formkurven fuer
   die aufgeklappte Spielkarte. Beides kommt von OpenLigaDB (6h-Cache); wo
   Team-IDs fehlen (etwa Turnier-Platzhalter vor der Auslosung), bleiben die
   Felder null und die Karte laesst den Abschnitt weg. */
router.get('/spiel/:id/details', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: 'not_found' });
  const { rows } = await pool.query(
    'SELECT heim, gast, heim_id, gast_id FROM sport_matches WHERE external_id = $1', [id]);
  const m = rows[0];
  if (!m) return res.status(404).json({ error: 'not_found' });
  const [duelle, formHeim, formGast] = await Promise.all([
    direktvergleich(m.heim_id, m.gast_id),
    teamForm(m.heim_id, m.heim),
    teamForm(m.gast_id, m.gast),
  ]);
  res.json({ duelle: duelle || [], formHeim: formHeim || [], formGast: formGast || [] });
});

/* GET/PUT /api/sport/ansicht -- Vereine und Wettbewerbs-Vorauswahl am Konto
   (24.08.2026). Das Geraet bleibt die erste Adresse (localStorage, auch ohne
   Konto); wer angemeldet ist, nimmt seine Auswahl damit ueber Browser und
   Geraete mit. NULL in beiden Spalten heisst "nie gespeichert" -- das
   Frontend schiebt dann die lokale Auswahl hoch, statt sie zu ueberschreiben. */
router.get('/ansicht', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT sport_vereine, sport_comps FROM users WHERE id = $1', [req.session.userId]);
  const u = rows[0] || {};
  res.json({
    vereine: u.sport_vereine || null,
    comps: u.sport_comps || null,
  });
});

router.put('/ansicht', requireAuth, async (req, res) => {
  const { vereine, comps } = req.body || {};
  if (!Array.isArray(vereine) || !Array.isArray(comps)) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  // Nur Name und Logo je Verein, hoechstens drei -- dieselbe Obergrenze wie
  // im Frontend (VEREIN_MAX). Logos sind OpenLigaDB-URLs.
  const sauberVereine = vereine
    .filter((v) => v && typeof v.n === 'string' && v.n.trim() && v.n.length <= 80)
    .slice(0, 3)
    .map((v) => ({
      n: v.n.trim(),
      logo: typeof v.logo === 'string' && /^https:\/\//.test(v.logo) && v.logo.length <= 500 ? v.logo : null,
    }));
  // Wettbewerbs-Kuerzel wie in sport-rechte.json (Format- statt
  // Katalogpruefung, siehe /abos).
  const sauberComps = [...new Set(comps
    .map((c) => String(c).toLowerCase().trim())
    .filter((c) => /^[a-z0-9]{1,12}$/.test(c)))].slice(0, 20);

  await pool.query(
    'UPDATE users SET sport_vereine = $1, sport_comps = $2 WHERE id = $3',
    [JSON.stringify(sauberVereine), sauberComps, req.session.userId]);
  // Alle Push-Abos dieser Person nachziehen -- sonst erinnerte ein zweites
  // Geraet weiter an den alten Verein. Genau das ist der Konto-Nutzen bei
  // den Benachrichtigungen (siehe lib/sportPush.js).
  await pool.query(
    'UPDATE push_abos SET vereine = $1 WHERE user_id = $2',
    [sauberVereine.map((v) => v.n), req.session.userId]);
  res.json({ vereine: sauberVereine, comps: sauberComps });
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
            heim_logo, gast_logo, beendet, tore_heim, tore_gast, tv, heim_id, gast_id, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, clock_timestamp())
         ON CONFLICT (external_id) DO UPDATE SET
           wettbewerb = EXCLUDED.wettbewerb, saison = EXCLUDED.saison, runde = EXCLUDED.runde,
           anstoss = EXCLUDED.anstoss, heim = EXCLUDED.heim, gast = EXCLUDED.gast,
           heim_kurz = EXCLUDED.heim_kurz, gast_kurz = EXCLUDED.gast_kurz,
           heim_logo = EXCLUDED.heim_logo, gast_logo = EXCLUDED.gast_logo,
           beendet = EXCLUDED.beendet, tore_heim = EXCLUDED.tore_heim, tore_gast = EXCLUDED.tore_gast,
           tv = EXCLUDED.tv, heim_id = EXCLUDED.heim_id, gast_id = EXCLUDED.gast_id,
           fetched_at = clock_timestamp()`,
        [
          item.externalId, item.wettbewerb, String(item.saison || ''), item.runde || null,
          item.anstoss, item.heim, item.gast, item.heimKurz || null, item.gastKurz || null,
          item.heimLogo || null, item.gastLogo || null, !!item.beendet,
          item.toreHeim != null ? item.toreHeim : null,
          item.toreGast != null ? item.toreGast : null,
          JSON.stringify(Array.isArray(item.tv) ? item.tv : []),
          item.heimId != null ? item.heimId : null,
          item.gastId != null ? item.gastId : null,
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
    // 45 statt 5 Tage: Die SEO-Spielseiten (lib/seoSport.js) beantworten nach
    // dem Abpfiff "Wer zeigte ...?" samt Endstand -- so behalten sie ihren
    // Suchwert, statt nach ein paar Tagen ins 404 zu laufen.
    await client.query(`DELETE FROM sport_matches WHERE anstoss < now() - interval '45 days'`);

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
