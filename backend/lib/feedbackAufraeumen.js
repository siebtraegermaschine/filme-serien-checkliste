import { pool } from '../db/pool.js';

// Loescht Rueckmeldungen, die aelter sind als die in der Datenschutzerklaerung
// (Abschnitt 10) zugesagte Frist.
//
// Der Lauf gehoert zwingend dazu: Sobald im Rechtstext eine Speicherdauer
// steht, ist sie eine Zusage und keine Absichtserklaerung. Ohne diesen Job
// laegen Rueckmeldungen unbegrenzt in der Datenbank, waehrend die Erklaerung
// zwoelf Monate nennt.
//
// "Sobald das Anliegen erledigt ist" laesst sich nicht automatisch feststellen
// -- das bleibt Handarbeit. Die Frist hier ist die Obergrenze, nicht die Regel.
export const AUFBEWAHRUNG_TAGE = 365;

export async function raeumeAltesFeedback() {
  const { rowCount } = await pool.query(
    `DELETE FROM feedback WHERE erstellt_am < now() - ($1 || ' days')::interval`,
    [String(AUFBEWAHRUNG_TAGE)]
  );
  if (rowCount) console.log(`[feedbackAufraeumen] ${rowCount} Rueckmeldungen nach Ablauf der Frist geloescht.`);
  return rowCount;
}

export function starteFeedbackAufraeumen() {
  const EIN_TAG = 24 * 60 * 60 * 1000;
  const lauf = () => {
    raeumeAltesFeedback().catch((err) =>
      console.error('[feedbackAufraeumen] Lauf fehlgeschlagen:', err.message)
    );
  };
  // Wie beim Konto-Aufraeumen kurz nach dem Start, danach taeglich. Ein
  // verpasster Lauf holt sich von selbst nach -- die Bedingung ist zeitbasiert.
  setTimeout(lauf, 45_000);
  setInterval(lauf, EIN_TAG);
}
