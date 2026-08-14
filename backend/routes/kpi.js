/* KPI-Endpunkte (docs/kpi.md).
 *
 * Auth bewusst NICHT ueber die Session, sondern ueber den Header x-kpi-token
 * (Wert aus KPI_TOKEN in backend/.env) -- so laesst sich der Endpunkt per
 * curl und aus dem externen Cockpit nutzen. Ohne gueltigen Token 401; ist
 * KPI_TOKEN nicht gesetzt, ist der Endpunkt geschlossen.
 *
 * CORS: Access-Control-Allow-Origin * NUR fuer diese Routen -- das Cockpit
 * laeuft auf einer anderen Origin. Der eigene Header loest einen Preflight
 * aus, deshalb wird OPTIONS hier ohne Token mit 204 beantwortet (der
 * Preflight traegt nie Header-Werte, erst der eigentliche GET). */
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { geheimnisStimmt } from '../lib/vergleich.js';
import { pool } from '../db/pool.js';
import { buildSnapshot, abgeschlosseneWoche, snapshotSpeichern } from '../lib/kpi.js';

const router = createAsyncRouter();

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REBUILD_WOCHEN = 104;

router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'x-kpi-token');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!geheimnisStimmt(req.get('x-kpi-token'), process.env.KPI_TOKEN || '')) {
    return res.status(401).json({ error: 'invalid_kpi_token' });
  }
  next();
});

// Snapshot der letzten abgeschlossenen Woche, oder eines per from/to
// (ISO-Datum, Montag/Sonntag) gewaehlten Fensters. ?format=text liefert
// dasselbe JSON als text/plain zum Kopieren aus dem Browser.
router.get('/snapshot', async (req, res) => {
  let { from, to } = req.query;
  if ((from == null) !== (to == null)) {
    return res.status(400).json({ error: 'from_and_to_required_together' });
  }
  if (from == null) {
    ({ from, to } = await abgeschlosseneWoche(1));
  } else if (!DATUM_RE.test(from) || !DATUM_RE.test(to) || from > to) {
    return res.status(400).json({ error: 'invalid_date_range' });
  }
  const { snapshot } = await buildSnapshot(from, to);
  if (req.query.format === 'text') {
    return res.type('text/plain').send(JSON.stringify(snapshot, null, 2));
  }
  res.json(snapshot);
});

/* Rueckwirkend befuellen: legt fuer die letzten N abgeschlossenen Wochen die
   fehlenden Snapshots an (?weeks=12). Vorhandene Wochen werden uebersprungen;
   mit ?force=1 bekommen auch sie eine NEUE Version daneben (ueberschrieben
   wird nie, siehe kpi_snapshots). GET und POST, damit der einmalige Aufruf
   auch aus der Adresszeile des Browsers geht. */
async function rebuild(req, res) {
  const weeks = Math.min(MAX_REBUILD_WOCHEN, Math.max(1, Number(req.query.weeks) || 12));
  const force = req.query.force === '1';
  const ergebnis = [];
  for (let i = weeks; i >= 1; i--) {
    const woche = await abgeschlosseneWoche(i);
    const { rows: schon } = await pool.query(
      'SELECT 1 FROM kpi_snapshots WHERE week_start = $1::date LIMIT 1', [woche.from]
    );
    if (schon.length && !force) {
      ergebnis.push({ week_start: woche.from, status: 'uebersprungen' });
      continue;
    }
    const { snapshot } = await buildSnapshot(woche.from, woche.to);
    await snapshotSpeichern(snapshot);
    ergebnis.push({ week_start: woche.from, status: 'angelegt' });
  }
  res.json({ weeks, ergebnis });
}
router.get('/rebuild', rebuild);
router.post('/rebuild', rebuild);

export default router;
