import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const router = createAsyncRouter();

const API = 'https://api.themoviedb.org/3';
const REGION = process.env.TMDB_REGION || 'DE';
// Wie lange ein gecachter Eintrag als frisch gilt. Streaming-Rechte wechseln
// meist zum Monatsanfang, taeglich neu zu fragen reicht also dicke -- und
// begrenzt zugleich, wie oft ein oft geoeffneter Titel TMDB belastet.
const TTL_HOURS = Number(process.env.WATCH_PROVIDERS_TTL_HOURS || 24);

// 'series' ist die interne Bezeichnung, TMDB nennt es 'tv'.
const TMDB_KIND = { movie: 'movie', series: 'tv' };

// TMDB fuehrt Tarifstufen und Wiederverkaeufer als eigenstaendige Anbieter --
// "Netflix" UND "Netflix Standard with Ads", "HBO Max" UND "HBO Max Amazon
// Channel". Fuer die Anzeige ist das reines Rauschen (derselbe Dienst, zweimal
// gelistet), deshalb werden diese Zusaetze abgeschnitten und gleichnamige
// Eintraege zusammengefasst.
const VARIANT_SUFFIX = /\s+(?:Amazon Channel|Apple TV Channel|Roku Premium Channel|Standard with Ads|Basic with Ads|with Ads)$/i;
function baseName(name) {
  let n = String(name || '').trim();
  let prev;
  do { prev = n; n = n.replace(VARIANT_SUFFIX, '').trim(); } while (n !== prev);
  return n;
}

// Reduziert die TMDB-Anbieterobjekte auf das, was die App tatsaechlich
// anzeigt. display_priority ist die von TMDB/JustWatch gelieferte
// Sortierempfehlung (kleiner = prominenter) und bestimmt hier die Reihenfolge;
// sie selbst wird nicht mitgespeichert.
function mapProviders(list) {
  const sorted = (list || []).slice()
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999));
  const byBase = new Map();
  for (const p of sorted) {
    const base = baseName(p.provider_name);
    if (!base) continue;
    const isCanonical = String(p.provider_name || '').trim() === base;
    const existing = byBase.get(base);
    // Der Eintrag OHNE Variantenzusatz gewinnt, auch wenn er weiter hinten
    // steht: nur zu dessen ID kennen wir ggf. einen Suchlink (die Kanal-/
    // Tarif-Varianten haben eigene IDs, die in WATCH_SEARCH_URLS fehlen).
    if (!existing || (isCanonical && !existing.canonical)) {
      byBase.set(base, { id: p.provider_id, name: base, logo: p.logo_path || null, canonical: isCanonical });
    }
  }
  return [...byBase.values()].map(({ canonical, ...rest }) => rest);
}

function rowToPayload(row) {
  return {
    flatrate: row.flatrate || [],
    rent: row.rent || [],
    buy: row.buy || [],
    region: row.region,
    fetchedAt: row.fetched_at,
  };
}

const EMPTY = { flatrate: [], rent: [], buy: [], region: REGION, fetchedAt: null };

// Vereinheitlicht Titel fuers Vergleichen: Gross-/Kleinschreibung, die
// verschiedenen Bindestrich-/Gedankenstrich-Varianten sowie Doppelpunkt vs.
// Bindestrich als Untertitel-Trenner. Entspricht normTitle() im Frontend --
// dort aus demselben Grund: Katalog und TMDB schreiben denselben Titel oft
// unterschiedlich ("Der Herr der Ringe: Die Rueckkehr des Koenigs" vs
// "Der Herr der Ringe - Die Rueckkehr des Koenigs").
function normTitle(s) {
  return String(s || '').trim().toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/:/g, '-')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ');
}

