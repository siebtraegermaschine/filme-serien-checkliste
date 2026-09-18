#!/usr/bin/env node
/*
 * personen-detail-bulk.mjs – laedt TMDB-Personendetails (Biografie,
 * Geburtsdatum, known_for_department) fuer alle priorisierten Personen
 * (>=2 Titel im Katalog, siehe STATUS.md) vorab in personen_cache.
 *
 * Hintergrund: der Namenskollisions-Plausibilitaetscheck (Geburtsdatum
 * gegen die Erscheinungsjahre der zugeordneten Katalog-Titel,
 * known_for_department gegen unsere Rollenzuordnung Schauspieler/
 * Regisseur) braucht diese Daten fuer alle 18.637 priorisierten Personen
 * VOR der Content-Erstellung -- bisher laedt ladePersonDaten() (lib/
 * personen.js) nur lazy beim echten Seitenaufruf.
 *
 * Nutzt ladePersonDaten() selbst (inkl. de/en-Fallback, inkl. Cache-Check)
 * statt eigener Fetch-Logik, damit sich nichts dupliziert -- dieses Skript
 * ist nur die Schleife mit Rate-Limit ueber die priorisierten Personen.
 *
 * Bereits gecachte Personen werden uebersprungen (personen_cache.
 * tmdb_person_id ist PRIMARY KEY, ladePersonDaten prueft den Cache zuerst)
 * -- der Lauf ist deshalb sicher unterbrech- und fortsetzbar.
 *
 * Aufruf (siehe CLAUDE.md, Abschnitt "Server- und DB-Befehle" -- laeuft im
 * bereits gebauten Image, kein /repo-Mount noetig, da lib/personen.js und
 * node_modules dort bereits vorhanden sind):
 *   docker compose -f docker-compose.yml --profile prod run --rm --no-deps -T \
 *     backend node scripts/personen-detail-bulk.mjs
 *
 * Node >= 18 (globales fetch).
 */
import { pool } from '../db/pool.js';
import { ladePersonDaten } from '../lib/personen.js';

const PAUSE_MS = Number(process.env.PERSONEN_DETAIL_PAUSE_MS || 200);
const MIN_TITEL = Number(process.env.PERSONEN_DETAIL_MIN_TITEL || 2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ladePriorisiertePersonen() {
  const { rows } = await pool.query(
    `WITH titel_pro_person AS (
       SELECT director AS name, count(*) AS anzahl
         FROM titles WHERE director IS NOT NULL AND director <> '' GROUP BY director
       UNION ALL
       SELECT unnest(cast_names) AS name, 1 FROM titles WHERE cast_names IS NOT NULL
     ),
     titelzahl AS (
       SELECT name, sum(anzahl) AS titel FROM titel_pro_person GROUP BY name
     )
     SELECT pr.tmdb_person_id
       FROM personen_resolution pr
       JOIN titelzahl t ON t.name = pr.name
      WHERE pr.tmdb_person_id IS NOT NULL AND t.titel >= $1
        AND NOT EXISTS (SELECT 1 FROM personen_cache pc WHERE pc.tmdb_person_id = pr.tmdb_person_id)
      ORDER BY pr.tmdb_person_id`,
    [MIN_TITEL]
  );
  return rows.map((r) => r.tmdb_person_id);
}

async function main() {
  const ids = await ladePriorisiertePersonen();
  console.log(`${ids.length} priorisierte Personen (>= ${MIN_TITEL} Titel) ohne Detail-Cache.`);
  const begonnen = Date.now();
  let ok = 0, fehler = 0;
  for (let i = 0; i < ids.length; i++) {
    try {
      const daten = await ladePersonDaten(ids[i]);
      if (daten) ok++; else fehler++;
    } catch (err) {
      fehler++;
      console.error(`Fehler bei tmdb_person_id ${ids[i]}: ${err.message}`);
    }
    if ((i + 1) % 500 === 0) {
      const vergangen = Math.round((Date.now() - begonnen) / 1000);
      console.log(`${i + 1}/${ids.length} (${ok} ok, ${fehler} Fehler, ${vergangen}s)`);
    }
    await sleep(PAUSE_MS);
  }
  console.log(`Fertig: ${ok} geladen, ${fehler} Fehler, ${Math.round((Date.now() - begonnen) / 1000)}s.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
