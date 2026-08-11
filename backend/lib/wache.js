import { pool } from '../db/pool.js';
import { sendMail } from './mailer.js';

/* Die Wache: meldet per E-Mail, wenn etwas nicht stimmt -- und sonst gar nicht.
 *
 * Kein "laeuft alles" am Morgen. Wer taeglich eine Mail bekommt, die nichts
 * sagt, gewoehnt sich das Wegklicken an und uebersieht die eine, auf die es
 * ankommt.
 *
 * WAS DIESE LOESUNG NICHT ABDECKT: Steht der Server, kann er nichts melden.
 * Dafuer braeuchte es eine Pruefung von aussen. Sie ist bewusst nicht gebaut,
 * sondern als offener Punkt vermerkt (siehe UEBERGABE-OFFEN.md) -- so etwas
 * stillschweigend mitzubauen waere schlechter, als die Luecke zu benennen.
 *
 * Aufbau wie starteSicherung/starteThemen: eine Datei, eine starte...-Funktion,
 * die server.js beim Hochfahren ruft.
 */

// Wie beim Feedback-Formular bewusst hier und nicht in .env: Der Empfaenger
// gehoert zur Anwendung, nicht zur Umgebung.
const WACHE_AN = 'info@digital-wings.com';

/* Meldungen, deren Versand scheiterte. Sie kommen bei der naechsten Mail, die
 * durchgeht, hinten dran -- eine Meldung ueber einen kaputten Mailversand per
 * Mail zu verschicken, kann ja gerade nicht klappen.
 *
 * Begrenzt, damit ein tagelang gestoerter Versand den Speicher nicht vollaufen
 * laesst; was darueber hinausgeht, wird nur gezaehlt. */
const NACHZUREICHEN_MAX = 20;
let nachzureichen = [];
let nachzureichenVerloren = 0;

// Ersatz-Sperre fuer den Fall, dass die Datenbank nicht antwortet -- dann ist
// die Sperre in wache_meldungen nicht lesbar, und ausgerechnet "Datenbank weg"
// ist eine Meldung, die sich sonst im Sekundentakt wiederholte.
const sperreImSpeicher = new Map(); // art -> Datum als "YYYY-MM-DD"

function heute() {
  return new Date().toISOString().slice(0, 10);
}

/* Darf diese Art von Meldung heute (noch) raus?
 * Gibt { senden, unterdrueckt } zurueck: `unterdrueckt` ist die Zahl der seit
 * dem letzten Versand zurueckgehaltenen gleichartigen Meldungen. */
async function darfRaus(art) {
  try {
    const { rows } = await pool.query(
      'SELECT zuletzt_am, unterdrueckt FROM wache_meldungen WHERE art = $1',
      [art]
    );
    const zeile = rows[0];
    const heuteSchon = zeile && zeile.zuletzt_am.toISOString().slice(0, 10) === heute();
    if (heuteSchon) {
      await pool.query(
        'UPDATE wache_meldungen SET unterdrueckt = unterdrueckt + 1 WHERE art = $1',
        [art]
      );
      return { senden: false, unterdrueckt: zeile.unterdrueckt + 1 };
    }
    return { senden: true, unterdrueckt: zeile ? zeile.unterdrueckt : 0 };
  } catch (err) {
    // Datenbank nicht erreichbar: auf die Sperre im Speicher zurueckfallen,
    // statt entweder gar nicht oder ununterbrochen zu melden.
    console.error('[wache] Sperre nicht lesbar, nehme die im Speicher:', err.message);
    if (sperreImSpeicher.get(art) === heute()) return { senden: false, unterdrueckt: 0 };
    return { senden: true, unterdrueckt: 0 };
  }
}

// Erst NACH erfolgreichem Versand vermerken. Andersherum wuerde ein
// misslungener Versand die Meldung fuer den Rest des Tages verschlucken --
// gemeldet worden waere sie dann nie.
async function versandVermerken(art) {
  sperreImSpeicher.set(art, heute());
  try {
    await pool.query(
      `INSERT INTO wache_meldungen (art, zuletzt_am, unterdrueckt) VALUES ($1, CURRENT_DATE, 0)
       ON CONFLICT (art) DO UPDATE SET zuletzt_am = CURRENT_DATE, unterdrueckt = 0`,
      [art]
    );
  } catch (err) {
    console.error('[wache] Sperre nicht schreibbar:', err.message);
  }
}

