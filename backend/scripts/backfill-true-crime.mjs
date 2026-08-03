#!/usr/bin/env node
/*
 * backfill-true-crime.mjs -- traegt das Schlagwort "TrueCrime" nach.
 *
 * Hintergrund: TMDB kennt kein Genre "True Crime" -- die Genres der App kommen
 * 1:1 von dort, entsprechend gibt es die Kategorie bei uns bisher nicht. Wer
 * "True Crime" sucht, findet nichts, obwohl der Bestand da ist (Tiger King,
 * Making a Murderer, Der Tinder-Schwindler ...).
 *
 * TMDB pflegt True Crime aber als SCHLAGWORT (keyword 33722). Statt fuer jeden
 * unserer ~41.000 Titel einzeln die Schlagwoerter abzufragen, geht dieses
 * Skript den umgekehrten Weg: Es holt ueber /discover alle Titel, die TMDB
 * selbst mit diesem Schlagwort versehen hat (~1.500, rund 76 Abrufe), und
 * schneidet diese Menge mit unseren tmdb_ids. Das ist nicht nur schneller,
 * sondern auch genauer als die naheliegende Heuristik "Dokumentarfilm + Krimi"
 * -- die haelt z.B. "Inside Job" (Finanzkrise) faelschlich fuer True Crime.
 *
 * Geschrieben wird ausschliesslich additiv: 'TrueCrime' wird an `keywords`
 * angehaengt, nichts wird ersetzt. Das passt zur Zusage in titles.js, wonach
 * `keywords` von den taeglichen Jobs nie ueberschrieben wird -- der Nachtrag
 * ueberlebt also jeden folgenden Discovery-Lauf.
 *
 * Auch Katalog-Titel werden beruecksichtigt (deren TMDB-ID steht teils nur in
 * title_tmdb_resolution). Titel ganz ohne TMDB-Zuordnung koennen nicht
 * zugeordnet werden und werden am Ende als Zahl ausgewiesen.
 *
 * Aufruf (auf dem Server, im Backend-Container):
 *   docker compose -f docker-compose.yml exec -T backend \
 *     node scripts/backfill-true-crime.mjs [--dry-run]
 *
 * Beliebig oft wiederholbar: Titel, die das Schlagwort schon haben, werden
 * uebersprungen. Nach groesseren Discovery-Laeufen erneut ausfuehren, damit
 * neu hinzugekommene Titel die Kategorie ebenfalls bekommen.
 */
import 'dotenv/config';
import { pool } from '../db/pool.js';

const API = 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY;
const LANG = process.env.TMDB_LANG || 'de-DE';
const DRY = process.argv.includes('--dry-run');

const KEYWORD_ID = 33722;      // "true crime" bei TMDB
const SCHLAGWORT = 'TrueCrime'; // Schreibweise wie die uebrigen Hashtags

if (!KEY) { console.error('FEHLER: TMDB_API_KEY ist nicht gesetzt.'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function holeSeite(art, seite) {
  const url = `${API}/discover/${art}?api_key=${KEY}&language=${LANG}` +
              `&with_keywords=${KEYWORD_ID}&page=${seite}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${art} Seite ${seite}: HTTP ${res.status}`);
  return res.json();
}

// Alle TMDB-IDs zu einem Medientyp einsammeln. TMDB deckelt /discover bei 500
// Seiten -- bei ~1.500 Treffern weit entfernt, die Grenze wird trotzdem
// beachtet, damit das Skript auch bei wachsendem Bestand nicht endlos laeuft.
async function holeAlleIds(art) {
  const ids = new Set();
  const erste = await holeSeite(art, 1);
  const seiten = Math.min(erste.total_pages || 1, 500);
  (erste.results || []).forEach((r) => ids.add(r.id));
  for (let s = 2; s <= seiten; s++) {
    const d = await holeSeite(art, s);
    (d.results || []).forEach((r) => ids.add(r.id));
    await sleep(60); // hoeflich gegenueber TMDB, kostet bei 76 Abrufen ~5 Sekunden
  }
  console.log(`TMDB ${art}: ${ids.size} Titel mit dem Schlagwort (${seiten} Seiten).`);
  return ids;
}

async function main() {
  if (DRY) console.log('Probelauf -- es wird nichts geschrieben.\n');

  const [filmIds, serienIds] = await Promise.all([holeAlleIds('movie'), holeAlleIds('tv')]);

  const { rows } = await pool.query(
    `SELECT t.id, t.type, t.title, t.source, t.keywords,
            COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id
       FROM titles t
       LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
      ORDER BY t.id`
  );

  const ohneTmdbId = rows.filter((r) => r.tmdb_id == null).length;
  const treffer = [];
  let schonVorhanden = 0;

  for (const row of rows) {
    if (row.tmdb_id == null) continue;
    const menge = row.type === 'movie' ? filmIds : serienIds;
    if (!menge.has(Number(row.tmdb_id))) continue;
    if ((row.keywords || []).includes(SCHLAGWORT)) { schonVorhanden++; continue; }
    treffer.push(row);
  }

  console.log(`\n${rows.length} Titel geprueft, davon ${ohneTmdbId} ohne TMDB-Zuordnung (nicht zuordenbar).`);
  console.log(`${schonVorhanden} hatten das Schlagwort bereits.`);
  console.log(`${treffer.length} bekommen "${SCHLAGWORT}" neu.\n`);

  treffer.slice(0, 25).forEach((t) => {
    console.log(`  + ${t.title} (${t.type === 'movie' ? 'Film' : 'Serie'}, ${t.source})`);
  });
  if (treffer.length > 25) console.log(`  … und ${treffer.length - 25} weitere`);

  if (DRY || !treffer.length) { await pool.end(); return; }

  // array_append statt Neuzuweisung: bestehende Schlagwoerter bleiben unberuehrt.
  // Die NOT-Bedingung macht den Lauf auch bei gleichzeitigem Zweitlauf sicher.
  const res = await pool.query(
    `UPDATE titles SET keywords = array_append(keywords, $1), updated_at = now()
      WHERE id = ANY($2::bigint[]) AND NOT (keywords @> ARRAY[$1])`,
    [SCHLAGWORT, treffer.map((t) => t.id)]
  );
  console.log(`\n${res.rowCount} Zeilen aktualisiert.`);

  const { rows: [stand] } = await pool.query(
    `SELECT count(*)::int AS gesamt,
            count(*) FILTER (WHERE type = 'movie')::int AS filme,
            count(*) FILTER (WHERE type = 'series')::int AS serien
       FROM titles WHERE keywords @> ARRAY[$1]`,
    [SCHLAGWORT]
  );
  console.log(`Bestand jetzt: ${stand.gesamt} Titel (${stand.filme} Filme, ${stand.serien} Serien).`);

  await pool.end();
}

main().catch(async (err) => {
  console.error('Abgebrochen:', err.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
