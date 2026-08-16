// Personendaten fuer Schauspieler-/Regisseur-SEO-Seiten (Phase 1b,
// PLAN-SEO.md 1.5/1.6). Verzoegerter TMDB-Abruf + Cache -- dasselbe Muster
// wie ergaenzeBackdrop() in share.js und trailerAusliefern() in trailers.js:
// kein Vorab-Abruf fuer den ganzen Katalog, sondern erst beim ersten
// Seitenaufruf, danach dauerhaft gecacht.
//
// WICHTIG: Die Biografie ist TMDBs eigener Text, unveraendert uebernommen
// (siehe schema.sql-Kommentar bei personen_cache). Hier wird NICHTS über
// echte Personen frei formuliert oder erfunden.
import { pool } from '../db/pool.js';

const API = 'https://api.themoviedb.org/3';

// Sucht die TMDB-Personen-ID zu einem Namen aus titles.director/cast_names.
// Bewusst nur exakte Namensgleichheit als "sicherer" Treffer, sonst der
// populaerste Treffer der Suche -- Namenskollisionen (zwei Personen mit
// gleichem Namen) sind ein bekanntes Restrisiko, siehe PLAN-SEO.md.
export async function resolvePersonId(name) {
  const { rows } = await pool.query(`SELECT tmdb_person_id FROM personen_resolution WHERE name = $1`, [name]);
  if (rows.length) return rows[0].tmdb_person_id; // kann null sein: bereits erfolglos gesucht

  const key = process.env.TMDB_API_KEY;
  if (!key || !name) return null;
  let gefunden = null;
  try {
    const url = new URL(`${API}/search/person`);
    url.searchParams.set('api_key', key);
    url.searchParams.set('query', name);
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      const treffer = (data.results || []).find((r) => r.name === name) || (data.results || [])[0];
      gefunden = treffer ? treffer.id : null;
    }
  } catch (err) {
    console.error(`personen: TMDB-Personensuche fehlgeschlagen (${name}):`, err.message);
    return null; // NICHT als erfolglos cachen -- naechstes Mal erneut versuchen
  }
  await pool.query(
    `INSERT INTO personen_resolution (name, tmdb_person_id) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET tmdb_person_id = EXCLUDED.tmdb_person_id, resolved_at = now()`,
    [name, gefunden]
  );
  return gefunden;
}

// Wie resolvePersonId(), aber OHNE TMDB-Live-Abruf -- reiner Cache-Blick.
// Fuer Stellen, die keine Verzoegerung durch einen Netzwerk-Aufruf vertragen
// (z.B. den Regie-Link auf der Titelseite: der soll nicht bei jedem
// Crawler-Treffer auf eine noch unaufgeloeste Person warten).
export async function resolvePersonIdCachedOnly(name) {
  const { rows } = await pool.query(`SELECT tmdb_person_id FROM personen_resolution WHERE name = $1`, [name]);
  return rows.length ? rows[0].tmdb_person_id : null;
}

export async function ladePersonDaten(tmdbPersonId) {
  const { rows } = await pool.query(`SELECT * FROM personen_cache WHERE tmdb_person_id = $1`, [tmdbPersonId]);
  if (rows.length) return rows[0];

  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  try {
    const url = new URL(`${API}/person/${tmdbPersonId}`);
    url.searchParams.set('api_key', key);
    url.searchParams.set('language', 'de-DE');
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const d = await res.json();
    // Deutsche Biografie oft leer bei TMDB -- englischer Rueckfall ist
    // besser als eine leere Seite.
    let biografie = d.biography || null;
    if (!biografie) {
      const urlEn = new URL(`${API}/person/${tmdbPersonId}`);
      urlEn.searchParams.set('api_key', key);
      const resEn = await fetch(urlEn, { signal: AbortSignal.timeout(8000) });
      if (resEn.ok) biografie = (await resEn.json()).biography || null;
    }
    const row = {
      tmdb_person_id: tmdbPersonId, name: d.name,
      biografie, foto_pfad: d.profile_path || null, geburtstag: d.birthday || null,
    };
    await pool.query(
      `INSERT INTO personen_cache (tmdb_person_id, name, biografie, foto_pfad, geburtstag)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tmdb_person_id) DO UPDATE SET
         name = EXCLUDED.name, biografie = EXCLUDED.biografie, foto_pfad = EXCLUDED.foto_pfad,
         geburtstag = EXCLUDED.geburtstag, fetched_at = now()`,
      [row.tmdb_person_id, row.name, row.biografie, row.foto_pfad, row.geburtstag]
    );
    return row;
  } catch (err) {
    console.error(`personen: TMDB-Personendaten fehlgeschlagen (${tmdbPersonId}):`, err.message);
    return null;
  }
}
