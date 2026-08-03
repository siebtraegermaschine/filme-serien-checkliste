import { pool } from '../db/pool.js';

// Widerrufsfrist: Ein beantragtes Konto bleibt so lange vollstaendig erhalten
// und laesst sich durch erneutes Anmelden zurueckholen.
export const WIDERRUFSFRIST_TAGE = 14;

// Loescht ein Konto endgueltig. Der groesste Teil haengt per ON DELETE CASCADE
// am Nutzer (Fortschritt, ausgeblendete Titel, Verknuepfungen, Einladungen,
// Reset-Token) und verschwindet mit ihm.
//
// Zwei Dinge bleiben ausdruecklich ERHALTEN, jeweils ohne Personenbezug:
//   - Suchbegriffe: Sie sagen etwas darueber, wonach Leute suchen, und sollen
//     auswertbar bleiben. Statt sie zu loeschen, wird nur die E-Mail-Adresse
//     entfernt -- der Begriff selbst haengt danach an niemandem mehr.
//   - Sterne-Bewertungen: Sie werden je Titel in title_rating_stats
//     aufaddiert, BEVOR die user_progress-Zeilen kaskadierend verschwinden.
//     Dort landen nur Anzahl und Summe, keine Zeitstempel und keine Kennung --
//     es gibt also nichts, worueber sich Zeilen einer Person zuordnen liessen.
//
// Eines haengt technisch nicht am Nutzer und muss daher von Hand weg:
//   - die Sitzungstabelle von connect-pg-simple kennt keinen Fremdschluessel.
//
// Alles in einer Transaktion, damit kein Zwischenstand entstehen kann: Die
// Bewertungen sind erst gesichert, wenn auch der Nutzer wirklich weg ist.
export async function loescheKonto(userId, email) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO title_rating_stats (title_id, anzahl, summe_sterne)
       SELECT title_id, count(*)::int, sum(rating)::int
         FROM user_progress
        WHERE user_id = $1 AND rating IS NOT NULL
        GROUP BY title_id
       ON CONFLICT (title_id) DO UPDATE
          SET anzahl = title_rating_stats.anzahl + EXCLUDED.anzahl,
              summe_sterne = title_rating_stats.summe_sterne + EXCLUDED.summe_sterne`,
      [userId]
    );

    await client.query(`UPDATE search_queries SET user_email = NULL WHERE user_email = $1`, [email]);
    // sess ist JSON; die userId liegt dort als Zeichenkette (bigint aus pg).
    await client.query(`DELETE FROM session WHERE sess->>'userId' = $1`, [String(userId)]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Raeumt alle Konten ab, deren Frist abgelaufen ist. Laeuft beim Start des
// Servers und danach einmal taeglich -- bewusst im Backend statt als eigener
// GitHub-Job: Es braucht weder ein Secret noch eine oeffentliche Route, und der
// Container laeuft ohnehin durch. Ein verpasster Lauf holt sich beim naechsten
// Start nach, die Bedingung ist ja zeitbasiert und nicht ereignisgesteuert.
export async function raeumeAbgelaufeneKonten() {
  const { rows } = await pool.query(
    `SELECT id, email FROM users
      WHERE deletion_requested_at IS NOT NULL
        AND deletion_requested_at < now() - ($1 || ' days')::interval`,
    [String(WIDERRUFSFRIST_TAGE)]
  );
  for (const row of rows) {
    try {
      await loescheKonto(row.id, row.email);
      console.log(`[kontoAufraeumen] Konto ${row.id} nach Ablauf der Frist geloescht.`);
    } catch (err) {
      console.error(`[kontoAufraeumen] Konto ${row.id} konnte nicht geloescht werden:`, err.message);
    }
  }
  return rows.length;
}

export function starteAufraeumen() {
  const EIN_TAG = 24 * 60 * 60 * 1000;
  const lauf = () => {
    raeumeAbgelaufeneKonten().catch((err) =>
      console.error('[kontoAufraeumen] Lauf fehlgeschlagen:', err.message)
    );
  };
  // Kurz nach dem Start, damit ein frisch hochgefahrener Container nicht
  // gleichzeitig Migration und Aufraeumen stemmt.
  setTimeout(lauf, 30_000);
  setInterval(lauf, EIN_TAG);
}
