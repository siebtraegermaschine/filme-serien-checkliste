/* Liest die Rueckmeldungen aus dem Feedback-Formular.

   Aufruf im Backend-Verzeichnis:

     npm run feedback               # die letzten 50, neueste zuerst
     npm run feedback -- --alle     # alle
     npm run feedback -- --tage 7   # nur die letzten 7 Tage
     npm run feedback -- --csv      # CSV nach stdout, zum Umleiten in eine Datei

   Bewusst ohne HTTP-Route -- dieselbe Ueberlegung wie bei der
   Bewertungsstatistik: Was Freitext von Fremden enthaelt, soll nicht hinter
   einer Adresse liegen, die irgendwann offen im Netz steht. Wer es lesen will,
   hat ohnehin Zugriff auf den Server. */
import 'dotenv/config';
import { pool } from '../db/pool.js';
import { AUFBEWAHRUNG_MONATE } from '../lib/feedback.js';

const args = process.argv.slice(2);
const alsCsv = args.includes('--csv');
const alle = args.includes('--alle');

function zahlNach(flagge) {
  const i = args.indexOf(flagge);
  if (i === -1) return null;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const tage = zahlNach('--tage');
const grenze = alle ? null : 50;

function csvFeld(wert) {
  const s = String(wert ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function datum(d) {
  return new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

async function main() {
  const bedingungen = [];
  const werte = [];
  if (tage) {
    werte.push(String(tage));
    bedingungen.push(`erstellt_am > now() - ($${werte.length} || ' days')::interval`);
  }
  const wo = bedingungen.length ? 'WHERE ' + bedingungen.join(' AND ') : '';
  let sql = `SELECT id, nachricht, email, user_id, erstellt_am
               FROM feedback ${wo}
              ORDER BY erstellt_am DESC`;
  if (grenze) {
    werte.push(String(grenze));
    sql += ` LIMIT $${werte.length}`;
  }

  const { rows } = await pool.query(sql, werte);
  const gesamt = (await pool.query('SELECT count(*)::int AS n FROM feedback')).rows[0].n;

  if (alsCsv) {
    console.log(['zeitpunkt', 'email', 'nachricht'].join(','));
    for (const r of rows) {
      console.log([r.erstellt_am.toISOString(), r.email || '', r.nachricht].map(csvFeld).join(','));
    }
    // Die Einordnung nach stderr, damit sie eine umgeleitete CSV nicht verschmutzt.
    console.error(`${rows.length} von ${gesamt} Rueckmeldungen ausgegeben.`);
    return;
  }

  if (!rows.length) {
    console.log(tage ? `Keine Rueckmeldungen in den letzten ${tage} Tagen.` : 'Noch keine Rueckmeldungen.');
    return;
  }

  console.log(`${rows.length} von ${gesamt} Rueckmeldungen, neueste zuerst.`);
  console.log(`Aufbewahrung: ${AUFBEWAHRUNG_MONATE} Monate, danach werden sie geloescht.\n`);
  for (const r of rows) {
    // Die Adresse fehlt bei nicht angemeldeten Personen; steht sie da, ist das
    // Konto inzwischen geloescht, wenn user_id leer ist.
    const wer = r.email ? (r.user_id ? r.email : `${r.email} (Konto geloescht)`) : 'anonym';
    console.log(`— ${datum(r.erstellt_am)} · ${wer} · #${r.id}`);
    console.log(r.nachricht.split('\n').map((z) => '  ' + z).join('\n'));
    console.log('');
  }
  if (!alle && gesamt > rows.length) {
    console.log(`… ${gesamt - rows.length} weitere. Mit --alle vollstaendig.`);
  }
}

main()
  .catch((err) => {
    console.error('Auslesen fehlgeschlagen:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
