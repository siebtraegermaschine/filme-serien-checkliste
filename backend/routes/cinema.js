import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { sprachWahl, regionWahl, sprachFeld, freigabeFuer } from '../lib/i18n.js';

const router = createAsyncRouter();

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
    // vc/fsk fehlten hier, obwohl cinema_cache beide Spalten fuehrt (alle 545
    // Zeilen haben eine Stimmenzahl, 180 eine Freigabe). Die Folgen im Frontend:
    // gewichteteNote() wertete jeden Kinotitel ohne Stimmenzahl auf glatt 6,760,
    // "Sortieren nach TMDB-Bewertung" ergab damit eine beliebige Reihenfolge --
    // und fskErlaubt() zaehlt eine fehlende Freigabe als unbelegt, wodurch ein
    // aktiver Altersfilter die Kino-Seite vollstaendig leerte.
    vc: row.vote_count,
    fsk: freigabeFuer(region, row.certifications, row.certification),
    ov: sprachFeld(lang, row.overview, row.overview_en, row.uebersetzungen, 'ov'),
    rd: row.release_date ? row.release_date.toISOString().slice(0, 10) : null,
    ord: row.original_release_date ? row.original_release_date.toISOString().slice(0, 10) : null,
  };
}

// Öffentlich, kein Login nötig -- analog zu /api/streaming. "now" nach Kinostart
// absteigend (neueste zuerst), "soon"/"later" aufsteigend (bald startende zuerst).
// ?region= waehlt das Land der Kinostarts (Bestand je Region aus dem Ingest),
// ?lang= die Sprache von Titel und Inhaltsangabe.
router.get('/', async (req, res) => {
  const lang = sprachWahl(req.query.lang);
  const region = regionWahl(req.query.region);
  const { rows } = await pool.query(
    `SELECT * FROM cinema_cache WHERE region = $1 ORDER BY release_date`, [region]);
  const buckets = { now: [], soon: [], later: [] };
  for (const row of rows) {
    if (buckets[row.category]) buckets[row.category].push(rowToCand(row, lang, region));
  }
  buckets.now.reverse();
  res.json(buckets);
});

// Wird ausschließlich von der GitHub Action (cinema-fetch.mjs) mit dem Secret
// CINEMA_INGEST_SECRET aufgerufen -- kein Nutzer-Login, sondern Server-zu-
// Server-Authentifizierung per Bearer-Token (analog /api/streaming/ingest).
router.post('/ingest', async (req, res) => {
  const expected = process.env.CINEMA_INGEST_SECRET;
  const provided = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'invalid_ingest_secret' });
  }

  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'invalid_payload' });
  }
  // Region des Laufs (cinema-fetch.mjs schickt sie mit, TMDB_REGION je Lauf).
  // Wie beim Streaming-Ingest verwaltet jeder Lauf nur SEINE Region.
  const region = regionWahl((req.body || {}).region);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // clock_timestamp() statt now(): now() bliebe fuer die GESAMTE Transaktion
    // auf den Start eingefroren (Transaktions-Zeitstempel) -- damit haetten die
    // gerade eingefuegten/aktualisierten Zeilen denselben (oder sogar einen
    // fruoeheren) fetched_at-Wert wie runStartedAt, und der DELETE-Cleanup
    // weiter unten haette JEDEN gerade uebertragenen Titel sofort wieder
    // geloescht (genau das ist beim ersten echten Import passiert: 537
    // uebertragene Titel, hinterher 0 Zeilen in cinema_cache).
    const { rows: [{ now: runStartedAt }] } = await client.query('SELECT clock_timestamp() AS now');
    for (const item of items) {
      if (!item || !item.tmdbId || !item.title || !item.category) continue;
      await client.query(
        `INSERT INTO cinema_cache
           (tmdb_id, region, title, title_en, uebersetzungen, year, genres, director, cast_names, poster_path, rating, vote_count, certification, certifications, overview, overview_en, release_date, category, original_release_date, fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, clock_timestamp())
         ON CONFLICT (tmdb_id, region) DO UPDATE SET
           title = EXCLUDED.title, year = EXCLUDED.year, genres = EXCLUDED.genres,
           director = EXCLUDED.director, cast_names = EXCLUDED.cast_names,
           poster_path = EXCLUDED.poster_path, rating = EXCLUDED.rating,
           vote_count = EXCLUDED.vote_count,
           certification = EXCLUDED.certification,
           certifications = cinema_cache.certifications || EXCLUDED.certifications,
           overview = COALESCE(NULLIF(EXCLUDED.overview, ''), cinema_cache.overview),
           title_en = COALESCE(NULLIF(EXCLUDED.title_en, ''), cinema_cache.title_en),
           uebersetzungen = cinema_cache.uebersetzungen || EXCLUDED.uebersetzungen,
           overview_en = COALESCE(NULLIF(EXCLUDED.overview_en, ''), cinema_cache.overview_en),
           release_date = EXCLUDED.release_date, category = EXCLUDED.category,
           original_release_date = EXCLUDED.original_release_date,
           fetched_at = clock_timestamp()`,
        [
          item.tmdbId,
          region,
          item.title,
          item.titleEn || null,
          item.uebers && typeof item.uebers === 'object' ? item.uebers : {},
          item.year || null,
          Array.isArray(item.genres) ? item.genres : [],
          item.director || null,
          Array.isArray(item.cast) ? item.cast : [],
          item.posterPath || null,
          item.rating != null ? item.rating : null,
          item.voteCount != null ? item.voteCount : null,
          item.certification || null,
          item.certifications && typeof item.certifications === 'object' ? item.certifications : {},
          item.overview || null,
          item.overviewEn || null,
          item.releaseDate || null,
          item.category,
          item.originalReleaseDate || null,
        ]
      );
    }
    // Gleicher Schutz wie beim Streaming-Ingest (siehe routes/streaming.js):
    // Der DELETE unten raeumt weg, was dieser Lauf nicht angefasst hat. Ein
    // Lauf, der nur einen Bruchteil liefert, wuerde damit den Kinoplan leeren
    // und trotzdem Erfolg melden.
    const { rows: [{ anzahl: bestand }] } = await client.query(
      'SELECT COUNT(*)::int AS anzahl FROM cinema_cache WHERE region = $1', [region]);
    const MINDESTANTEIL = 0.7;
    if (bestand > 0 && items.length < bestand * MINDESTANTEIL) {
      await client.query('ROLLBACK');
      console.error(`Kino-Ingest (${region}) abgelehnt: nur ${items.length} Titel geliefert, im Bestand sind ${bestand}.`);
      return res.status(409).json({
        error: 'implausible_payload', geliefert: items.length, bestand, region,
        hinweis: 'Zu wenige Titel im Vergleich zum Bestand -- nichts uebernommen.',
      });
    }
    await client.query('DELETE FROM cinema_cache WHERE region = $1 AND fetched_at < $2', [region, runStartedAt]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.status(204).end();
});

export default router;
