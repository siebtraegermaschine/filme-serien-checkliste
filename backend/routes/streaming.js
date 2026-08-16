import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { ausListe, leeren } from '../lib/listenCache.js';
import { geheimnisStimmt } from '../lib/vergleich.js';
import { sprachWahl, regionWahl, sprachFeld, freigabeFuer } from '../lib/i18n.js';

const router = createAsyncRouter();

// Anzeigenamen der vier Anbieter der ersten Ausbaustufe. Seit der Import seine
// Anbieter je Region aus dem TMDB-Katalog ableitet, schickt stream-fetch.mjs
// Name UND TMDB-Nummer je Anbieter mit -- diese Tabelle ist nur noch der
// Rueckfall fuer Zeilen aus der Zeit davor.
const PROVIDER_NAMES = {
  amazon: 'Amazon Prime',
  netflix: 'Netflix',
  disney: 'Disney+',
  apple: 'Apple TV+',
};

function rowToCand(row, lang = 'de', region = 'DE') {
  return {
    id: String(row.tmdb_id),
    t: sprachFeld(lang, row.title, row.title_en, row.uebersetzungen, 't'),
    y: row.year,
    g: row.genres,
    d: row.director,
    c: row.cast_names,
    p: row.poster_path,
    r: row.rating != null ? Number(row.rating) : null,
    vc: row.vote_count,
    fsk: freigabeFuer(region, row.certifications, row.certification),
    // Bewusst OHNE Inhaltsangabe (frueher `ov`): sie machte 6,8 MB der 11,1 MB
    // dieser Auslieferung aus, wird aber nur in der aufgeklappten Detailansicht
    // gebraucht. Das Frontend holt sie fuer die sichtbaren Zeilen ueber
    // POST /api/titles/plots nach (dort ueber type + tmdb_id).
    fs: row.first_seen_at ? row.first_seen_at.toISOString() : null,
  };
}

// Öffentlich, kein Login nötig -- ersetzt den bisherigen `fetch('streaming.json')`
// Aufruf im Frontend. Gibt exakt die bisherige Form {generated,region,providers}
// zurück, damit der bestehende Rendering-Code im Frontend kompatibel bleibt.
// Fuer jeden Besucher identisch und nur einmal taeglich neu (siehe /ingest) --
// deshalb aus dem Zwischenspeicher. Gemessen wurde hier eine Wartezeit von
// 1.649 ms bis zum ersten Byte, parallel zur ebenso grossen Titel-Liste.
export const STREAMING_SCHLUESSEL = 'streaming';

export function streamingSchluessel(lang = 'de', region = 'DE') {
  return `${STREAMING_SCHLUESSEL}:${lang}:${region}`;
}

/* Form der Antwort: JEDER TITEL EINMAL, mit den Anbietern als Indexliste `pv`
   in die Anbieterliste `anbieter` -- nicht mehr je Anbieter eine eigene
   Titelliste.

   Der Grund ist Groesse. Ein Titel, den es bei drei Anbietern gibt, lag vorher
   dreimal vollstaendig im Payload (Titel, Genres, Besetzung, Regie,
   Freigaben). Mit vier Anbietern war das zu verschmerzen (DE: 5,9 MB); mit den
   zehn bis fuenfzehn relevanten Anbietern je Region waere es das nicht mehr --
   die Ueberschneidung waechst mit jedem Anbieter, und diese Antwort holt der
   Client bei JEDEM Start. `pv` kostet dagegen ein bis zwei Ziffern je Anbieter.

   Die Reihenfolge der Anbieterliste ist deterministisch (groesster zuerst,
   dann nach Slug), damit ETag und Zwischenspeicher zwischen zwei Bauten
   derselben Daten stabil bleiben. */
