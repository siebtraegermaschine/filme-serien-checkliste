import { pool } from '../db/pool.js';

/* Die anonyme Bewertungsstatistik aus Abschnitt 9 der Datenschutzerklaerung --
   und die EINZIGE Stelle, an der sie entsteht.

   Zugesagt ist dort woertlich: weitergegeben werden ausschliesslich "Titel,
   Gesamtzahl der Bewertungen und deren Verteilung auf die Sterne-Stufen", ohne
   Nutzerkennungen und ohne Zeitpunkte, und "Titel werden erst ab einer
   Mindestzahl von Bewertungen einbezogen, ab der sich einzelne Bewertungen
   nicht mehr herauslesen lassen".

   Genau das setzt diese Datei durch. Wer eine Auswertung braucht, nimmt sie
   hier heraus -- nicht per Hand geschriebenes SQL gegen user_progress. Dort
   haengt an jeder Zeile eine user_id, und die Zusage waere mit einem
   vergessenen HAVING gebrochen.

   Zwei Quellen fliessen zusammen, damit die Zahlen vollstaendig sind:
     - user_progress: die Bewertungen bestehender Konten
     - title_rating_stufen: die Bewertungen bereits geloeschter Konten,
       beim Loeschen dorthin aufaddiert (siehe kontoAufraeumen.js)

   Bekannte Grenze: Gezaehlt wird je title_id, und 591 Titel stehen doppelt im
   Bestand (kuratierter Eintrag plus TMDB-Abzug, siehe UEBERGABE-OFFEN.md
   Abschnitt 2.2). Ein solcher Titel erscheint in der Auswertung zweimal mit
   geteilter Zahl -- was die Mindestzahl eher zu streng als zu locker macht,
   also in die unschaedliche Richtung irrt. Sauber wird das erst, wenn die
   Entdopplung vom Server statt vom Browser kommt.
*/

/* Ein Titel wird erst ab dieser Zahl an Bewertungen ueberhaupt aufgenommen.

   20 ist bewusst hoch angesetzt. Die Verteilung ist feiner als die Gesamtzahl:
   Sie zerfaellt in bis zu zehn Stufen, und bei wenigen Bewertungen steht in
   einer Stufe schnell eine einzelne Person. Bei 20 Bewertungen aufwaerts ist
   auch eine einzeln besetzte Stufe nicht mehr zuzuordnen, weil offenbleibt,
   WER von den vielen sie abgegeben hat.

   Die Zahl steht absichtlich nicht in der Datenschutzerklaerung -- dort ist von
   "einer Mindestzahl" die Rede. Wird sie hier geaendert, aendert sich damit
   keine Zusage; nach unten sollte sie trotzdem niemand ohne Not schieben.

   Stand 10. August 2026 kommt damit KEIN Titel in die Auswertung: 247
   Bewertungen verteilen sich auf 217 Titel, der meistbewertete hat drei. Das
   ist kein Fehler, sondern der Zweck -- lieber eine leere Auswertung als eine,
   die die Zusage bricht. */
export const MINDESTZAHL_BEWERTUNGEN = 20;

/* Liefert je Titel: Gesamtzahl und die Verteilung auf die Stufen 1 bis 10.
   Titel unterhalb der Mindestzahl kommen gar nicht erst vor -- das HAVING
   greift auf der zusammengefassten Zahl, also inklusive der Bewertungen
   geloeschter Konten. */
export async function bewertungsstatistik() {
  const { rows } = await pool.query(
    `WITH alle AS (
       SELECT title_id, rating::smallint AS sterne, count(*)::int AS anzahl
         FROM user_progress
        WHERE rating IS NOT NULL
        GROUP BY title_id, rating
       UNION ALL
       SELECT title_id, sterne, anzahl
         FROM title_rating_stufen
     ),
     je_titel AS (
       SELECT title_id, sum(anzahl)::int AS gesamt
         FROM alle
        GROUP BY title_id
       HAVING sum(anzahl) >= $1
     )
     SELECT t.id            AS titel_id,
            t.title         AS titel,
            t.year          AS jahr,
            t.type          AS typ,
            j.gesamt        AS gesamt,
            (SELECT jsonb_object_agg(s.sterne, s.summe)
               FROM (SELECT sterne, sum(anzahl)::int AS summe
                       FROM alle
                      WHERE alle.title_id = j.title_id
                      GROUP BY sterne) s)  AS verteilung
       FROM je_titel j
       JOIN titles t ON t.id = j.title_id
      ORDER BY j.gesamt DESC, t.title ASC`,
    [MINDESTZAHL_BEWERTUNGEN]
  );

  // Die Verteilung als vollstaendige Reihe 1..10 zurueckgeben, damit eine
  // fehlende Stufe als 0 dasteht und nicht als Luecke, die jemand anders deutet.
  return rows.map((r) => ({
    titelId: Number(r.titel_id),
    titel: r.titel,
    jahr: r.jahr,
    typ: r.typ,
    gesamt: Number(r.gesamt),
    verteilung: Array.from({ length: 10 }, (_, i) => Number((r.verteilung || {})[i + 1] || 0)),
  }));
}

/* Wie viele Titel die Mindestzahl NICHT erreichen -- nur zur Einordnung beim
   Ausleiten ("3 von 217 Titeln aufgenommen"). Gibt selbst nichts preis. */
export async function zurueckgehalteneTitel() {
  const { rows } = await pool.query(
    `WITH alle AS (
       SELECT title_id, count(*)::int AS anzahl
         FROM user_progress
        WHERE rating IS NOT NULL
        GROUP BY title_id
       UNION ALL
       SELECT title_id, anzahl FROM title_rating_stats
     )
     SELECT count(*) FILTER (WHERE gesamt <  $1)::int AS zurueckgehalten,
            count(*) FILTER (WHERE gesamt >= $1)::int AS aufgenommen
       FROM (SELECT title_id, sum(anzahl)::int AS gesamt FROM alle GROUP BY title_id) t`,
    [MINDESTZAHL_BEWERTUNGEN]
  );
  return { zurueckgehalten: rows[0].zurueckgehalten, aufgenommen: rows[0].aufgenommen };
}
