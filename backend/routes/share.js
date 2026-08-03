import qrcode from 'qrcode-generator';
import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const router = createAsyncRouter();

const TMDB = 'https://api.themoviedb.org/3';
const TMDB_KIND = { movie: 'movie', series: 'tv' };

// Ein geteilter Titel wird auf zwei Wegen angesprochen:
//   /t/id/<titles.id>          -- wenn der Titel eine Zeile in titles hat
//   /t/movie|series/<tmdb_id>  -- sonst (Kinostarts liegen in cinema_cache und
//                                 bekommen erst eine titles-Zeile, wenn jemand
//                                 sie auf die Watchlist setzt)
// Beides ist noetig: Die 600 kuratierten Katalog-Titel haben KEINE tmdb_id in
// titles (sie werden ueber den Namen zugeordnet), Kino-Titel umgekehrt keine
// titles.id. Ueber beide Formen zusammen ist jeder Titel teilbar.
const FELDER = `id, tmdb_id, type, title, year, genres, rating, vote_count,
                poster_path, backdrop_path, plot, certification`;

async function ladeTitel(art, kennung) {
  if (art === 'id') {
    const { rows } = await pool.query(
      `SELECT ${FELDER}, 'titles' AS quelle FROM titles WHERE id = $1 LIMIT 1`, [kennung]);
    return rows[0] || null;
  }
  const type = art === 'series' ? 'series' : 'movie';
  const { rows } = await pool.query(
    `SELECT ${FELDER}, 'titles' AS quelle FROM titles WHERE type = $1 AND tmdb_id = $2 LIMIT 1`,
    [type, kennung]
  );
  if (rows[0]) return rows[0];
  if (type !== 'movie') return null;
  const { rows: kino } = await pool.query(
    `SELECT NULL::bigint AS id, tmdb_id, 'movie' AS type, title, year, genres, rating, vote_count,
            poster_path, backdrop_path, overview AS plot, certification, 'cinema_cache' AS quelle
       FROM cinema_cache WHERE tmdb_id = $1 LIMIT 1`,
    [kennung]
  );
  return kino[0] || null;
}

// Breitbild-Motiv beim ersten Teilen nachladen. Bewusst kein Vorab-Nachtrag
// ueber alle Titel: das waeren ~27.000 TMDB-Abrufe fuer etwas, das die meisten
// Titel nie brauchen. Faellt der Abruf aus, bleibt es beim Poster -- die Seite
// darf daran nicht scheitern.
async function ergaenzeBackdrop(titel) {
  if (titel.backdrop_path || !process.env.TMDB_API_KEY) return titel.backdrop_path;
  const art = TMDB_KIND[titel.type];
  if (!art) return null;
  try {
    const res = await fetch(`${TMDB}/${art}/${titel.tmdb_id}?api_key=${process.env.TMDB_API_KEY}`);
    if (!res.ok) return null;
    const d = await res.json();
    const pfad = d.backdrop_path || null;
    if (!pfad) return null;
    const tabelle = titel.quelle === 'cinema_cache' ? 'cinema_cache' : 'titles';
    await pool.query(
      `UPDATE ${tabelle} SET backdrop_path = $1 WHERE tmdb_id = $2` +
        (tabelle === 'titles' ? ' AND type = $3' : ''),
      tabelle === 'titles' ? [pfad, titel.tmdb_id, titel.type] : [pfad, titel.tmdb_id]
    );
    return pfad;
  } catch {
    return null;
  }
}

// Oeffentlich: Datensatz fuer die Karte, die der Empfaenger eines geteilten
// Links zu sehen bekommt. Ohne Login erreichbar -- wer den Link bekommt, soll
// den Titel sehen koennen, bevor er sich entscheidet.
router.get('/title/:art/:kennung', async (req, res) => {
  const art = req.params.art;
  if (['id', 'movie', 'series'].indexOf(art) === -1) return res.status(400).json({ error: 'invalid_kind' });
  const kennung = Number(req.params.kennung);
  if (!Number.isInteger(kennung) || kennung <= 0) return res.status(400).json({ error: 'invalid_id' });
  const titel = await ladeTitel(art, kennung);
  if (!titel) return res.status(404).json({ error: 'not_found' });
  const backdrop = await ergaenzeBackdrop(titel);
  res.json({
    id: titel.id != null ? Number(titel.id) : null,
    tmdbId: titel.tmdb_id,
    type: titel.type,
    title: titel.title,
    year: titel.year,
    genres: titel.genres || [],
    rating: titel.rating != null ? Number(titel.rating) : null,
    voteCount: titel.vote_count,
    posterPath: titel.poster_path,
    backdropPath: backdrop,
    plot: titel.plot,
    certification: titel.certification,
  });
});

// QR-Code als Matrix statt als Bild: Das Story-Bild wird im Browser auf einer
// Canvas zusammengesetzt, dort lassen sich Quadrate direkt zeichnen. Ein PNG
// muesste erst geladen und dekodiert werden und braechte nichts dazu.
router.get('/qr', async (req, res) => {
  const daten = typeof req.query.data === 'string' ? req.query.data : '';
  if (!daten || daten.length > 512) return res.status(400).json({ error: 'invalid_data' });
  // Fehlerkorrektur M: haelt auch dann, wenn das Bild in der Story teilweise
  // von einem Sticker ueberdeckt wird. Typ 0 = kleinste passende Groesse.
  const qr = qrcode(0, 'M');
  qr.addData(daten);
  qr.make();
  const n = qr.getModuleCount();
  const module = [];
  for (let r = 0; r < n; r++) {
    const zeile = [];
    for (let c = 0; c < n; c++) zeile.push(qr.isDark(r, c) ? 1 : 0);
    module.push(zeile);
  }
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({ size: n, modules: module });
});

export { ladeTitel, ergaenzeBackdrop };
export default router;
