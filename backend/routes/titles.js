import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { ausListe, leeren } from '../lib/listenCache.js';
import { geheimnisStimmt } from '../lib/vergleich.js';
import { mengenGrenze } from '../middleware/rateLimit.js';
import { sprachWahl, regionWahl, sprachFeld, freigabeFuer } from '../lib/i18n.js';

// Grenze je IP fuer die Inhaltsangaben der sichtbaren Zeilen. Der haeufigste
// der oeffentlichen DB-Endpunkte -- laeuft bei jedem Nachladen einer Liste --,
// deshalb besonders hoch angesetzt. Real nie erreicht; deckelt nur das Haemmern.
const GRENZE_PLOTS = mengenGrenze({ name: 'titles-plots', anzahl: 240, minuten: 1 });

const router = createAsyncRouter();

// withPlot=false laesst die Inhaltsangabe weg. Sie ist mit Abstand das groesste
// Feld (13,3 MB von 27,9 MB der Katalog-Auslieferung), wird aber ausschliesslich
// in der aufgeklappten Detailansicht angezeigt -- weder die Suche noch der
// Taste-Score im Frontend werten sie aus. Listen liefern sie deshalb nicht mehr
// mit; das Frontend holt sie fuer die gerade sichtbaren Zeilen ueber
// POST /api/titles/plots nach.
// lang ('de'|'en') tauscht Titel und Inhaltsangabe gegen die englische Fassung
// (mit deutschem Rueckfall, siehe lib/i18n.js); region bestimmt, welche
// Altersfreigabe im Feld `certification` steht. Beide optional -- ohne Angabe
// verhaelt sich alles wie bisher (deutsch, DE).
export function serializeTitle(row, { withPlot = true, lang = 'de', region = 'DE' } = {}) {
  const out = {
    id: row.id,
    tmdbId: row.tmdb_id,
    type: row.type,
    title: sprachFeld(lang, row.title, row.title_en),
    originalTitle: row.original_title,
    year: row.year,
    genres: row.genres,
    director: row.director,
    cast: row.cast_names,
    keywords: row.keywords,
    rating: row.rating != null ? Number(row.rating) : null,
    voteCount: row.vote_count,
    certification: freigabeFuer(region, row.certifications, row.certification),
    posterPath: row.poster_path,
    posterBase64: row.poster_base64,
    source: row.source,
  };
  // Nachtraeglich ermittelte TMDB-Kennung der 600 urspruenglich kuratierten
  // Katalog-Titel (title_tmdb_resolution, gefuellt von backfill-catalog-*.mjs).
  // Sie steht bewusst NICHT in tmdbId: Dort wuerde sie so aussehen, als sei der
  // Titel regulaer mit TMDB verknuepft -- er ist es nicht, in `titles` ist die
  // Spalte weiterhin leer, und der Upsert in /ensure haengt daran.
  //
  // Wozu: Derselbe Film steckt oft zweimal im Bestand -- einmal als kuratierter
  // Katalog-Titel ohne Kennung, einmal aus dem TMDB-Abzug. Ueber den Namen ist
  // das nicht zuverlaessig zu erkennen ("Baby Reindeer" heisst dort
  // "Rentierbaby"), ueber diese Kennung dagegen exakt (siehe buildPool).
  if (row.tmdb_id == null && row.aufgeloeste_tmdb_id != null) {
    out.tmdbIdAufgeloest = row.aufgeloeste_tmdb_id;
  }
  if (withPlot) out.plot = sprachFeld(lang, row.plot, row.overview_en);
  return out;
}

// Öffentlich, kein Login nötig: der Katalog ist frei durchsuchbar (siehe
// konzept-relaunch.md Abschnitt 4). Login greift erst bei Schreibaktionen.
// ?source=catalog (Standard-Filme/Serien-Tab) bzw. ?source=discovery
// (Discovery-Pool) -- der Aufrufer entscheidet explizit, welcher Titel-Pool
// gemeint ist, damit der große Discovery-Pool nicht ungewollt im normalen
// Filme/Serien-Tab landet.
/* Die Spalten einzeln statt t.*: `plot` faellt bei withPlot=false damit schon in
   der Datenbank weg. Es sind 13 MB ueber alle Titel -- die wurden bisher bei
   JEDEM Seitenaufruf aus Postgres nach Node uebertragen und dort weggeworfen,
   weil serializeTitle sie ohnehin nicht mitschickt.
   `poster_base64` bleibt drin: nur noch 5 Titel haben eines (31 kB gesamt), die
   App zeichnet es aber bevorzugt (siehe UEBERGABE-OFFEN.md, Abschnitt 2.2). */