function nachreichungsText() {
  if (!nachzureichen.length && !nachzureichenVerloren) return '';
  const zeilen = nachzureichen.map(
    (m) => `[${m.zeit}] ${m.betreff}\n${m.text}`
  );
  if (nachzureichenVerloren) {
    zeilen.push(`… und ${nachzureichenVerloren} weitere, die nicht aufgehoben wurden.`);
  }
  return '\n\n' + '-'.repeat(60) + '\n' +
    'NACHGEREICHT -- diese Meldungen konnten vorher nicht verschickt werden:\n\n' +
    zeilen.join('\n\n');
}

/**
 * Meldet einen Fehler per E-Mail -- hoechstens einmal am Tag je `art`.
 *
 * @param {string} art     Sorte der Meldung ("importe", "sicherung", ...).
 *                         Die Sperre gilt je Sorte.
 * @param {string} betreff Betreffzeile ohne Vorspann.
 * @param {string} text    Was passiert ist.
 */
export async function melde(art, betreff, text) {
  console.error(`[wache] ${art}: ${betreff}\n${text}`);
  if (process.env.WACHE_DISABLED === '1') return false;

  const { senden, unterdrueckt } = await darfRaus(art);
  if (!senden) {
    // Ohne lesbare Sperre in der Datenbank gibt es keine Zaehlung -- dann ohne
    // Zahl schreiben statt "(0. Mal)".
    console.error('[wache] ' + art + ': heute schon gemeldet, zurueckgehalten'
      + (unterdrueckt ? ` (${unterdrueckt}. Mal).` : '.'));
    return false;
  }

  const vorlauf = unterdrueckt
    ? `Seit der letzten Mail wurden ${unterdrueckt} gleichartige Meldungen zurueckgehalten.\n\n`
    : '';
  const koerper = `${vorlauf}${text}\n\nZeitpunkt: ${new Date().toISOString()}\nRechner: ${process.env.HOSTNAME || 'unbekannt'}`
    + nachreichungsText();

  try {
    await sendMail({ to: WACHE_AN, subject: `MovieMatch Wache – ${betreff}`, text: koerper });
    nachzureichen = [];
    nachzureichenVerloren = 0;
    await versandVermerken(art);
    return true;
  } catch (err) {
    // Der Fall, den man nicht per Mail melden kann. Ins Protokoll, aufheben,
    // und beim naechsten Versand, der durchgeht, mitschicken.
    console.error('[wache] Versand fehlgeschlagen:', err.message);
    if (nachzureichen.length < NACHZUREICHEN_MAX) {
      nachzureichen.push({ zeit: new Date().toISOString(), betreff, text });
    } else {
      nachzureichenVerloren++;
    }
    return false;
  }
}

/* ---- Was ueberwacht wird ---- */

/* Taegliche Importe. "Bleibt aus" ist der wichtigere Fall: Ein Job, der gar
 * nicht laeuft, meldet von sich aus nichts -- niemand bemerkt ihn, bis die
 * Daten sichtbar veralten.
 *
 * Gemessen wird deshalb nicht, ob ein Lauf gemeldet hat, sondern wie alt die
 * Daten sind, die er hinterlassen haette. Das deckt beide Faelle mit einer
 * Pruefung ab: fehlgeschlagen und gar nicht erst gestartet.
 *
 * Die Grenzen liegen bewusst ueber dem Abstand der Laeufe (siehe
 * .github/workflows): Ein einzelner verspaeteter oder einmal ausgefallener Lauf
 * soll noch keine Mail ausloesen, zwei hintereinander schon. */
const IMPORTE = [
  { name: 'Streaming-Abgleich (taeglich 04:00 UTC)',
    frage: 'SELECT max(fetched_at) AS stand FROM streaming_cache',
    hoechstensStunden: 30 },
  { name: 'Kinostarts (taeglich 04:30 UTC)',
    frage: 'SELECT max(fetched_at) AS stand FROM cinema_cache',
    hoechstensStunden: 30 },
  { name: 'Discovery-Katalog (alle zwei Tage 05:00 UTC)',
    frage: "SELECT max(updated_at) AS stand FROM titles WHERE source = 'discovery'",
    hoechstensStunden: 78 },
];