export async function ladeStreaming(lang = 'de', region = 'DE') {
  const { rows } = await pool.query(
    `SELECT * FROM streaming_cache WHERE region = $1 ORDER BY type, title`,
    [region]
  );

  const jeSlug = new Map();
  let latest = null;
  for (const row of rows) {
    if (!latest || row.fetched_at > latest) latest = row.fetched_at;
    const da = jeSlug.get(row.provider_id);
    if (!da) {
      jeSlug.set(row.provider_id, {
        id: row.provider_id,
        tmdbId: row.tmdb_provider_id != null ? row.tmdb_provider_id : null,
        name: row.provider_name || PROVIDER_NAMES[row.provider_id] || row.provider_id,
        anzahl: 1,
      });
    } else {
      da.anzahl++;
      if (da.tmdbId == null && row.tmdb_provider_id != null) da.tmdbId = row.tmdb_provider_id;
    }
  }
  const anbieter = [...jeSlug.values()]
    .sort((a, b) => b.anzahl - a.anzahl || a.id.localeCompare(b.id));
  const indexJeSlug = new Map(anbieter.map((a, i) => [a.id, i]));

  const filme = new Map();
  const serien = new Map();
  for (const row of rows) {
    const eimer = row.type === 'movie' ? filme : serien;
    let eintrag = eimer.get(row.tmdb_id);
    if (!eintrag) {
      eintrag = rowToCand(row, lang, region);
      eintrag.pv = [];
      eimer.set(row.tmdb_id, eintrag);
    }
    eintrag.pv.push(indexJeSlug.get(row.provider_id));
    // "Neu im Streaming" meint den ERSTEN Auftritt ueberhaupt, nicht den beim
    // zuletzt eingelesenen Anbieter -- deshalb das Minimum ueber alle Zeilen
    // des Titels.
    const fs = row.first_seen_at ? row.first_seen_at.toISOString() : null;
    if (fs && (!eintrag.fs || fs < eintrag.fs)) eintrag.fs = fs;
  }

  // Genre-Paarung (deutsch/englisch) haengt hier mit dran, statt einen eigenen
  // Endpunkt zu bekommen: Das Frontend holt diese Antwort ohnehin beim Start,
  // und die Liste ist mit gut zwei Dutzend Eintraegen winzig.
  const { rows: aliasRows } = await pool.query(
    `SELECT DISTINCT name_de, name_en FROM genre_alias WHERE name_de <> name_en`
  );

  return {
    generated: latest ? latest.toISOString() : null,
    region,
    anbieter: anbieter.map(({ anzahl, ...rest }) => rest),
    filme: [...filme.values()],
    serien: [...serien.values()],
    genreAlias: aliasRows.map((r) => ({ de: r.name_de, en: r.name_en })),
  };
}

router.get('/', async (req, res) => {
  const lang = sprachWahl(req.query.lang);
  const region = regionWahl(req.query.region);
  await ausListe(req, res, streamingSchluessel(lang, region), () => ladeStreaming(lang, region));
});

// Server-zu-Server-Authentifizierung fuer /ingest und /enriched: beide werden
// ausschliesslich von der GitHub Action (stream-fetch.mjs) mit dem Secret
// STREAMING_INGEST_SECRET aufgerufen -- kein Nutzer-Login, sondern Bearer-Token.
function ingestBerechtigt(req) {
  const provided = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return geheimnisStimmt(provided, process.env.STREAMING_INGEST_SECRET);
}