const LISTEN_SPALTEN = `t.id, t.tmdb_id, t.type, t.title, t.title_en, t.original_title, t.year,
  t.genres, t.director, t.cast_names, t.keywords, t.rating, t.vote_count,
  t.certification, t.certifications, t.poster_path, t.poster_base64, t.source`;

export async function ladeListe({ type, source, search, withPlot, lang = 'de', region = 'DE' }) {
  const conditions = [];
  const params = [];

  // Spalten durchgehend mit "t." qualifiziert -- die Abfrage unten verbindet mit
  // title_tmdb_resolution, ohne Praefix waere z.B. tmdb_id mehrdeutig.
  if (type === 'movie' || type === 'series') {
    params.push(type);
    conditions.push(`t.type = $${params.length}`);
  }
  if (typeof source === 'string' && source.trim()) {
    const sources = source.split(',').map((s) => s.trim()).filter(Boolean);
    if (sources.length) {
      params.push(sources);
      conditions.push(`t.source = ANY($${params.length})`);
    }
  }
  if (typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`t.title ILIKE $${params.length}`);
  }

  // Kein LIMIT: der Client baut aus dieser Antwort seinen kompletten Titel-Pool
  // (Suche, Watchlist-/Gesehen-Verknuepfung per title_id) -- ein Deckel wuerde
  // alphabetisch spaeter einsortierte Titel silent abschneiden. Frueher lag hier
  // ein LIMIT 5000, das seit der Discovery-Katalog-Erweiterung (~16.000 Titel)
  // dazu fuehrte, dass Titel wie "Unfamiliar" nie eine echte title_id vom Client
  // bekamen und ihr Watchlist-/Gesehen-Status nie dauerhaft gespeichert wurde.
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  // title_tmdb_resolution nur fuer die Titel ohne eigene Kennung -- siehe
  // serializeTitle. LEFT JOIN, damit ein fehlender Eintrag den Titel nicht
  // verschluckt.
  const { rows } = await pool.query(
    `SELECT ${LISTEN_SPALTEN}${withPlot ? ', t.plot, t.overview_en' : ''}, r.tmdb_id AS aufgeloeste_tmdb_id
       FROM titles t
       LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id AND t.tmdb_id IS NULL
       ${where}
      ORDER BY t.title ASC`,
    params
  );
  return rows.map((r) => serializeTitle(r, { withPlot, lang, region }));
}

// Schluessel fuer den Zwischenspeicher. Nur die Spielarten OHNE Suchbegriff
// kommen hinein -- eine Suche liefert je Begriff eine andere Liste und wuerde
// den Speicher mit Einmalantworten fuellen. Sprache und Region gehoeren in den
// Schluessel: je Kombination ist die Antwort eine andere.
export function listenSchluessel({ type, source, withPlot, lang = 'de', region = 'DE' }) {
  return `titles:${type || ''}|${source || ''}|${withPlot ? 'plot' : 'ohne'}|${lang}|${region}`;
}

router.get('/', async (req, res) => {
  const { type, search, source } = req.query;
  // Ohne Inhaltsangaben (siehe serializeTitle) -- das ist die grosse Liste, hier
  // faellt die Ersparnis an. ?withPlot=1 liefert sie bei Bedarf weiterhin mit.
  const withPlot = req.query.withPlot === '1';
  const lang = sprachWahl(req.query.lang);
  const region = regionWahl(req.query.region);

  if (typeof search === 'string' && search.trim()) {
    return res.json(await ladeListe({ type, source, search, withPlot, lang, region }));
  }
  await ausListe(req, res, listenSchluessel({ type, source, withPlot, lang, region }),
    () => ladeListe({ type, source, withPlot, lang, region }));
});