export async function pruefeImporte() {
  const auffaellig = [];
  for (const eintrag of IMPORTE) {
    const { rows } = await pool.query(eintrag.frage);
    const stand = rows[0] && rows[0].stand;
    if (!stand) {
      auffaellig.push(`- ${eintrag.name}: es gibt ueberhaupt keine Daten.`);
      continue;
    }
    const stunden = (Date.now() - new Date(stand).getTime()) / 3600000;
    if (stunden > eintrag.hoechstensStunden) {
      auffaellig.push(
        `- ${eintrag.name}: letzter Stand vor ${Math.round(stunden)} Stunden ` +
        `(${new Date(stand).toISOString()}), erlaubt sind ${eintrag.hoechstensStunden}.`
      );
    }
  }
  if (!auffaellig.length) return false;
  return melde('importe', 'Importe veraltet',
    'Diese Daten sind aelter, als sie sein duerften -- der zugehoerige Lauf ist ' +
    'entweder fehlgeschlagen oder gar nicht erst gestartet:\n\n' + auffaellig.join('\n'));
}

/* Datenbank erreichbar? Eine Frage, die nichts kostet. Laeuft haeufiger als die
 * uebrigen Pruefungen -- ohne Datenbank ist die App fuer alle unbenutzbar, das
 * soll nicht bis zum naechsten Morgen unbemerkt bleiben. */
export async function pruefeDatenbank() {
  try {
    await pool.query('SELECT 1');
    return false;
  } catch (err) {
    return melde('datenbank', 'Datenbank nicht erreichbar',
      `Die Anfrage "SELECT 1" schlug fehl:\n${err.message}`);
  }
}

/* ---- Start ---- */

const EIN_TAG = 24 * 60 * 60 * 1000;
const DATENBANK_TAKT_MS = 5 * 60 * 1000;

// Taeglich um 07:00 UTC: nach allen Importen (Streaming 04:00, Kino 04:30,
// Discovery 05:00, Themen 05:15) und mit Luft fuer lange Laeufe.
const IMPORT_STUNDE_UTC = 7;
function msBisImportPruefung() {
  const jetzt = new Date();
  const ziel = new Date(jetzt);
  ziel.setUTCHours(IMPORT_STUNDE_UTC, 0, 0, 0);
  if (ziel <= jetzt) ziel.setUTCDate(ziel.getUTCDate() + 1);
  return ziel.getTime() - jetzt.getTime();
}

export function starteWache() {
  if (process.env.WACHE_DISABLED === '1') {
    console.log('[wache] deaktiviert (WACHE_DISABLED=1)');
    return;
  }

  const importLauf = () => {
    pruefeImporte().catch((err) => console.error('[wache] Importpruefung fehlgeschlagen:', err.message));
  };
  const wartezeit = msBisImportPruefung();
  console.log(`[wache] Importpruefung in ${Math.round(wartezeit / 60000)} Minuten (taeglich 07:00 UTC).`);
  setTimeout(function () { importLauf(); setInterval(importLauf, EIN_TAG); }, wartezeit);

  const dbLauf = () => {
    pruefeDatenbank().catch((err) => console.error('[wache] Datenbankpruefung fehlgeschlagen:', err.message));
  };
  setInterval(dbLauf, DATENBANK_TAKT_MS);

  /* Unbehandelte Fehler.
   *
   * uncaughtException: Node sagt selbst, dass der Prozess danach in einem
   * unbekannten Zustand ist -- also melden und beenden, Docker startet neu
   * (restart: unless-stopped). Der Versand bekommt eine Frist, sonst haenge ein
   * kaputter Prozess an einer Mail fest, die nie ankommt.
   *
   * unhandledRejection: hier wird BEWUSST nicht beendet. Node wuerde das von
   * sich aus tun; bei einer Anwendung, die im oeffentlichen Test steht, ist ein
   * weiterlaufender Server mit einer Mail im Postfach aber das kleinere Uebel
   * als einer, der wegen einer verirrten Rejection ausgeht. Die Routen sind
   * ohnehin durch asyncHandler abgesichert (siehe lib/asyncHandler.js), eine
   * Rejection kommt also aus dem Rand und nicht aus dem laufenden Betrieb.
   */
  process.on('uncaughtException', (err) => {
    const fertig = melde('absturz', 'Unbehandelter Fehler',
      `${err && err.stack ? err.stack : String(err)}\n\nDer Prozess wird beendet und neu gestartet.`);
    const frist = new Promise((r) => setTimeout(r, 5000));
    Promise.race([fertig, frist]).finally(() => process.exit(1));
  });

  process.on('unhandledRejection', (grund) => {
    melde('rejection', 'Unbehandelte Rejection',
      `${grund && grund.stack ? grund.stack : String(grund)}\n\nDer Prozess laeuft weiter.`)
      .catch(() => {});
  });

  console.log('[wache] aktiv -- Meldungen gehen an ' + WACHE_AN + '.');
}
