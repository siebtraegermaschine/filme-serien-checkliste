#!/usr/bin/env node
/*
 * personen-bulk-resolve.mjs – fuellt personen_resolution (Name -> TMDB-
 * Personen-ID + popularity) fuer alle Namen aus titles.director/cast_names.
 *
 * Hintergrund: die Personen-SEO-Seiten (routes/seo.js, /:locale/schauspieler/
 * und /regisseur/) laden Personen bisher nur "lazy" beim ersten Seitenaufruf
 * (siehe lib/personen.js) -- ohne echten Crawler-/Nutzertraffic bleibt
 * personen_resolution praktisch leer. Dieser Lauf loest EINMALIG alle
 * ~48.000 Namen im Katalog auf (Stand 18.09.2026) und speichert zusaetzlich
 * TMDBs popularity-Wert, der bisher nirgends gecacht wird -- das ist die
 * Datenbasis, auf der sich danach eine Priorisierungsschwelle fuer den
 * Content-Bau festlegen laesst (siehe Uebergabe "Ausbau: Redaktionelle
 * Personen-Seiten", Punkt 2).
 *
 * Nutzt dieselbe Namens-Heuristik wie resolvePersonId() in lib/personen.js
 * (exakte Namensgleichheit, sonst populaerster Treffer) -- schreibt aber
 * direkt in die Tabelle statt ueber die Lazy-Load-Funktion, damit sich der
 * Lauf ohne HTTP-Umweg durchtakten laesst.
 *
 * Bereits aufgeloeste Namen werden uebersprungen (personen_resolution.name
 * ist PRIMARY KEY) -- der Lauf ist deshalb sicher unterbrech- und
 * fortsetzbar, kein Zustand ausserhalb der Datenbank.
 *
 * Aufruf (siehe CLAUDE.md, Abschnitt "Server- und DB-Befehle" fuer den
 * Docker-Mount; lange Laufzeit -- mit setsid nohup abkoppeln):
 *   TMDB_API_KEY=xxxx node backend/scripts/personen-bulk-resolve.mjs
 *
 * Node >= 18 (globales fetch).
 */
import { pool } from '../db/pool.js';

const API = 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY;
if (!KEY) { console.error('TMDB_API_KEY fehlt.'); process.exit(1); }

// ~6 Anfragen/Sekunde -- gleiche Groessenordnung wie stream-fetch.mjs/
// cinema-fetch.mjs (120-200ms Pause), bewusst vorsichtig bei 48k Namen.
const PAUSE_MS = Number(process.env.PERSONEN_PAUSE_MS || 160);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ladeOffeneNamen() {
  const { rows } = await pool.query(`
    SELECT DISTINCT name FROM (
      SELECT director AS name FROM titles WHERE director IS NOT NULL AND director <> ''
      UNION
      SELECT unnest(cast_names) AS name FROM titles WHERE cast_names IS NOT NULL
    ) alle
    WHERE name IS NOT NULL AND name <> ''
      AND NOT EXISTS (SELECT 1 FROM personen_resolution pr WHERE pr.name = alle.name)
    ORDER BY name
  `);
  return rows.map((r) => r.name);
}

async function sucheEinmal(name, versuch = 0) {
  const url = new URL(`${API}/search/person`);
  url.searchParams.set('api_key', KEY);
  url.searchParams.set('query', name);
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    if (versuch >= 3) throw err;
    await sleep(2000 + versuch * 1000);
    return sucheEinmal(name, versuch + 1);
  }
  if (res.status === 429) {
    if (versuch >= 5) throw new Error('TMDB: dauerhaft Rate-Limit (429)');
    await sleep(2000 + versuch * 1000);
    return sucheEinmal(name, versuch + 1);
  }
  if (!res.ok) return { id: null, popularity: null };
  const data = await res.json();
  const treffer = (data.results || []).find((r) => r.name === name) || (data.results || [])[0];
  return treffer ? { id: treffer.id, popularity: treffer.popularity ?? null } : { id: null, popularity: null };
}

async function main() {
  const namen = await ladeOffeneNamen();
  console.log(`${namen.length} noch unaufgeloeste Namen.`);
  const begonnen = Date.now();
  let ok = 0, fehler = 0;
  for (let i = 0; i < namen.length; i++) {
    const name = namen[i];
    try {
      const { id, popularity } = await sucheEinmal(name);
      await pool.query(
        `INSERT INTO personen_resolution (name, tmdb_person_id, popularity) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET tmdb_person_id = EXCLUDED.tmdb_person_id,
           popularity = EXCLUDED.popularity, resolved_at = now()`,
        [name, id, popularity]
      );
      ok++;
    } catch (err) {
      fehler++;
      console.error(`Fehler bei "${name}": ${err.message}`);
    }
    if ((i + 1) % 500 === 0) {
      const vergangen = Math.round((Date.now() - begonnen) / 1000);
      console.log(`${i + 1}/${namen.length} (${ok} ok, ${fehler} Fehler, ${vergangen}s)`);
    }
    await sleep(PAUSE_MS);
  }
  console.log(`Fertig: ${ok} aufgeloest, ${fehler} Fehler, ${Math.round((Date.now() - begonnen) / 1000)}s.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
