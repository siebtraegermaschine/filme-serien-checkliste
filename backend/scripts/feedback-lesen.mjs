/* Liest die Rueckmeldungen aus dem Feedback-Formular aus (Tabelle `feedback`,
   siehe backend/routes/feedback.js).

   Aufruf im Backend-Verzeichnis:

     npm run feedback                 # die letzten 50, neueste zuerst
     npm run feedback -- --alle       # ohne Begrenzung
     npm run feedback -- --seit 2026-08-01
     npm run feedback -- --csv        # CSV nach stdout, zum Umleiten in eine Datei

   Bewusst ohne HTTP-Route -- dieselbe Ueberlegung wie bei
   bewertungsstatistik.mjs: Was Freitext von Fremden enthaelt, soll nicht hinter
   einer URL liegen, die irgendwann offen im Netz steht. */
import 'dotenv/config';
import { pool } from '../db/pool.js';

const argv = process.argv.slice(2);
const alsCsv = argv.includes('--csv');
const alle = argv.includes('--alle');
const STANDARD_ANZAHL = 50;

function argWert(name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

const seit = argWert('--seit');
if (seit && Number.isNaN(Date.parse(seit))) {
  console.error(`Unbrauchbares Datum bei --seit: ${seit} (erwartet z.B. 2026-08-01).`);
  process.exit(1);
}

function csvFeld(wert) {
  const s = String(wert ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Anzeige in der Ortszeit des Servers -- die Zahlen sollen zu dem passen, was
// man im Postfach danebenliegen hat.
function zeitpunkt(d) {
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

async function main() {
  const bedingungen = [];
  const werte = [];
  if (seit) {
    werte.push(seit);
    bedingungen.push(`erstellt_am >= $${werte.length}`);
  }
  const where = bedingungen.length ? 'WHERE ' + bedingungen.join(' AND ') : '';
  let limit = '';
  if (!alle && !alsCsv) {
    werte.push(STANDARD_ANZAHL);
    limit = `LIMIT $${werte.length}`;
  }

  const { rows } = await pool.query(
    `SELECT f.id, f.nachricht, f.email, f.user_id, f.erstellt_am,
            (f.user_id IS NOT NULL) AS konto_besteht
       FROM feedback f
       ${where}
      ORDER BY f.erstellt_am DESC
      ${limit}`,
    werte
  );

  if (alsCsv) {
    console.log(['id', 'erstellt_am', 'email', 'konto_besteht', 'nachricht'].join(','));
    for (const z of rows) {
      console.log([z.id, z.erstellt_am.toISOString(), z.email || '', z.konto_besteht, z.nachricht]
        .map(csvFeld).join(','));
    }
    console.error(`${rows.length} Rueckmeldungen ausgegeben.`);
    return;
  }

  if (!rows.length) {
    console.log('Keine Rueckmeldungen' + (seit ? ` seit ${seit}` : '') + '.');
    return;
  }

  const { rows: [{ gesamt }] } = await pool.query('SELECT count(*)::int AS gesamt FROM feedback');
  console.log(`${rows.length} von ${gesamt} Rueckmeldungen, neueste zuerst.`);
  if (!alle && rows.length === STANDARD_ANZAHL && gesamt > STANDARD_ANZAHL) {
    console.log('(--alle zeigt den Rest.)');
  }

  for (const z of rows) {
    // Absender: die Adresse zum Zeitpunkt der Absendung. Steht sie da, ohne dass
    // noch ein Konto daranhaengt, ist das Konto seither geloescht worden -- die
    // Adresse bleibt trotzdem stehen, sonst liefe die Antwort ins Leere.
    let von = 'anonym';
    if (z.email) von = z.email + (z.konto_besteht ? '' : ' (Konto geloescht)');
    console.log('');
    console.log(`--- Nr. ${z.id} · ${zeitpunkt(z.erstellt_am)} · ${von}`);
    console.log(z.nachricht);
  }
}

main()
  .catch((err) => {
    console.error('Auslesen fehlgeschlagen:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
