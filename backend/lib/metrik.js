/* Anonyme Trichter-Zaehler (IDEEN-WACHSTUM.md, Abschnitt 3).

   Vier Schritte, je Tag eine Zahl, keinerlei Kennungen:

     besuch            -- ein Geraet meldet sich hoechstens einmal am Tag
                          (localStorage-Merker im Frontend, siehe metrikMelden)
     erste-markierung  -- ein Geraet meldet seine allererste Markierung,
                          einmal ueberhaupt (auch anonyme Onboarding-Marken)
     konto             -- serverseitig beim Registrieren gezaehlt
     zehn-titel        -- serverseitig, wenn ein Konto erstmals 10 markierte
                          Titel erreicht (Merker users.metrik_zehn)

   Das Zaehlen darf NIE eine eigentliche Aktion scheitern lassen -- deshalb
   faengt metrikZaehlen alles und meldet Fehler nur ins Protokoll. */
import { pool } from '../db/pool.js';

export const CLIENT_SCHRITTE = ['besuch', 'erste-markierung'];

export async function metrikZaehlen(schritt) {
  try {
    await pool.query(
      `INSERT INTO metrik_tage (tag, schritt, anzahl) VALUES (CURRENT_DATE, $1, 1)
       ON CONFLICT (tag, schritt) DO UPDATE SET anzahl = metrik_tage.anzahl + 1`,
      [schritt]
    );
  } catch (err) {
    console.error('metrikZaehlen fehlgeschlagen:', err.message);
  }
}

/* Nach einem Progress-Schreiben: Hat dieses Konto soeben erstmals 10
   markierte Titel (Watchlist + Gesehen) erreicht? Der Merker sorgt dafuer,
   dass jedes Konto genau einmal zaehlt; solange er gesetzt ist, kostet der
   Aufruf nur die eine Merker-Abfrage. */
export async function zehnTitelPruefen(userId) {
  try {
    const { rows } = await pool.query(`SELECT metrik_zehn FROM users WHERE id = $1`, [userId]);
    if (!rows[0] || rows[0].metrik_zehn) return;
    const { rows: z } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM user_progress
        WHERE user_id = $1 AND (seen OR watchlist)`,
      [userId]
    );
    if (z[0].n < 10) return;
    const { rowCount } = await pool.query(
      `UPDATE users SET metrik_zehn = TRUE WHERE id = $1 AND NOT metrik_zehn`,
      [userId]
    );
    if (rowCount) await metrikZaehlen('zehn-titel');
  } catch (err) {
    console.error('zehnTitelPruefen fehlgeschlagen:', err.message);
  }
}

/* ---- Auswertungen fuer npm run metrik (keine HTTP-Route) ---- */

export async function trichter(tage) {
  const { rows } = await pool.query(
    `SELECT tag, schritt, anzahl FROM metrik_tage
      WHERE tag > CURRENT_DATE - $1::int ORDER BY tag, schritt`,
    [tage]
  );
  return rows;
}

export async function einladungen() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS konten,
            COUNT(invited_by_user_id)::int AS geworben
       FROM users`
  );
  const { rows: werber } = await pool.query(
    `SELECT u.display_name AS name, COUNT(*)::int AS geworben
       FROM users g JOIN users u ON u.id = g.invited_by_user_id
      GROUP BY u.display_name ORDER BY geworben DESC LIMIT 10`
  );
  return { ...rows[0], werber };
}

export async function movieNight(tage) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS runden,
            COALESCE(AVG(t.n), 0)::numeric(10,1) AS teilnehmer_je_runde
       FROM movie_night_runden r
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT teilnehmer) AS n
           FROM movie_night_stimmen s WHERE s.runde_id = r.id
       ) t ON TRUE
      WHERE r.created_at > now() - ($1 || ' days')::interval`,
    [tage]
  );
  return rows[0];
}

export async function wiederkehr() {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT CASE WHEN updated_at > now() - interval '7 days'  THEN user_id END)::int AS tage7,
            COUNT(DISTINCT CASE WHEN updated_at > now() - interval '30 days' THEN user_id END)::int AS tage30
       FROM user_progress`
  );
  return rows[0];
}
