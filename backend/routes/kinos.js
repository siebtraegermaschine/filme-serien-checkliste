import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { mengenGrenze } from '../middleware/rateLimit.js';

const router = createAsyncRouter();

// Grenzen je IP fuer die oeffentlichen, datenbank-nahen Leseabfragen. Bewusst
// grosszuegig -- die Vervollstaendigung feuert beim Tippen (entprellt), die
// Umkreissuche seltener. Ein Mensch schlaegt hier nie an; sie deckeln nur das
// Haemmern, mit dem man die Datenbank fuer alle verlangsamen koennte.
const GRENZE_ORTE = mengenGrenze({ name: 'kinos-orte', anzahl: 120, minuten: 1 });
const GRENZE_UMKREIS = mengenGrenze({ name: 'kinos-umkreis', anzahl: 120, minuten: 1 });

/* "Deine Kinos" -- Ortssuche, Kinos im Umkreis, eigene Auswahl.
   Siehe PLAN-KINOS.md. Bewusst OHNE Spielplaene: welche Filme wo laufen, ist
   eine andere und kostenpflichtige Quelle. Was hier steht, funktioniert
   unabhaengig davon und bleibt gueltig, wenn sie einmal dazukommt. */

const UMKREIS_VORGABE = 25;
const UMKREIS_MAX = 100;
const TREFFER_MAX = 60;

/* Entfernung in Kilometern. Die Erde als Kugel zu behandeln reicht hier
   vollkommen -- auf 100 km liegt der Fehler unter einem halben Prozent, und
   verglichen wird ohnehin gegen einen von Hand gewaehlten Umkreis. */
const ERDRADIUS_KM = 6371;
function entfernungSql(feldLat, feldLon) {
  return `(${ERDRADIUS_KM} * acos(
      least(1, greatest(-1,
        sin(radians($1)) * sin(radians(${feldLat})) +
        cos(radians($1)) * cos(radians(${feldLat})) * cos(radians(${feldLon}) - radians($2))
      ))
    ))`;
}

/* GET /api/kinos/orte?q=...
   Vervollstaendigung fuer das Suchfeld. Findet Postleitzahl UND Ortsname im
   selben Feld -- getrennte Felder waeren eine Entscheidung, die niemand treffen
   will, bevor er getippt hat.

   Oeffentlich: Die Einstellung soll auch beim ersten Oeffnen sofort etwas
   anzeigen koennen, und Ortsnamen sind keine Nutzerdaten. */
router.get('/orte', GRENZE_ORTE, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ orte: [] });

  const istZahl = /^\d+$/.test(q);
  // Seit alle Laender importiert sind, teilen sich 39 Laender einen PLZ-Raum:
  // "1010" gibt es in Auckland, Kopenhagen UND Wien. Treffer aus der gewaehlten
  // Region stehen deshalb zuerst -- eine unbekannte Region sortiert einfach
  // nichts um, statt Treffer wegzufiltern.
  const region = /^[A-Z]{2}$/.test(String(req.query.region || '')) ? req.query.region : '';
  // Bei Ziffern nach Postleitzahl suchen, sonst nach Ortsname -- beides von
  // vorn, damit "56" die 56er-Gegend zeigt und nicht jede PLZ mit einer 56
  // in der Mitte.
  const { rows } = await pool.query(
    istZahl
      ? `SELECT plz, ort, lat, lon FROM plz
          WHERE plz LIKE $1 ORDER BY (land = $2) DESC NULLS LAST, plz, ort LIMIT 12`
      : `SELECT plz, ort, lat, lon FROM plz
          WHERE lower(ort) LIKE lower($1)
          ORDER BY (land = $2) DESC NULLS LAST, length(ort), ort, plz LIMIT 12`,
    [q + '%', region]
  );

  /* Grosse Staedte stehen mit Dutzenden Postleitzahlen im Bestand ("Koblenz"
     kommt mehrfach vor). Fuer die Auswahl ist das Rauschen: Gesucht wird ein
     Mittelpunkt, nicht ein Stadtteil. Bei einer Ortssuche wird deshalb je Ort
     nur ein Eintrag gezeigt -- die Koordinaten der Dubletten liegen ohnehin
     wenige Kilometer auseinander. */
  const orte = [];
  const gesehen = new Set();
  for (const r of rows) {
    const schluessel = istZahl ? `${r.plz}|${r.ort}` : r.ort.toLowerCase();
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    orte.push({
      plz: r.plz,
      ort: r.ort,
      lat: Number(r.lat),
      lon: Number(r.lon),
      anzeige: istZahl ? `${r.plz} ${r.ort}` : r.ort,
    });
  }
  res.json({ orte: orte.slice(0, 8) });
});

