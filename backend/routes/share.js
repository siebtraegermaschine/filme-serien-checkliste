import qrcode from 'qrcode-generator';
import { pool } from '../db/pool.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { mengenGrenze } from '../middleware/rateLimit.js';
import { sprachWahl, regionWahl, sprachFeld, freigabeFuer } from '../lib/i18n.js';

const router = createAsyncRouter();

// Grenzen je IP. Der Titel-Abruf kann beim ersten Teilen eines Titels einen
// ausgehenden TMDB-Aufruf ausloesen (danach gecacht) -- deshalb gedeckelt,
// damit niemand ueber viele Kennungen die TMDB-Abrufe in die Hoehe treibt. Der
// QR-Bau ist reine Rechenzeit. Beide grosszuegig; ein normaler Teilen-Vorgang
// loest je einen Aufruf aus.
const GRENZE_TITEL = mengenGrenze({ name: 'share-title', anzahl: 120, minuten: 1 });
const GRENZE_QR = mengenGrenze({ name: 'share-qr', anzahl: 120, minuten: 1 });

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
// COALESCE ueber title_tmdb_resolution: Die kuratierten Katalog-Titel haben
// keine eigene tmdb_id, ihre Zuordnung steht in dieser Tabelle (595 von 600).
// Ohne sie bekaemen ausgerechnet die prominentesten Titel kein Breitbild und
// damit auch keine grosse Vorschaukarte in WhatsApp.
const FELDER = `t.id, COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id, t.type, t.title, t.title_en, t.year,
                t.genres, t.rating, t.vote_count, t.poster_path, t.backdrop_path,
                t.plot, t.overview_en, t.certification, t.certifications`;
const VON = `FROM titles t LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id`;

async function ladeTitel(art, kennung) {
  if (art === 'id') {
    const { rows } = await pool.query(
      `SELECT ${FELDER}, 'titles' AS quelle ${VON} WHERE t.id = $1 LIMIT 1`, [kennung]);
    return rows[0] || null;
  }
  const type = art === 'series' ? 'series' : 'movie';
  const { rows } = await pool.query(
    `SELECT ${FELDER}, 'titles' AS quelle ${VON}
      WHERE t.type = $1 AND COALESCE(t.tmdb_id, r.tmdb_id) = $2 LIMIT 1`,
    [type, kennung]
  );
  if (rows[0]) return rows[0];
  if (type !== 'movie') return null;
  const { rows: kino } = await pool.query(
    `SELECT NULL::bigint AS id, tmdb_id, 'movie' AS type, title, title_en, year, genres, rating, vote_count,
            poster_path, backdrop_path, overview AS plot, overview_en, certification, certifications, 'cinema_cache' AS quelle
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
    // Ueber die Zeilen-ID speichern, wo es eine gibt: Bei Katalog-Titeln stammt
    // die tmdb_id aus title_tmdb_resolution, ein UPDATE ueber titles.tmdb_id
    // traefe dort gar keine Zeile.
    if (titel.quelle === 'cinema_cache') {
      await pool.query(`UPDATE cinema_cache SET backdrop_path = $1 WHERE tmdb_id = $2`, [pfad, titel.tmdb_id]);
    } else {
      await pool.query(`UPDATE titles SET backdrop_path = $1 WHERE id = $2`, [pfad, titel.id]);
    }
    return pfad;
  } catch {
    return null;
  }
}

// Oeffentlich: Datensatz fuer die Karte, die der Empfaenger eines geteilten
// Links zu sehen bekommt. Ohne Login erreichbar -- wer den Link bekommt, soll
// den Titel sehen koennen, bevor er sich entscheidet.
router.get('/title/:art/:kennung', GRENZE_TITEL, async (req, res) => {
  const art = req.params.art;
  if (['id', 'movie', 'series'].indexOf(art) === -1) return res.status(400).json({ error: 'invalid_kind' });
  const kennung = Number(req.params.kennung);
  if (!Number.isInteger(kennung) || kennung <= 0) return res.status(400).json({ error: 'invalid_id' });
  const titel = await ladeTitel(art, kennung);
  if (!titel) return res.status(404).json({ error: 'not_found' });
  const lang = sprachWahl(req.query.lang);
  const region = regionWahl(req.query.region);
  const backdrop = await ergaenzeBackdrop(titel);
  res.json({
    // Als String, NICHT als Zahl: titles.id ist bigint, der Postgres-Treiber
    // liefert das ueberall sonst als String -- POOL.realId und die Schluessel
    // von PROGRESS sind entsprechend Strings. Eine Zahl hier haette bedeutet,
    // dass ein ueber den geteilten Link gespeicherter Titel zwar auf dem Server
    // landet, in der eigenen Liste aber erst nach einem Neuladen auftaucht.
    id: titel.id != null ? String(titel.id) : null,
    tmdbId: titel.tmdb_id,
    type: titel.type,
    title: sprachFeld(lang, titel.title, titel.title_en),
    year: titel.year,
    genres: titel.genres || [],
    rating: titel.rating != null ? Number(titel.rating) : null,
    voteCount: titel.vote_count,
    posterPath: titel.poster_path,
    backdropPath: backdrop,
    plot: sprachFeld(lang, titel.plot, titel.overview_en),
    certification: freigabeFuer(region, titel.certifications, titel.certification),
  });
});

// QR-Code als Matrix statt als Bild: Das Story-Bild wird im Browser auf einer
// Canvas zusammengesetzt, dort lassen sich Quadrate direkt zeichnen. Ein PNG
// muesste erst geladen und dekodiert werden und braechte nichts dazu.
router.get('/qr', GRENZE_QR, async (req, res) => {
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
