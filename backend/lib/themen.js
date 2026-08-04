import { pool } from '../db/pool.js';

/*
 * Themen-Schlagwoerter nachtragen -- die verallgemeinerte Fassung von
 * scripts/backfill-true-crime.mjs.
 *
 * Hintergrund: Die Genres der App kommen 1:1 von TMDB, und TMDB kennt kein
 * Genre "True Crime". Solche Trends pflegt TMDB stattdessen als SCHLAGWORT.
 * Das alte Skript holte genau eines davon nach -- fuer jedes weitere Thema
 * haette es ein weiteres Skript gebraucht, und bestehende Themen wuchsen nicht
 * mit dem Katalog mit: "TrueCrime" hing zuletzt an 94 Titeln, waehrend TMDB
 * rund 1.500 kennt.
 *
 * Jetzt ist ein Thema EINE Zeile in THEMEN, und der Lauf wiederholt sich
 * woechentlich (siehe starteThemen). Neu hinzugekommene Titel bekommen ihr
 * Schlagwort damit von selbst.
 *
 * Der Weg ist bewusst umgekehrt zum Naheliegenden: Statt fuer 41.000 Titel
 * einzeln die Schlagwoerter abzufragen, holt der Lauf ueber /discover die
 * Titel, die TMDB selbst mit dem Schlagwort versehen hat, und schneidet diese
 * Menge mit unseren tmdb_ids. Das ist schneller und genauer als eine Heuristik
 * wie "Dokumentarfilm + Krimi" -- die haelt z.B. "Inside Job" (Finanzkrise)
 * faelschlich fuer True Crime.
 *
 * Geschrieben wird ausschliesslich additiv: Das Schlagwort wird angehaengt,
 * nichts wird ersetzt. Das passt zur Zusage in routes/titles.js, wonach
 * `keywords` von den taeglichen Importen nie ueberschrieben wird -- der
 * Nachtrag ueberlebt also jeden folgenden Lauf.
 */

// Ein Thema pro Zeile. Entweder mit fester TMDB-Keyword-ID (verlaesslich) oder
// mit einem Suchbegriff, den der Lauf selbst aufloest (bequemer). Die
// Schreibweise des Schlagworts folgt den uebrigen Hashtags: zusammengeschrieben,
// Binnenmajuskel, deutsch -- das Frontend trennt sie fuer die Anzeige wieder auf
// (siehe kwGetrennt in index.html).
export const THEMEN = [
  { schlagwort: 'TrueCrime', keywordId: 33722 },
  { schlagwort: 'NachWahrerBegebenheit', suche: 'based on true story' },
  { schlagwort: 'Superheld', suche: 'superhero' },
  { schlagwort: 'Zeitreise', suche: 'time travel' },
  { schlagwort: 'Weihnachten', suche: 'christmas' },
];

