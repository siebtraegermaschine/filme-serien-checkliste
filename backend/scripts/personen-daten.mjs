// Gemeinsame Datenzugriffe fuer die Personentext-Skripte (personen-batch,
// personen-pakete, personen-einspielen). Eine Quelle der Wahrheit, damit
// Paket-Datensatz (was das Modell sieht) und Einspiel-Pruefung (wogegen
// geprueft wird) garantiert denselben Stand haben -- sonst melden Zahlen und
// Titel aus einem anderen Alias der Person Fehlalarme.
import { pool } from '../db/pool.js';

const NOTE_SQL = `CASE WHEN COALESCE(rating, 0) = 0 THEN 0
  ELSE (COALESCE(vote_count, 0)::float / (COALESCE(vote_count, 0) + 1000)) * rating
     + (1000::float / (COALESCE(vote_count, 0) + 1000)) * 6.76 END`;

const geburtstagString = (wert) => {
  if (!wert) return null;
  const d = new Date(wert);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Offene Rollen-Eintraege (Schwelle, Biografie vorhanden, Namenskollisions-
// Plausibilitaetscheck, kein seo_content-Eintrag). Ein tmdb_id kann mehrere
// Namens-Aliase in personen_resolution haben -- Gruppierung nach tmdb_id
// verhindert doppelte Schluessel (die Batch-API lehnt doppelte custom_ids ab).
// `ausschluss`: Schluessel, die in diesem Lauf schon versucht wurden.
// `mischen`: Text-Seed fuer eine reproduzierbare Zufallsreihenfolge statt
// tmdb_id-Reihenfolge (Stichproben ueber die ganze Restmenge).
export async function kandidaten({ locale = 'de-de', limit, minTitel = 2, ausschluss = [], mischen = null }) {
  const { rows } = await pool.query(
    `WITH regie AS (
       SELECT director AS name, count(*) AS anzahl
         FROM titles WHERE director IS NOT NULL AND director <> '' GROUP BY director
     ),
     besetzung AS (
       SELECT unnest(cast_names) AS name, count(*) AS anzahl
         FROM titles WHERE cast_names IS NOT NULL GROUP BY unnest(cast_names)
     ),
     titelzahl AS (
       SELECT name, sum(anzahl) AS gesamt FROM (
         SELECT * FROM regie UNION ALL SELECT * FROM besetzung
       ) x GROUP BY name
     ),
     fruehestes AS (
       SELECT name, min(year) AS jahr FROM (
         SELECT director AS name, year FROM titles WHERE director IS NOT NULL AND director <> '' AND year IS NOT NULL
         UNION ALL
         SELECT unnest(cast_names) AS name, year FROM titles WHERE cast_names IS NOT NULL AND year IS NOT NULL
       ) x GROUP BY name
     ),
     personen AS (
       SELECT pr.tmdb_person_id AS tmdb_id, array_agg(DISTINCT pr.name) AS namen,
              max(pc.biografie) AS biografie, max(pc.geburtstag) AS geburtstag,
              sum(coalesce(r.anzahl, 0)) AS regie_anzahl, sum(coalesce(b.anzahl, 0)) AS besetzung_anzahl
         FROM personen_resolution pr
         JOIN titelzahl t ON t.name = pr.name
         JOIN personen_cache pc ON pc.tmdb_person_id = pr.tmdb_person_id
         LEFT JOIN regie r ON r.name = pr.name
         LEFT JOIN besetzung b ON b.name = pr.name
         LEFT JOIN fruehestes f ON f.name = pr.name
        WHERE pr.tmdb_person_id IS NOT NULL
          AND t.gesamt >= $1
          AND pc.biografie IS NOT NULL AND pc.biografie <> ''
          AND NOT (
                pc.geburtstag IS NOT NULL AND f.jahr IS NOT NULL
                AND (extract(year FROM pc.geburtstag)::int > f.jahr
                     OR f.jahr - extract(year FROM pc.geburtstag)::int < 5)
              )
        GROUP BY pr.tmdb_person_id
     ),
     rollen AS (
       SELECT tmdb_id, namen, biografie, geburtstag, 'regisseur' AS rolle FROM personen WHERE regie_anzahl > 0
       UNION ALL
       SELECT tmdb_id, namen, biografie, geburtstag, 'schauspieler' AS rolle FROM personen WHERE besetzung_anzahl > 0
     )
     SELECT tmdb_id, namen, biografie, geburtstag, rolle
       FROM rollen r
      WHERE NOT EXISTS (
              SELECT 1 FROM seo_content s
               WHERE s.bereich = 'person' AND s.locale = $2
                 AND s.schluessel = r.rolle || ':' || r.tmdb_id)
        AND NOT (r.rolle || ':' || r.tmdb_id = ANY($4::text[]))
      ORDER BY CASE WHEN $5::text IS NULL THEN '' ELSE md5(r.tmdb_id::text || r.rolle || $5::text) END, r.tmdb_id, r.rolle
      LIMIT $3`,
    [minTitel, locale, limit, [...ausschluss], mischen]
  );
  return rows;
}

// namen: alle Aliase derselben tmdb_id -- ein Titel kann unter einem anderen
// Alias verzeichnet sein als dem, der als Name angezeigt wird.
export async function filmografieFuerRolle(namen, rolle) {
  const bedingung = rolle === 'regisseur' ? 'director = ANY($1::text[])' : 'cast_names && $1::text[]';
  const { rows } = await pool.query(
    `SELECT title, year, type, genres, rating FROM titles
      WHERE ${bedingung} ORDER BY ${NOTE_SQL} DESC LIMIT 24`,
    [namen]
  );
  return rows;
}

// Baut das Person-Objekt, das datensatzPerson()/faktenVerdachtPerson() erwarten.
export async function personObjekt(row) {
  const filme = await filmografieFuerRolle(row.namen, row.rolle);
  return {
    name: row.namen[0],
    rolle: row.rolle === 'regisseur' ? 'Regisseur/in' : 'Schauspieler/in',
    geburtstag: geburtstagString(row.geburtstag),
    biografie: row.biografie,
    filmografie: filme.map((f) => ({ title: f.title, year: f.year, type: f.type, genres: f.genres || [], rating: f.rating })),
  };
}

// Person zu einem Schluessel `rolle:tmdbPersonId` oder null.
export async function personZuSchluessel(schluessel) {
  const [rolle, tmdbIdStr] = String(schluessel).split(':');
  const tmdbId = Number(tmdbIdStr);
  if (!['regisseur', 'schauspieler'].includes(rolle) || !Number.isInteger(tmdbId)) return null;
  const { rows } = await pool.query(
    `SELECT array_agg(DISTINCT pr.name) AS namen, max(pc.biografie) AS biografie, max(pc.geburtstag) AS geburtstag
       FROM personen_resolution pr
       JOIN personen_cache pc ON pc.tmdb_person_id = pr.tmdb_person_id
      WHERE pr.tmdb_person_id = $1
      GROUP BY pr.tmdb_person_id`,
    [tmdbId]
  );
  if (!rows.length) return null;
  const p = await personObjekt({ ...rows[0], tmdb_id: tmdbId, rolle });
  return p.filmografie.length ? p : null;
}