// Inhaltsangaben fuer die gerade sichtbaren Zeilen. Zwei Zugaenge, weil das
// Frontend zweierlei Titel kennt: solche mit interner ID (Katalog/Discovery) und
// reine Streaming-Kandidaten, die es nur als TMDB-ID gibt und die noch gar nicht
// in `titles` stehen (siehe streaming_cache).
router.post('/plots', GRENZE_PLOTS, async (req, res) => {
  const { ids, tmdb } = req.body || {};
  const lang = sprachWahl((req.body || {}).lang);
  const out = { ids: {}, tmdb: {} };

  const numericIds = Array.isArray(ids)
    ? [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 1000)
    : [];
  if (numericIds.length) {
    const { rows } = await pool.query(
      `SELECT id, plot, overview_en FROM titles WHERE id = ANY($1)
        AND (plot IS NOT NULL AND plot <> '' OR overview_en IS NOT NULL AND overview_en <> '')`,
      [numericIds]
    );
    for (const r of rows) out.ids[r.id] = sprachFeld(lang, r.plot || '', r.overview_en);
  }

  // [[type, tmdbId], ...] -- zwei Parallel-Arrays, damit die Paare als ein
  // einziges IN-Praedikat abgefragt werden koennen statt in einer Schleife.
  const paare = Array.isArray(tmdb)
    ? tmdb.filter((p) => Array.isArray(p) && (p[0] === 'movie' || p[0] === 'series') && Number.isInteger(Number(p[1])))
        .slice(0, 1000)
    : [];
  if (paare.length) {
    const typen = paare.map((p) => p[0]);
    const tmdbIds = paare.map((p) => Number(p[1]));
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (type, tmdb_id) type, tmdb_id, overview, overview_en
         FROM streaming_cache
        WHERE (type, tmdb_id) IN (SELECT * FROM unnest($1::text[], $2::int[]))
          AND (overview IS NOT NULL AND overview <> '' OR overview_en IS NOT NULL AND overview_en <> '')`,
      [typen, tmdbIds]
    );
    for (const r of rows) out.tmdb[`${r.type}:${r.tmdb_id}`] = sprachFeld(lang, r.overview || '', r.overview_en);
  }

  res.json(out);
});

// Katalog-Titel (source='catalog', immer sichtbar) plus alle Titel, die die
// eingeloggte Person selbst aus Discovery/Streaming zu ihrer Liste hinzugefügt
// hat (erkennbar an einer vorhandenen user_progress-Zeile). Ersetzt
// FILME.concat(ADDED.f...) bzw. SERIEN.concat(ADDED.s...) aus der alten App --
// mit dem Unterschied, dass "hinzugefügt" jetzt korrekt user-spezifisch ist
// (vorher zufällig user-spezifisch, weil in localStorage).
router.get('/mine', requireAuth, async (req, res) => {
  const { type } = req.query;
  const params = [req.session.userId];
  let typeCondition = '';
  if (type === 'movie' || type === 'series') {
    params.push(type);
    typeCondition = `AND t.type = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT t.* FROM titles t
     WHERE (t.source = 'catalog' OR EXISTS (
       SELECT 1 FROM user_progress up WHERE up.title_id = t.id AND up.user_id = $1
     )) ${typeCondition}
     ORDER BY t.title ASC LIMIT 5000`,
    params
  );
  res.json(rows.map(serializeTitle));
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM titles WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not_found' });
  res.json(serializeTitle(rows[0]));
});

// Legt einen Titel an, der bisher nur als Discovery-/Streaming-Kandidat
// existierte (TMDB-Daten, noch nicht im zentralen Katalog). Erfordert Login,
// da dies Teil einer Schreibaktion ist ("+ Liste" / Watchlist ab Streaming-Tab).
// Idempotent über tmdb_id: mehrfaches Aufrufen legt keinen Duplikat-Titel an.
router.post('/ensure', requireAuth, async (req, res) => {
  const {
    tmdbId,
    type,
    title,
    year,
    genres,
    director,
    cast,
    keywords,
    posterPath,
    rating,
    voteCount,
    certification,
    plot,
    source,
    lang,
  } = req.body || {};

  if (!tmdbId || (type !== 'movie' && type !== 'series') || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'invalid_title_payload' });
  }

  // Sprache des Clients: Ein englischsprachiger Client kennt den Titel/Plot nur
  // in seiner englischen Fassung -- die gehoert in title_en/overview_en, NICHT
  // in die deutschen Felder. Die jeweils fehlende Fassung (samt Freigabe und
  // Inhaltsangabe, die das Frontend seit der Auslieferungs-Verkleinerung nicht
  // mehr mitschickt) kommt aus streaming_cache.
  const reqLang = sprachWahl(lang);
  const { rows: scRows } = await pool.query(
    `SELECT title, title_en, overview, overview_en, certification, certifications
       FROM streaming_cache
      WHERE tmdb_id = $1 AND type = $2
      ORDER BY (title_en IS NOT NULL) DESC, fetched_at DESC LIMIT 1`,
    [tmdbId, type]
  );
  const sc = scRows[0] || {};
  const titleDe = reqLang === 'en' ? (sc.title || title.trim()) : title.trim();
  const titleEn = reqLang === 'en' ? title.trim() : (sc.title_en || null);
  const plotDe = reqLang === 'en' ? (sc.overview || null) : (plot || sc.overview || null);
  const plotEn = reqLang === 'en' ? (plot || sc.overview_en || null) : (sc.overview_en || null);
  const cert = certification || sc.certification || null;
  const certs = sc.certifications && typeof sc.certifications === 'object' ? sc.certifications : {};

  // Ein leerer Wert darf einen vorhandenen Text NIEMALS ueberschreiben: bei
  // ON CONFLICT haette "plot = EXCLUDED.plot" sonst die Inhaltsangabe eines
  // laengst bestehenden Titels geloescht, sobald ihn jemand ueber den
  // Streaming-Weg erneut hinzufuegt.
  const { rows } = await pool.query(
    `INSERT INTO titles (tmdb_id, type, title, title_en, year, genres, director, cast_names, keywords, poster_path, rating, vote_count, certification, certifications, plot, overview_en, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (tmdb_id, type) DO UPDATE SET
       title = EXCLUDED.title,
       title_en = COALESCE(NULLIF(EXCLUDED.title_en, ''), titles.title_en),
       year = EXCLUDED.year,
       genres = EXCLUDED.genres,
       director = EXCLUDED.director,
       cast_names = EXCLUDED.cast_names,
       keywords = EXCLUDED.keywords,
       poster_path = EXCLUDED.poster_path,
       rating = EXCLUDED.rating,
       vote_count = EXCLUDED.vote_count,
       certification = COALESCE(NULLIF(EXCLUDED.certification, ''), titles.certification),
       certifications = titles.certifications || EXCLUDED.certifications,
       plot = COALESCE(NULLIF(EXCLUDED.plot, ''), titles.plot),
       overview_en = COALESCE(NULLIF(EXCLUDED.overview_en, ''), titles.overview_en),
       updated_at = now()
     RETURNING *`,
    [
      tmdbId,
      type,
      titleDe,
      titleEn,
      year || null,
      Array.isArray(genres) ? genres : [],
      director || null,
      Array.isArray(cast) ? cast : [],
      Array.isArray(keywords) ? keywords : [],
      posterPath || null,
      rating != null ? rating : null,
      voteCount != null ? voteCount : null,
      cert,
      certs,
      plotDe,
      plotEn,
      source === 'streaming' ? 'streaming' : 'discovery',
    ]
  );

  // Ein neuer Titel gehoert sofort in die Liste -- der Zwischenspeicher haelt
  // sonst bis zu zwei Minuten die alte Fassung fest.
  leeren('Titel ueber /ensure angelegt oder aktualisiert');
  res.status(201).json(serializeTitle(rows[0], { lang: reqLang, region: regionWahl(req.body && req.body.region) }));
});

// Wird ausschließlich von der GitHub Action (discover-rated-titles.mjs) mit dem
// Secret TITLES_INGEST_SECRET aufgerufen -- kein Nutzer-Login, sondern
// Server-zu-Server-Authentifizierung per Bearer-Token (analog /api/streaming/ingest).
// Traegt alle Filme/Serien ab einer TMDB-Bewertung/Stimmenzahl-Schwelle dauerhaft
// in den Discovery-Pool ein (im Unterschied zu streaming_cache gibt es hier KEIN
// taegliches Loeschen -- diese Titel sollen fuer immer per Suche/"Aehnliche Titel"
// auffindbar bleiben, siehe Nutzer-Anforderung).
//
// Rein additiv/aktualisierend, absichtlich vorsichtig beim Ueberschreiben:
// - source='catalog'-Zeilen werden NIE angefasst (Katalog ist manuell kuratiert).
// - `keywords` wird nie ueberschrieben (enthaelt ggf. von Hand/Skript uebersetzte
//   deutsche Hashtags; TMDB-Keywords sind ohnehin nur englisch verfuegbar, siehe
//   apply-keyword-translation.mjs -- neue Zeilen bekommen bewusst KEINE Keywords,
//   das Frontend faellt dafuer automatisch auf das (bereits deutsche) Genre zurueck).
// - `plot` wird nur ueberschrieben, wenn der neue Wert nicht leer ist (schuetzt
//   von Hand recherchierte Kurzbeschreibungen, siehe backfill-overviews.mjs).
router.post('/bulk-ingest', async (req, res) => {
  const provided = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!geheimnisStimmt(provided, process.env.TITLES_INGEST_SECRET)) {
    return res.status(401).json({ error: 'invalid_ingest_secret' });
  }

  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'invalid_payload' });
  }

  const client = await pool.connect();
  let inserted = 0;
  try {
    await client.query('BEGIN');
    for (const item of items) {
      if (!item || !item.tmdbId || (item.type !== 'movie' && item.type !== 'series') || !item.title) continue;
      const { rowCount } = await client.query(
        `INSERT INTO titles (tmdb_id, type, title, year, genres, director, cast_names, keywords, poster_path, rating, vote_count, certification, certifications, plot, title_en, overview_en, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'{}',$8,$9,$10,$11,$12,$13,$14,$15,'discovery')
         ON CONFLICT (tmdb_id, type) DO UPDATE SET
           year = EXCLUDED.year,
           genres = EXCLUDED.genres,
           director = EXCLUDED.director,
           cast_names = EXCLUDED.cast_names,
           poster_path = EXCLUDED.poster_path,
           rating = EXCLUDED.rating,
           vote_count = EXCLUDED.vote_count,
           certification = EXCLUDED.certification,
           -- Freigaben je Land werden zusammengefuehrt statt ersetzt: Ein Lauf,
           -- der nur DE/AT liefert, darf spaeter ergaenzte Laender nicht loeschen.
           certifications = titles.certifications || EXCLUDED.certifications,
           plot = COALESCE(NULLIF(EXCLUDED.plot, ''), titles.plot),
           title_en = COALESCE(NULLIF(EXCLUDED.title_en, ''), titles.title_en),
           overview_en = COALESCE(NULLIF(EXCLUDED.overview_en, ''), titles.overview_en),
           updated_at = now()
         WHERE titles.source <> 'catalog'`,
        [
          item.tmdbId,
          item.type,
          String(item.title).trim(),
          item.year || null,
          Array.isArray(item.genres) ? item.genres : [],
          item.director || null,
          Array.isArray(item.cast) ? item.cast : [],
          item.posterPath || null,
          item.rating != null ? item.rating : null,
          item.voteCount != null ? item.voteCount : null,
          item.certification || null,
          item.certifications && typeof item.certifications === 'object' ? item.certifications : {},
          item.plot || null,
          item.titleEn || null,
          item.overviewEn || null,
        ]
      );
      inserted += rowCount;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Der naechtliche Import ist der eigentliche Grund, warum der
  // Zwischenspeicher ueberhaupt eine Ungueltigkeitsmachung braucht.
  leeren('Katalog-Import (bulk-ingest)');
  res.json({ processed: items.length, written: inserted });
});

export default router;