const API = 'https://api.themoviedb.org/3';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(pfad, params = {}) {
  const url = new URL(API + pfad);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  url.searchParams.set('language', process.env.TMDB_LANG || 'de-DE');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${pfad}: HTTP ${res.status}`);
  return res.json();
}

// Suchbegriff -> Keyword-ID. TMDB liefert mehrere Treffer ("christmas",
// "christmas party", ...); genommen wird nur eine EXAKTE Namensgleichheit --
// eine ungefaehre Uebereinstimmung wuerde stillschweigend das falsche Thema
// nachtragen, und das faellt hinterher niemandem auf.
async function keywordId(thema, log) {
  if (thema.keywordId) return thema.keywordId;
  const d = await tmdb('/search/keyword', { query: thema.suche });
  const treffer = (d.results || []).find(
    (r) => String(r.name).toLowerCase() === String(thema.suche).toLowerCase()
  );
  if (!treffer) {
    log(`  ! "${thema.suche}" bei TMDB nicht als Schlagwort gefunden -- uebersprungen.`);
    return null;
  }
  log(`  "${thema.suche}" -> TMDB-Schlagwort ${treffer.id}`);
  return treffer.id;
}

// Alle TMDB-IDs zu einem Medientyp einsammeln. TMDB deckelt /discover bei 500
// Seiten -- die Grenze wird beachtet, damit der Lauf auch bei wachsendem
// Bestand nicht endlos laeuft.
async function alleIds(art, kwId) {
  const ids = new Set();
  const erste = await tmdb(`/discover/${art}`, { with_keywords: kwId, page: 1 });
  const seiten = Math.min(erste.total_pages || 1, 500);
  (erste.results || []).forEach((r) => ids.add(r.id));
  for (let s = 2; s <= seiten; s++) {
    const d = await tmdb(`/discover/${art}`, { with_keywords: kwId, page: s });
    (d.results || []).forEach((r) => ids.add(r.id));
    await sleep(60);              // hoeflich gegenueber TMDB
  }
  return ids;
}

async function themaNachtragen(thema, titelZeilen, dryRun, log) {
  const kwId = await keywordId(thema, log);
  if (!kwId) return 0;

  const [filmIds, serienIds] = await Promise.all([alleIds('movie', kwId), alleIds('tv', kwId)]);
  const treffer = [];
  let schonVorhanden = 0;

  for (const row of titelZeilen) {
    if (row.tmdb_id == null) continue;
    const menge = row.type === 'movie' ? filmIds : serienIds;
    if (!menge.has(Number(row.tmdb_id))) continue;
    if ((row.keywords || []).includes(thema.schlagwort)) { schonVorhanden++; continue; }
    treffer.push(row.id);
  }

  log(`  ${thema.schlagwort}: TMDB kennt ${filmIds.size + serienIds.size}, ` +
      `bei uns passen ${treffer.length + schonVorhanden} (${schonVorhanden} hatten es schon).`);
  if (dryRun || !treffer.length) return 0;

  // array_append statt Neuzuweisung: bestehende Schlagwoerter bleiben unberuehrt.
  // Die NOT-Bedingung macht den Lauf auch bei einem gleichzeitigen Zweitlauf sicher.
  const res = await pool.query(
    `UPDATE titles SET keywords = array_append(keywords, $1), updated_at = now()
      WHERE id = ANY($2::bigint[]) AND NOT (keywords @> ARRAY[$1])`,
    [thema.schlagwort, treffer]
  );
  log(`  ${thema.schlagwort}: ${res.rowCount} Titel neu markiert.`);
  return res.rowCount;
}

export async function themenNachtragen({ dryRun = false, log = console.log } = {}) {
  if (!process.env.TMDB_API_KEY) {
    log('[themen] TMDB_API_KEY fehlt -- uebersprungen.');
    return 0;
  }
  if (dryRun) log('[themen] Probelauf -- es wird nichts geschrieben.');

  // Einmal alle Titel holen und fuer ALLE Themen wiederverwenden: Die Liste ist
  // gross, die Themen sind wenige.
  const { rows } = await pool.query(
    `SELECT t.id, t.type, t.keywords, COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id
       FROM titles t
       LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id`
  );
  const ohneTmdbId = rows.filter((r) => r.tmdb_id == null).length;
  log(`[themen] ${rows.length} Titel geprueft, davon ${ohneTmdbId} ohne TMDB-Zuordnung.`);

  let gesamt = 0;
  for (const thema of THEMEN) {
    try {
      gesamt += await themaNachtragen(thema, rows, dryRun, log);
    } catch (err) {
      // Ein Thema, das scheitert, darf die uebrigen nicht mitreissen.
      log(`  ! ${thema.schlagwort}: ${err.message}`);
    }
    await sleep(200);
  }
  log(`[themen] fertig, ${gesamt} Zuordnungen ergaenzt.`);
  return gesamt;
}

export function starteThemen() {
  if (process.env.THEMEN_DISABLED === '1') {
    console.log('[themen] deaktiviert (THEMEN_DISABLED=1)');
    return;
  }
  const EINE_WOCHE = 7 * 24 * 60 * 60 * 1000;
  const lauf = () => {
    themenNachtragen().catch((err) => console.error('[themen] Lauf fehlgeschlagen:', err.message));
  };
  // Deutlich nach dem Start: Ein frisch hochgefahrener Container soll nicht
  // gleichzeitig Migration, Aufraeumen, Sicherung und ein paar hundert
  // TMDB-Abrufe stemmen.
  setTimeout(lauf, 5 * 60 * 1000);
  setInterval(lauf, EINE_WOCHE);
}
