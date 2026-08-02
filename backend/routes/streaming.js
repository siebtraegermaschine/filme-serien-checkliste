import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const router = createAsyncRouter();

const PROVIDER_NAMES = {
  amazon: 'Amazon Prime',
  netflix: 'Netflix',
  disney: 'Disney+',
  apple: 'Apple TV+',
};

function rowToCand(row) {
  return {
    id: String(row.tmdb_id),
    t: row.title,
    y: row.year,
    g: row.genres,
    d: row.director,
    c: row.cast_names,
    p: row.poster_path,
    r: row.rating != null ? Number(row.rating) : null,
    vc: row.vote_count,
    fsk: row.certification,
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
router.get('/', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM streaming_cache ORDER BY provider_id, type, title`);

  const byProvider = new Map();
  let latest = null;
  for (const row of rows) {
    if (!latest || row.fetched_at > latest) latest = row.fetched_at;
    if (!byProvider.has(row.provider_id)) {
      byProvider.set(row.provider_id, { id: row.provider_id, name: PROVIDER_NAMES[row.provider_id] || row.provider_id, f: [], s: [] });
    }
    const bucket = byProvider.get(row.provider_id);
    (row.type === 'movie' ? bucket.f : bucket.s).push(rowToCand(row));
  }

  res.json({
    generated: latest ? latest.toISOString() : null,
    region: 'DE',
    providers: Array.from(byProvider.values()),
  });
});

// Wird ausschließlich von der GitHub Action (stream-fetch.mjs) mit dem
// Secret STREAMING_INGEST_SECRET aufgerufen -- kein Nutzer-Login, sondern
// Server-zu-Server-Authentifizierung per Bearer-Token.
router.post('/ingest', async (req, res) => {
  const expected = process.env.STREAMING_INGEST_SECRET;
  const provided = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'invalid_ingest_secret' });
  }

  const { providers } = req.body || {};
  if (!Array.isArray(providers)) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

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
      for (const [type, items] of [['movie', provider.f], ['series', provider.s]]) {
        for (const item of items || []) {
          await client.query(
            `INSERT INTO streaming_cache
               (provider_id, provider_name, type, tmdb_id, title, year, genres, director, cast_names, poster_path, rating, vote_count, certification, overview, fetched_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, clock_timestamp())
             ON CONFLICT (provider_id, type, tmdb_id) DO UPDATE SET
               title = EXCLUDED.title, year = EXCLUDED.year, genres = EXCLUDED.genres,
               director = EXCLUDED.director, cast_names = EXCLUDED.cast_names,
               poster_path = EXCLUDED.poster_path, rating = EXCLUDED.rating,
               vote_count = EXCLUDED.vote_count,
               certification = EXCLUDED.certification,
               -- Liefert TMDB an einem Tag mal keine Kurzbeschreibung (z.B. fremdsprachige
               -- Titel ohne deutschen Overview-Text), soll eine zuvor vorhandene (ggf. manuell
               -- nachgetragene) Beschreibung nicht durch einen Leerstring geloescht werden.
               overview = COALESCE(NULLIF(EXCLUDED.overview, ''), streaming_cache.overview),
               fetched_at = clock_timestamp()`,
            [
              providerId,
              providerName,
              type,
              Number(item.id),
              item.t,
              item.y || null,
              Array.isArray(item.g) ? item.g : [],
              item.d || null,
              Array.isArray(item.c) ? item.c : [],
              item.p || null,
              item.r != null ? item.r : null,
              item.vc != null ? item.vc : null,
              item.fsk || null,
              item.ov || null,
            ]
          );
        }
      }
    }
    await client.query('DELETE FROM streaming_cache WHERE fetched_at < $1', [runStartedAt]);
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
