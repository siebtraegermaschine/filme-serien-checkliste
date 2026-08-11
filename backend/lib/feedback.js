import { pool } from '../db/pool.js';

// Laenge einer Rueckmeldung. Steht hier und nicht in der Route, weil die
// Datenbank denselben Wert kennen muss -- laenger abgeschnitten als gespeichert
// waere schlimmer als beides gleich.
export const MAX_LENGTH = 5000;

// Aufbewahrung, zugesagt in Abschnitt 10 der Datenschutzerklaerung. Wer die
// Zahl hier aendert, muss den Rechtstext mitaendern -- deshalb steht sie an
// genau einer Stelle.
export const AUFBEWAHRUNG_MONATE = 12;

// Schreibt eine Rueckmeldung weg und gibt die Kennung zurueck.
//
// Reihenfolge ist Absicht: Erst speichern, dann mailen. Vorher lief es
// andersherum, und ein Ausfall des Versanddienstes bedeutete, dass die
// Nachricht ersatzlos weg war. Jetzt kann der Versand scheitern, ohne dass die
// Rueckmeldung verlorengeht; scheitert dagegen das Speichern, bricht die
// Anfrage ab -- dann soll die Person es noch einmal versuchen koennen, statt zu
// glauben, es sei angekommen.
export async function speichereFeedback({ nachricht, userId = null, email = null }) {
  const { rows } = await pool.query(
    `INSERT INTO feedback (nachricht, user_id, email)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [nachricht, userId, email]
  );
  return rows[0].id;
}

// Loescht Rueckmeldungen nach Ablauf der Aufbewahrung.
export async function raeumeAltesFeedback() {
  const { rowCount } = await pool.query(
    `DELETE FROM feedback
      WHERE erstellt_am < now() - ($1 || ' months')::interval`,
    [String(AUFBEWAHRUNG_MONATE)]
  );
  return rowCount;
}

// Gleiches Muster wie starteAufraeumen: kurz nach dem Start einmal, danach
// taeglich. Ein verpasster Lauf holt sich beim naechsten nach -- die Bedingung
// ist zeitbasiert, nicht ereignisgesteuert.
export function starteFeedbackAufraeumen() {
  const EIN_TAG = 24 * 60 * 60 * 1000;
  const lauf = () => {
    raeumeAltesFeedback()
      .then((anzahl) => {
        if (anzahl) console.log(`[feedback] ${anzahl} Rueckmeldung(en) nach ${AUFBEWAHRUNG_MONATE} Monaten geloescht.`);
      })
      .catch((err) => console.error('[feedback] Aufraeumen fehlgeschlagen:', err.message));
  };
  // Etwas spaeter als das Konto-Aufraeumen, damit beim Hochfahren nicht
  // mehrere Laeufe gleichzeitig auf der Datenbank liegen.
  setTimeout(lauf, 45_000);
  setInterval(lauf, EIN_TAG);
}