// Welche Titel sind bereits frisch angereichert? stream-fetch.mjs fragt das
// VOR seinem Lauf ab und ueberspringt fuer diese tmdb_ids den TMDB-Detail-
// Abruf (Besetzung, Regie, Freigaben, Uebersetzungen) -- die Details sind
// sprachneutral bzw. decken ueber TMDB_CERT_REGIONS/translations ohnehin alle
// Laender ab, nur die VERFUEGBARKEIT je Anbieter ist regionsspezifisch. Ohne
// diesen Endpunkt holte jeder Regionen-Lauf dieselben ~22.000 Detail-
// Datensaetze erneut (57-87 Minuten je Region statt gemessener ~8).
//
// Frisch = enriched_at juenger als max_age_days (Default 7 Tage), egal in
// welcher Region: Fehlt der Titel in der anfragenden Region noch, kopiert der
// Ingest die Anreicherung aus einer Geschwisterzeile (siehe unten).
router.get('/enriched', async (req, res) => {
  if (!ingestBerechtigt(req)) {
    return res.status(401).json({ error: 'invalid_ingest_secret' });
  }
  const tage = Math.min(30, Math.max(1, parseInt(req.query.max_age_days, 10) || 7));
  const { rows } = await pool.query(
    `SELECT DISTINCT type, tmdb_id FROM streaming_cache
      WHERE enriched_at >= now() - make_interval(days => $1)`, [tage]);
  const out = { maxAgeDays: tage, movie: [], series: [] };
  for (const r of rows) (r.type === 'movie' ? out.movie : out.series).push(r.tmdb_id);
  res.json(out);
});

