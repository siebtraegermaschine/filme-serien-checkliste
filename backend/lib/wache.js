import { pool } from '../db/pool.js';
import { sendMail } from './mailer.js';

/* Meldet Stoerungen per E-Mail -- und zwar NUR Stoerungen.
 *
 * Kein taegliches "laeuft alles": Wer jeden Morgen dieselbe Mail wegklickt,
 * klickt irgendwann auch die eine weg, auf die es ankommt.
 *
 * Was diese Loesung ausdruecklich NICHT abdeckt: einen stehenden Server. Wer
 * nicht laeuft, meldet auch nichts. Dafuer braeuchte es eine Pruefung von
 * aussen -- bewusst vertagt (Entscheidung 4 in PLAN-OEFFENTLICHER-TEST.md).
 */

const EMPFAENGER = 'info@digital-wings.com';

// Je Art hoechstens eine Meldung pro Tag. Ohne diese Sperre schickt ein
// Dauerfehler -- etwa eine nicht erreichbare Datenbank -- hunderte Mails, und
// das Postfach wird unbrauchbar, genau wenn man es braucht.
const zuletztGemeldet = new Map();

// Meldungen, deren Versand selbst gescheitert ist. Sie per Mail zu melden waere
// sinnlos, also warten sie hier auf den naechsten erfolgreichen Versand und
// fahren dann mit.
const nachzureichen = [];

function heute() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Meldet eine Stoerung. Mehrfache Aufrufe derselben `art` am selben Tag
 * schicken nur eine Mail.
 *
 * @param {string} art  Kurzname der Stoerung, z.B. 'import-streaming'.
 * @param {string} betreff
 * @param {string} text
 */
export async function melde(art, betreff, text) {
  if (zuletztGemeldet.get(art) === heute()) return false;
  zuletztGemeldet.set(art, heute());

  const zeit = new Date().toISOString();
  let voll = `${text}\n\nZeitpunkt: ${zeit}\nArt: ${art}`;
  if (nachzureichen.length) {
    voll += `\n\n--- Nachgereicht (Versand war zuvor gescheitert) ---\n` + nachzureichen.join('\n\n');
  }

  try {
    await sendMail({ to: EMPFAENGER, subject: `MovieMatch Wache: ${betreff}`, text: voll });
    nachzureichen.length = 0;
    console.warn(`[wache] gemeldet: ${art} -- ${betreff}`);
    return true;
  } catch (err) {
    // Nicht per Mail melden, dass die Mail nicht geht. Ins Protokoll, und beim
    // naechsten erfolgreichen Versand faehrt es mit.
    console.error(`[wache] Meldung "${art}" konnte nicht verschickt werden:`, err.message);
    nachzureichen.push(`[${zeit}] ${betreff}\n${text}`);
    // Sperre zuruecknehmen: Sonst gilt die Stoerung als gemeldet, obwohl
    // niemand sie gesehen hat.
    zuletztGemeldet.delete(art);
    return false;
  }
}

/* Die taeglichen Importe. "Bleibt aus" ist der wichtigere Fall: Ein Job, der
   gar nicht laeuft, meldet von sich aus nichts -- ein fehlgeschlagener
   wenigstens in GitHub Actions.

   Gemessen wird am juengsten Zeitstempel der jeweiligen Tabelle. Die Grenzen
   liegen bewusst deutlich ueber dem Takt, damit eine verspaetete oder einmal
   uebersprungene Ausfuehrung nicht sofort Alarm ausloest. */
const IMPORTE = [
  {
    art: 'import-streaming',
    name: 'Streaming-Import',
    takt: 'taeglich 04:00 UTC',
    frage: 'SELECT max(fetched_at) AS zuletzt FROM streaming_cache',
    grenzeStunden: 36,
  },
  {
    art: 'import-kino',
    name: 'Kino-Import',
    takt: 'taeglich 04:30 UTC',
    frage: 'SELECT max(fetched_at) AS zuletzt FROM cinema_cache',
    grenzeStunden: 36,
  },
  {
    art: 'import-katalog',
    name: 'Katalog-Import (rated-titles)',
    takt: 'alle zwei Tage 05:00 UTC',
    frage: 'SELECT max(updated_at) AS zuletzt FROM titles',
    grenzeStunden: 84,
  },
];

export async function pruefeImporte() {
  for (const imp of IMPORTE) {
    let zuletzt;
    try {
      const { rows } = await pool.query(imp.frage);
      zuletzt = rows[0]?.zuletzt;
    } catch (err) {
      // Nicht erreichbare Datenbank ist eine eigene Meldung, keine drei.
      await melde(
        'datenbank',
        'Datenbank nicht erreichbar',
        `Die Pruefung der Importe konnte nicht ausgefuehrt werden.\n\nFehler: ${err.message}`
      );
      return;
    }

    if (!zuletzt) {
      await melde(imp.art, `${imp.name} hat noch nie gelaufen`,
        `In der zugehoerigen Tabelle steht kein einziger Zeitstempel.\nTakt: ${imp.takt}.`);
      continue;
    }

    const stunden = (Date.now() - new Date(zuletzt).getTime()) / 3_600_000;
    if (stunden > imp.grenzeStunden) {
      await melde(imp.art, `${imp.name} bleibt aus`,
        `Letzter Eintrag vor ${Math.round(stunden)} Stunden (${new Date(zuletzt).toISOString()}).\n` +
        `Erwartet: ${imp.takt}, Grenze: ${imp.grenzeStunden} Stunden.\n\n` +
        `Zu pruefen: der zugehoerige GitHub-Workflow und ob das Ingest-Secret noch stimmt.`);
    }
  }
}

export function starteWache() {
  const EIN_TAG = 24 * 60 * 60 * 1000;
  const lauf = () => {
    pruefeImporte().catch((err) => console.error('[wache] Lauf fehlgeschlagen:', err.message));
  };
  // Nach den anderen Startaufgaben, damit sie nicht gleichzeitig auf der
  // Datenbank liegen (Aufraeumen 30s, Feedback 45s, Sicherung 120s).
  setTimeout(lauf, 180_000);
  setInterval(lauf, EIN_TAG);
}

/* Unbehandelte Fehler. Beide Ereignisse bedeuten, dass der Prozess in einem
   Zustand ist, den niemand vorgesehen hat -- der Vorgang wird bewusst NICHT
   beendet, aber er soll auch nicht unbemerkt bleiben.

   Bei uncaughtException wird nach der Meldung beendet: Node empfiehlt das
   ausdruecklich, weil der Prozess danach als unzuverlaessig gilt. Docker
   startet den Container ohnehin neu (restart: unless-stopped). */
export function ueberwacheProzess() {
  process.on('unhandledRejection', (grund) => {
    const text = grund instanceof Error ? `${grund.message}\n\n${grund.stack}` : String(grund);
    console.error('[wache] unhandledRejection:', text);
    melde('unhandled-rejection', 'Unbehandelter Fehler (Promise)', text).catch(() => {});
  });

  process.on('uncaughtException', (err) => {
    console.error('[wache] uncaughtException:', err);
    melde('uncaught-exception', 'Unbehandelter Fehler (Ausnahme)', `${err.message}\n\n${err.stack}`)
      .catch(() => {})
      .finally(() => setTimeout(() => process.exit(1), 2000));
  });
}
