/* Cookielose Tageskennung (16.09.2026, Analytics "Geraete je Tag";
   uebernommen aus CouchUltras).

   Der Server bildet aus IP-Adresse, Browser-Kennung und einem GEHEIMEN,
   taeglich neu erzeugten Zufallswert eine Pruefsumme. Gespeichert wird nur
   die Pruefsumme -- nie die IP. Der Zufallswert des Vortags wird beim
   Tageswechsel ueberschrieben, also geloescht; danach laesst sich die
   Pruefsumme weder auf eine Person noch auf ein Geraet zurueckfuehren, und
   dasselbe Geraet bekommt am naechsten Tag zwangslaeufig eine andere.
   Das ist Absicht: Es geht nur um "wie viele verschiedene Geraete an
   EINEM Tag", nicht um Wiedererkennung ueber Tage (die leistet allein das
   Cookie mt_anon, middleware/anonId.js). Auf dem Geraet wird nichts
   gespeichert oder ausgelesen (Datenschutzerklaerung Abschnitt 4).
   Vorbild: Plausible, Fathom.

   Das Tagesgeheimnis liegt in analytics_meta (key 'tageskennung'), damit ein
   Neustart des Servers mitten am Tag die Zaehlung nicht in zwei Haelften
   teilt. Tag = Berliner Kalendertag. */
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';

const TAG_BERLIN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' });
export const heuteBerlin = (d = new Date()) => TAG_BERLIN.format(d);

let cache = null;   // { tag, salz }
let laufend = null; // laufender Datenbankzugriff, damit parallele Aufrufe teilen

async function salzFuer(tag) {
  if (cache && cache.tag === tag) return cache.salz;
  if (!laufend) {
    laufend = (async () => {
      const neu = crypto.randomBytes(32).toString('hex');
      /* Neu anlegen oder den Vortag ueberschreiben; steht schon das heutige
         Geheimnis drin (anderer Prozess war schneller), bleibt es -- dann
         liefert INSERT keine Zeile und wir lesen den Bestand. */
      const { rows } = await pool.query(
        `INSERT INTO analytics_meta (key, value) VALUES ('tageskennung', $1)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
           WHERE analytics_meta.value->>'tag' IS DISTINCT FROM EXCLUDED.value->>'tag'
         RETURNING value`,
        [JSON.stringify({ tag, salz: neu })]);
      let value = rows[0] && rows[0].value;
      if (!value) {
        const r = await pool.query(`SELECT value FROM analytics_meta WHERE key = 'tageskennung'`);
        value = r.rows[0] && r.rows[0].value;
      }
      if (value && value.tag && value.salz) cache = { tag: value.tag, salz: value.salz };
      return cache && cache.tag === tag ? cache.salz : null;
    })().finally(() => { laufend = null; });
  }
  return laufend;
}

/** Reine Funktion (testbar): 24 Hex-Zeichen aus Geheimnis, IP und Browser. */
export function kennungBilden(salz, ip, ua) {
  return crypto.createHash('sha256')
    .update(`${salz}|${ip || ''}|${ua || ''}`)
    .digest('hex').slice(0, 24);
}

/** Tageskennung fuer eine Anfrage -- null, wenn gerade kein Geheimnis
 *  bereitsteht (Datenbank weg, Tageswechsel im Moment des Aufrufs). Zaehlen
 *  darf nie eine Auslieferung bremsen oder scheitern lassen. */
export async function tageskennung(req) {
  try {
    const salz = await salzFuer(heuteBerlin());
    return salz ? kennungBilden(salz, req.ip, req.get('user-agent')) : null;
  } catch (err) {
    console.error('tageskennung:', err.message);
    return null;
  }
}