async function tmdbSearch(kind, query) {
  const url = new URL(`${API}/search/${kind}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  url.searchParams.set('language', process.env.TMDB_LANG || 'de-DE');
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return (await res.json()).results || [];
}

// Sucht die TMDB-ID eines Katalog-Titels ueber Titel + Jahr + Typ. Bewusst
// streng: ohne Jahresuebereinstimmung (±1 Jahr, damit abweichende
// Kino-/Erstausstrahlungsjahre nicht stoeren) wird KEIN Treffer akzeptiert --
// lieber keine Buttons als die Verfuegbarkeit eines falschen Films.
async function searchTmdbId(kind, title, year) {
  const key = process.env.TMDB_API_KEY;
  if (!key || !title) return null;
  const dateField = kind === 'movie' ? 'release_date' : 'first_air_date';
  const nameField = kind === 'movie' ? 'title' : 'name';
  const origField = kind === 'movie' ? 'original_title' : 'original_name';
  const wanted = normTitle(title);

  const primary = await tmdbSearch(kind, title);
  // Schreibt der Katalog den Untertitel anders als TMDB, findet die Suche mit
  // dem Volltitel teils GAR NICHTS (z.B. "Der Herr der Ringe: Die Rueckkehr des
  // Koenigs" -> 0 Treffer). Deshalb zusaetzlich nur mit dem Haupttitel vor dem
  // Trenner suchen und den richtigen Teil danach ueber den normalisierten
  // Volltitel herauspicken -- nicht ueber die Trefferreihenfolge, denn bei
  // Reihen laegen die anderen Teile ebenfalls im ±1-Jahresfenster.
  const mainPart = title.split(/[:‐-―−-]/)[0].trim();
  const byId = new Map(primary.map((r) => [r.id, r]));
  if (mainPart && mainPart.length >= 3 && mainPart !== title) {
    for (const r of await tmdbSearch(kind, mainPart)) if (!byId.has(r.id)) byId.set(r.id, r);
  }
  const candidates = [...byId.values()];
  if (!candidates.length) return null;

  const yearOf = (r) => Number.parseInt(String(r[dateField] || '').slice(0, 4), 10);
  const titleMatches = (r) => normTitle(r[nameField]) === wanted || normTitle(r[origField]) === wanted;
  const yearFits = (r) => { const y = yearOf(r); return Number.isInteger(y) && Math.abs(y - year) <= 1; };

  // 1. Sicherster Fall: normalisierter Titel stimmt exakt und das Jahr passt.
  const exact = candidates.find((r) => titleMatches(r) && (!year || yearFits(r)));
  if (exact) return exact.id;
  // 2. Ohne Jahresangabe im Katalog bleibt nur die Titelgleichheit.
  if (!year) { const t = candidates.find(titleMatches); return t ? t.id : null; }
  // 3. Zuletzt das bisherige Verhalten: erster Treffer der Volltitel-Suche im
  //    Jahresfenster. Bewusst NUR auf primary -- im Haupttitel-Ergebnis staende
  //    hier sonst womoeglich der falsche Teil einer Reihe.
  const byYear = primary.find(yearFits);
  return byYear ? byYear.id : null;
}

// Liefert die TMDB-ID zu einer internen titles.id -- entweder direkt aus
// titles.tmdb_id, aus einer frueheren Aufloesung, oder per TMDB-Suche.
// Gibt {tmdbId, type} zurueck; tmdbId ist null, wenn nichts gefunden wurde.
async function resolveTmdbId(titleId) {
  const { rows } = await pool.query(
    `SELECT t.id, t.tmdb_id, t.type, t.title, t.year, r.tmdb_id AS resolved_id,
            (r.title_id IS NOT NULL) AS has_resolution
       FROM titles t
       LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
      WHERE t.id = $1`,
    [titleId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.tmdb_id) return { tmdbId: row.tmdb_id, type: row.type };
  // Schon einmal gesucht? Dann Ergebnis wiederverwenden -- auch ein negatives
  // (resolved_id IS NULL), damit erfolglose Suchen sich nicht wiederholen.
  if (row.has_resolution) return { tmdbId: row.resolved_id, type: row.type };

  let found = null;
  try {
    found = await searchTmdbId(TMDB_KIND[row.type], row.title, row.year);
  } catch (err) {
    // Fehlgeschlagene Suche NICHT als "nichts gefunden" festschreiben --
    // beim naechsten Mal soll es erneut versucht werden.
    console.error(`watch-providers: TMDB-Suche fehlgeschlagen (${row.title}):`, err.message);
    return { tmdbId: null, type: row.type };
  }
  await pool.query(
    `INSERT INTO title_tmdb_resolution (title_id, tmdb_id) VALUES ($1, $2)
     ON CONFLICT (title_id) DO UPDATE SET tmdb_id = EXCLUDED.tmdb_id, resolved_at = now()`,
    [titleId, found]
  );
  return { tmdbId: found, type: row.type };
}

// Vorauswahl fuer alle, die noch nichts eingestellt haben.
//
// Erste Zeile: die vier Abo-Dienste, die auch der taegliche Streaming-Abgleich
// (stream-fetch.mjs) kennt und die als Schildchen an den Titeln erscheinen.
//
// Zweite Zeile: die grossen Shops. Ohne sie waeren "Leihen" und "Kaufen"
// dauerhaft leer, denn zum Leihen/Kaufen zaehlen ausschliesslich Shops -- und
// die tragen bei TMDB voellig andere IDs als die gleichnamigen Abo-Dienste
// (Apple TV Store 2 vs. Apple TV+ 350, Amazon Video 10 vs. Amazon Prime Video
// 9). Es sind zugleich genau die Anbieter, fuer die WATCH_SEARCH_URLS im
// Frontend einen funktionierenden Suchlink kennt.
const DEFAULT_PROVIDER_IDS = [
  8, 9, 337, 350,   // Netflix, Amazon Prime Video, Disney+, Apple TV+
  2, 10, 3, 192,    // Apple TV Store, Amazon Video, Google Play Movies, YouTube
];
// So viele Anbieter zeigt die Einstellung direkt; der Rest steckt hinter
// "Weitere anzeigen". TMDB kennt fuer DE knapp 200 Anbieter, die allermeisten
// davon Nischenangebote.
const COMMON_COUNT = 20;

// Anbieterliste ist fuer alle Nutzer:innen identisch und aendert sich selten --
// daher im Prozessspeicher statt in der Datenbank.
let providerCatalog = { at: 0, list: [] };
async function getProviderCatalog() {
  if (providerCatalog.list.length && Date.now() - providerCatalog.at < 24 * 3_600_000) {
    return providerCatalog.list;
  }
  const key = process.env.TMDB_API_KEY;
  if (!key) return providerCatalog.list;
  const byId = new Map();
  for (const kind of ['movie', 'tv']) {
    const url = new URL(`${API}/watch/providers/${kind}`);
    url.searchParams.set('api_key', key);
    url.searchParams.set('watch_region', REGION);
    url.searchParams.set('language', process.env.TMDB_LANG || 'de-DE');
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    for (const p of (await res.json()).results || []) {
      const name = baseName(p.provider_name);
      // Tarif-/Kanalvarianten fallen hier genauso weg wie in mapProviders --
      // sonst stuenden "Netflix" und "Netflix Standard with Ads" als zwei
      // getrennte Haken in der Einstellung.
      if (!name || byId.has(p.provider_id)) continue;
      if ([...byId.values()].some((e) => e.name === name)) continue;
      byId.set(p.provider_id, {
        id: p.provider_id,
        name,
        logo: p.logo_path || null,
        priority: p.display_priority ?? 999,
      });
    }
  }
  // Reine Haeufigkeit taugt NICHT als Relevanzmass fuer die Vorauswahl: sie
  // misst, bei wie vielen Titeln ein Anbieter gelistet ist, nicht wie verbreitet
  // er ist. maxdome verleiht sehr viele Filme, abonniert hat es kaum jemand --
  // waehrend WOW oder RTL+ seltener auftauchen, aber viele Leute sie nutzen.
  // Deshalb stehen die gaengigen deutschen Dienste per Namensliste vorne; nach
  // Namen statt IDs, weil die Namen aus derselben TMDB-Antwort stammen und
  // stabil sind.
  const PROMINENT = [
    'Netflix', 'Amazon Prime Video', 'Disney Plus', 'Apple TV', 'WOW', 'RTL+',
    'Sky Go', 'Paramount Plus', 'Joyn', 'Crunchyroll', 'MagentaTV', 'HBO Max',
    'Amazon Video', 'Apple TV Store', 'Google Play Movies', 'YouTube',
    'Rakuten TV', 'Sky Store', 'maxdome Store', 'ARD Mediathek', 'ZDF Mediathek',
  ];
  const rank = new Map(PROMINENT.map((n, i) => [n, i]));

  // Rangfolge nach dem, was in DIESEM Katalog tatsaechlich vorkommt -- TMDBs
  // display_priority allein spuelt Nischenanbieter (GuideDoc, Sun Nxt) nach
  // oben, waehrend die hier relevanten deutschen Anbieter untergehen.
  const { rows } = await pool.query(`
    WITH alle AS (
      SELECT (jsonb_array_elements(flatrate)->>'id')::int AS id FROM watch_providers_cache
      UNION ALL SELECT (jsonb_array_elements(rent)->>'id')::int FROM watch_providers_cache
      UNION ALL SELECT (jsonb_array_elements(buy)->>'id')::int FROM watch_providers_cache)
    SELECT id, count(*)::int AS n FROM alle GROUP BY id`);
  const freq = new Map(rows.map((r) => [r.id, r.n]));
  const list = [...byId.values()].sort((a, b) => {
    // 1. Bekannte deutsche Dienste in der oben festgelegten Reihenfolge.
    const ra = rank.has(a.name) ? rank.get(a.name) : Infinity;
    const rb = rank.has(b.name) ? rank.get(b.name) : Infinity;
    if (ra !== rb) return ra - rb;
    // 2. Danach das, was in den eigenen Daten am haeufigsten vorkommt.
    const fa = freq.get(a.id) || 0, fb = freq.get(b.id) || 0;
    if (fa !== fb) return fb - fa;
    return a.priority - b.priority || a.name.localeCompare(b.name, 'de');
  });
  list.forEach((p, i) => { p.common = i < COMMON_COUNT; delete p.priority; });
  providerCatalog = { at: Date.now(), list };
  return list;
}

// GET /api/watch-providers/catalog -- alle auswaehlbaren Anbieter. Oeffentlich,
// damit die Einstellung auch beim ersten Oeffnen sofort etwas anzeigen kann.
router.get('/catalog', async (req, res) => {
  res.json({ providers: await getProviderCatalog(), defaults: DEFAULT_PROVIDER_IDS });
});

// GET/PUT /api/watch-providers/selection -- eigene Anbieterauswahl.
router.get('/selection', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT watch_provider_ids FROM users WHERE id = $1', [req.session.userId]);
  const stored = rows[0] ? rows[0].watch_provider_ids : null;
  res.json({
    selected: stored === null ? DEFAULT_PROVIDER_IDS : stored,
    configured: stored !== null,
    defaults: DEFAULT_PROVIDER_IDS,
  });
});

router.put('/selection', requireAuth, async (req, res) => {
  const { selected } = req.body || {};
  if (!Array.isArray(selected)) return res.status(400).json({ error: 'invalid_payload' });
  const ids = [...new Set(selected.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  await pool.query('UPDATE users SET watch_provider_ids = $1 WHERE id = $2', [ids, req.session.userId]);
  res.json({ selected: ids, configured: true, defaults: DEFAULT_PROVIDER_IDS });
});

// GET /api/watch-providers/by-title/:titleId -- Einstieg fuer Titel, deren
// TMDB-ID im Frontend nicht bekannt ist (die 600 kuratierten Katalog-Titel
// haben durchweg tmdb_id NULL). Loest sie bei Bedarf per Suche auf.
router.get('/by-title/:titleId', async (req, res) => {
  const titleId = Number.parseInt(req.params.titleId, 10);
  if (!Number.isInteger(titleId) || titleId <= 0) {
    return res.status(400).json({ error: 'invalid_params' });
  }
  const resolved = await resolveTmdbId(titleId);
  if (!resolved || !resolved.tmdbId) return res.json(EMPTY);
  return respondWithProviders(res, resolved.type, resolved.tmdbId);
});

// GET /api/watch-providers/:type/:tmdbId -- oeffentlich (kein Login noetig,
// analog /api/streaming und /api/cinema). Liefert IMMER 200 mit leeren Listen,
// wenn nichts bekannt ist oder TMDB gerade klemmt: die Detailansicht soll
// deshalb nicht kaputtgehen, sie zeigt dann schlicht "nicht verfuegbar".
router.get('/:type/:tmdbId', async (req, res) => {
  const { type } = req.params;
  const tmdbId = Number.parseInt(req.params.tmdbId, 10);
  if (!TMDB_KIND[type] || !Number.isInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({ error: 'invalid_params' });
  }
  return respondWithProviders(res, type, tmdbId);
});

async function respondWithProviders(res, type, tmdbId) {
  const { rows } = await pool.query(
    `SELECT * FROM watch_providers_cache
      WHERE tmdb_id = $1 AND type = $2 AND region = $3`,
    [tmdbId, type, REGION]
  );
  const cached = rows[0];
  if (cached) {
    const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / 3_600_000;
    if (ageHours < TTL_HOURS) return res.json(rowToPayload(cached));
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    // Ohne Key kann nicht nachgeladen werden. Ein (abgelaufener) Cache-Eintrag
    // ist immer noch besser als nichts, sonst leere Listen.
    if (cached) return res.json(rowToPayload(cached));
    return res.json(EMPTY);
  }

  let data;
  try {
    const url = new URL(`${API}/${TMDB_KIND[type]}/${tmdbId}/watch/providers`);
    url.searchParams.set('api_key', key);
    const tmdbRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!tmdbRes.ok) throw new Error(`TMDB ${tmdbRes.status}`);
    data = await tmdbRes.json();
  } catch (err) {
    // Netzwerkfehler/Rate-Limit: lieber veraltete Daten ausliefern als gar keine.
    console.error(`watch-providers: TMDB-Abruf fehlgeschlagen (${type}/${tmdbId}):`, err.message);
    if (cached) return res.json(rowToPayload(cached));
    return res.json(EMPTY);
  }

  const regional = (data.results || {})[REGION] || {};
  const payload = {
    flatrate: mapProviders(regional.flatrate),
    rent: mapProviders(regional.rent),
    buy: mapProviders(regional.buy),
  };

  await pool.query(
    `INSERT INTO watch_providers_cache (tmdb_id, type, region, flatrate, rent, buy, link, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now())
     ON CONFLICT (tmdb_id, type, region) DO UPDATE SET
       flatrate = EXCLUDED.flatrate, rent = EXCLUDED.rent, buy = EXCLUDED.buy,
       link = EXCLUDED.link, fetched_at = now()`,
    [
      tmdbId,
      type,
      REGION,
      JSON.stringify(payload.flatrate),
      JSON.stringify(payload.rent),
      JSON.stringify(payload.buy),
      regional.link || null,
    ]
  );

  res.json({ ...payload, region: REGION, fetchedAt: new Date().toISOString() });
}

export default router;