router.post('/ingest', async (req, res) => {
  if (!ingestBerechtigt(req)) {
    return res.status(401).json({ error: 'invalid_ingest_secret' });
  }

  const { providers, genres } = req.body || {};
  if (!Array.isArray(providers)) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  // Region des Laufs: stream-fetch.mjs schickt sie im Dokument mit (TMDB_REGION
  // je Lauf). Jeder Lauf verwaltet ausschliesslich SEINE Region -- geschrieben,
  // geprueft und aufgeraeumt wird nur innerhalb dieser Region, damit der
  // AT-Lauf niemals den DE-Bestand anfasst (und umgekehrt).
  const region = regionWahl((req.body || {}).region);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // clock_timestamp() statt now(): now() bleibt fuer die GESAMTE Transaktion
    // auf deren Startzeitpunkt eingefroren. Die gerade eingefuegten Zeilen
    // haetten damit einen fetched_at-Wert VOR runStartedAt (das JS ein paar
    // Millisekunden spaeter bildet) -- und der DELETE-Cleanup unten loescht
    // dann jeden einzelnen gerade uebertragenen Titel. Ob es kippt, haengt
    // daran, ob beide Zeitstempel in dieselbe Millisekunde fallen: ein
    // Muenzwurf bei jedem Lauf. Am 2026-08-02 verloren -- der Job meldete
    // Erfolg und hinterliess 0 von 20.369 Zeilen. Dieselbe Falle war in
    // cinema.js bereits behoben, hier blieb sie stehen.
    const { rows: [{ now: runStartedAt }] } = await client.query('SELECT clock_timestamp() AS now');
    for (const provider of providers) {
      const providerId = provider.id;
      const providerName = provider.name || PROVIDER_NAMES[providerId] || providerId;
      // TMDB-Nummer des Anbieters IN DIESER REGION (Amazon Prime Video ist 9
      // in DE, 119 in BR/PL). Kommt seit dem dynamischen Anbieterumfang aus
      // dem Payload; aeltere Laeufe schicken sie nicht, dann bleibt der
      // vorhandene Wert stehen.
      const providerTmdbId = Number.isInteger(provider.tmdbId) ? provider.tmdbId : null;
      for (const [type, items] of [['movie', provider.f], ['series', provider.s]]) {
        for (const item of items || []) {
          // Magere Zeile (item.ohneDetails, siehe Skip-Liste in stream-fetch.mjs):
          // Der Lauf hat fuer diesen Titel nur die Verfuegbarkeit ermittelt und
          // die TMDB-Details bewusst NICHT geholt. Dann bleiben Anreicherungs-
          // felder (Regie, Besetzung, Freigaben) und enriched_at unangetastet --
          // sonst wuerde die vorhandene Anreicherung mit Leerwerten ueberschrieben.
          const voll = !item.ohneDetails;
          await client.query(
            `INSERT INTO streaming_cache
               (provider_id, provider_name, tmdb_provider_id, type, tmdb_id, region, title, title_en, uebersetzungen, year, genres, director, cast_names, poster_path, rating, vote_count, certification, certifications, overview, overview_en, fetched_at, enriched_at)
             VALUES ($1,$2,$21,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, clock_timestamp(),
               CASE WHEN $20::boolean THEN clock_timestamp() END)
             ON CONFLICT (provider_id, type, tmdb_id, region) DO UPDATE SET
               provider_name = EXCLUDED.provider_name,
               tmdb_provider_id = COALESCE(EXCLUDED.tmdb_provider_id, streaming_cache.tmdb_provider_id),
               title = EXCLUDED.title, year = EXCLUDED.year, genres = EXCLUDED.genres,
               director = CASE WHEN $20::boolean THEN EXCLUDED.director ELSE streaming_cache.director END,
               cast_names = CASE WHEN $20::boolean THEN EXCLUDED.cast_names ELSE streaming_cache.cast_names END,
               poster_path = EXCLUDED.poster_path, rating = EXCLUDED.rating,
               vote_count = EXCLUDED.vote_count,
               certification = CASE WHEN $20::boolean THEN EXCLUDED.certification ELSE streaming_cache.certification END,
               certifications = streaming_cache.certifications || EXCLUDED.certifications,
               -- Liefert TMDB an einem Tag mal keine Kurzbeschreibung (z.B. fremdsprachige
               -- Titel ohne deutschen Overview-Text), soll eine zuvor vorhandene (ggf. manuell
               -- nachgetragene) Beschreibung nicht durch einen Leerstring geloescht werden.
               overview = COALESCE(NULLIF(EXCLUDED.overview, ''), streaming_cache.overview),
               title_en = COALESCE(NULLIF(EXCLUDED.title_en, ''), streaming_cache.title_en),
               uebersetzungen = streaming_cache.uebersetzungen || EXCLUDED.uebersetzungen,
               overview_en = COALESCE(NULLIF(EXCLUDED.overview_en, ''), streaming_cache.overview_en),
               fetched_at = clock_timestamp(),
               enriched_at = CASE WHEN $20::boolean THEN clock_timestamp() ELSE streaming_cache.enriched_at END`,
            [
              providerId,
              providerName,
              type,
              Number(item.id),
              region,
              item.t,
              item.tEn || null,
              item.uebers && typeof item.uebers === 'object' ? item.uebers : {},
              item.y || null,
              Array.isArray(item.g) ? item.g : [],
              item.d || null,
              Array.isArray(item.c) ? item.c : [],
              item.p || null,
              item.r != null ? item.r : null,
              item.vc != null ? item.vc : null,
              item.fsk || null,
              item.certs && typeof item.certs === 'object' ? item.certs : {},
              item.ov || null,
              item.ovEn || null,
              voll,
              providerTmdbId,
            ]
          );
        }
      }
    }
    // Schutz vor Teilerfolgen: Der DELETE unten raeumt alles weg, was dieser Lauf
    // nicht angefasst hat. Liefert TMDB nur einen Bruchteil (gedrosselter
    // Schluessel, Rate-Limit, veraenderte Antwortform), loescht ein "erfolgreicher"
    // Lauf damit den Grossteil des Bestands. Genau das ist am 2026-08-02 passiert
    // (siehe Kommentar oben: 0 von 20.369 Zeilen).
    //
    // Deshalb: Deutlich weniger Titel als bisher => gar nichts uebernehmen. Die
    // Transaktion wird zurueckgerollt, der Bestand bleibt unveraendert stehen und
    // veraltet hoechstens um einen Lauf. Ein wirklich geschrumpftes Angebot faellt
    // dabei ebenfalls durch -- lieber ein Lauf zu wenig als ein leerer Katalog.
    const { rows: [{ anzahl: bestand }] } = await client.query(
      'SELECT COUNT(*)::int AS anzahl FROM streaming_cache WHERE region = $1', [region]);
    const geliefert = providers.reduce((n, pv) => n + (pv.f || []).length + (pv.s || []).length, 0);
    const MINDESTANTEIL = 0.7;
    if (bestand > 0 && geliefert < bestand * MINDESTANTEIL) {
      await client.query('ROLLBACK');
      console.error(`Streaming-Ingest (${region}) abgelehnt: nur ${geliefert} Titel geliefert, im Bestand sind ${bestand}.`);
      return res.status(409).json({
        error: 'implausible_payload', geliefert, bestand, region,
        hinweis: 'Zu wenige Titel im Vergleich zum Bestand -- nichts uebernommen.',
      });
    }
    await client.query('DELETE FROM streaming_cache WHERE region = $1 AND fetched_at < $2', [region, runStartedAt]);
    // Magere NEU-Zeilen reparieren: Stand der Titel bisher nicht in DIESER
    // Region (etwa weil ein Anbieter ihn hier neu aufgenommen hat), hat der
    // magere Lauf gerade eine Zeile OHNE Anreicherung eingefuegt (enriched_at
    // NULL). Die Details liegen aber laengst in einer Geschwisterzeile --
    // gleicher Titel, anderer Anbieter oder andere Region -- denn die
    // Skip-Liste (/enriched) nennt nur Titel, die IRGENDWO frisch angereichert
    // sind. Von dort werden sie kopiert, inklusive enriched_at, damit die
    // Frische-Rechnung stimmt. Titel ganz ohne angereicherte Geschwisterzeile
    // bleiben auf NULL und werden vom naechsten Lauf voll geholt.
    await client.query(
      `UPDATE streaming_cache sc SET
         director       = COALESCE(sc.director, q.director),
         cast_names     = CASE WHEN cardinality(sc.cast_names) = 0 THEN q.cast_names ELSE sc.cast_names END,
         certification  = COALESCE(sc.certification, q.certification),
         certifications = q.certifications || sc.certifications,
         uebersetzungen = q.uebersetzungen || sc.uebersetzungen,
         title_en       = COALESCE(sc.title_en, q.title_en),
         overview       = COALESCE(sc.overview, q.overview),
         overview_en    = COALESCE(sc.overview_en, q.overview_en),
         enriched_at    = q.enriched_at
       FROM (
         SELECT DISTINCT ON (type, tmdb_id) type, tmdb_id, director, cast_names,
                certification, certifications, uebersetzungen, title_en,
                overview, overview_en, enriched_at
           FROM streaming_cache
          WHERE enriched_at IS NOT NULL
          ORDER BY type, tmdb_id, enriched_at DESC
       ) q
       WHERE sc.region = $1 AND sc.enriched_at IS NULL
         AND q.type = sc.type AND q.tmdb_id = sc.tmdb_id`,
      [region]);
    // Genre-Paarung mitschreiben, sofern der Lauf sie geliefert hat. Bewusst nur
    // aktualisierend und ohne Aufraeumen: Faellt das Feld in einem Lauf mal weg
    // (aeltere Skriptversion, TMDB-Aussetzer), soll die vorhandene Zuordnung
    // stehenbleiben statt zu verschwinden -- ohne sie fiele die Suche nach
    // englischen Genre-Namen wieder aus.
    if (Array.isArray(genres)) {
      for (const g of genres) {
        if (!g || g.id == null || !g.de || !g.en) continue;
        await client.query(
          `INSERT INTO genre_alias (tmdb_genre_id, art, name_de, name_en)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (tmdb_genre_id, art) DO UPDATE SET
             name_de = EXCLUDED.name_de, name_en = EXCLUDED.name_en`,
          [Number(g.id), g.art === 'tv' ? 'tv' : 'movie', g.de, g.en]
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  leeren('Streaming-Import (ingest)');
  res.status(204).end();
});

export default router;