/* GET /api/kinos?lat=&lon=&umkreis=
   Kinos im Umkreis, nach Entfernung sortiert. Ebenfalls oeffentlich -- die
   Liste der Kinos in einer Gegend ist keine persoenliche Angabe. */
router.get('/', GRENZE_UMKREIS, async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'invalid_position' });
  }
  const umkreis = Math.min(UMKREIS_MAX,
    Math.max(1, Number(req.query.umkreis) || UMKREIS_VORGABE));

  /* Erst ein Rechteck (dafuer gibt es den Index), dann genau rechnen. Ein Grad
     Breite sind rund 111 km; bei der Laenge kommt der Breitengrad hinzu, sonst
     waere das Rechteck in Norddeutschland zu schmal. */
  const gradLat = umkreis / 111;
  const gradLon = umkreis / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));

  const { rows } = await pool.query(
    `SELECT id, name, strasse, plz, ort, lat, lon, website,
            ${entfernungSql('lat', 'lon')} AS entfernung
       FROM kinos
      WHERE lat BETWEEN $3 AND $4 AND lon BETWEEN $5 AND $6
        AND ${entfernungSql('lat', 'lon')} <= $7
      ORDER BY entfernung
      LIMIT ${TREFFER_MAX}`,
    [lat, lon, lat - gradLat, lat + gradLat, lon - gradLon, lon + gradLon, umkreis]
  );

  res.json({
    umkreis,
    kinos: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      strasse: r.strasse,
      plz: r.plz,
      ort: r.ort,
      website: r.website,
      entfernung: Math.round(Number(r.entfernung) * 10) / 10,
    })),
  });
});

/* GET/PUT /api/kinos/meine -- die eigene Auswahl. Anders als die
   Anbieterauswahl liegt sie in einer eigenen Tabelle: Ein Kino ist eine Zeile
   mit Fremdschluessel, kein blosser Zahlenwert, und beim Loeschen eines Kinos
   soll die Auswahl mitgehen. */
router.get('/meine', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT k.id, k.name, k.strasse, k.plz, k.ort, k.website
       FROM user_kinos uk JOIN kinos k ON k.id = uk.kino_id
      WHERE uk.user_id = $1
      ORDER BY k.ort NULLS LAST, k.name`,
    [req.session.userId]
  );
  res.json({ kinos: rows.map((r) => ({ ...r, id: Number(r.id) })) });
});

router.put('/meine', requireAuth, async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'invalid_payload' });
  const sauber = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Vollstaendig ersetzen statt einzeln abgleichen: Die Oberflaeche schickt
    // immer die ganze Auswahl, und so kann kein Zwischenstand entstehen.
    await client.query('DELETE FROM user_kinos WHERE user_id = $1', [req.session.userId]);
    if (sauber.length) {
      await client.query(
        `INSERT INTO user_kinos (user_id, kino_id)
         SELECT $1, id FROM kinos WHERE id = ANY($2)`,
        [req.session.userId, sauber]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query(
    `SELECT k.id, k.name, k.strasse, k.plz, k.ort, k.website
       FROM user_kinos uk JOIN kinos k ON k.id = uk.kino_id
      WHERE uk.user_id = $1
      ORDER BY k.ort NULLS LAST, k.name`,
    [req.session.userId]
  );
  res.json({ kinos: rows.map((r) => ({ ...r, id: Number(r.id) })) });
});

export default router;
