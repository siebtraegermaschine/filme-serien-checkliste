// Zusatzdaten fuer die SEO-Titeldetailseite: Trailer, Laufzeit, genaues
// Erscheinungsdatum, Budget/Einspielergebnis, Besetzung mit Rollennamen,
// Bildergalerie. Verzoegerter TMDB-Abruf + Cache -- dasselbe Muster wie
// personen.js/ergaenzeBackdrop() in share.js: kein Vorab-Abruf fuer den
// ganzen Katalog, sondern erst beim ersten Seitenaufruf, danach dauerhaft
// gecacht. Alle Werte sind TMDBs eigene Angaben, nichts wird hier
// recherchiert oder frei formuliert.
import { pool } from '../db/pool.js';

const API = 'https://api.themoviedb.org/3';
const TMDB_KIND = { movie: 'movie', series: 'tv' };

async function tmdbJson(pfad, key) {
  const url = new URL(`${API}${pfad}`);
  url.searchParams.set('api_key', key);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

export async function holeTitelDetails(type, tmdbId) {
  const { rows } = await pool.query(
    `SELECT * FROM titel_details_cache WHERE tmdb_id = $1 AND type = $2`, [tmdbId, type]
  );
  if (rows.length) return rows[0];

  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const kind = TMDB_KIND[type];
  try {
    const [detail, credits, images] = await Promise.all([
      tmdbJson(`/${kind}/${tmdbId}?language=de-DE`, key),
      tmdbJson(`/${kind}/${tmdbId}/credits`, key),
      tmdbJson(`/${kind}/${tmdbId}/images`, key),
    ]);
    const row = {
      tmdb_id: tmdbId,
      type,
      laufzeit_minuten: kind === 'movie' ? (detail.runtime || null) : ((detail.episode_run_time || [])[0] || null),
      erscheinungsdatum: (kind === 'movie' ? detail.release_date : detail.first_air_date) || null,
      budget: kind === 'movie' && detail.budget ? detail.budget : null,
      einspielergebnis: kind === 'movie' && detail.revenue ? detail.revenue : null,
      besetzung_rollen: (credits.cast || []).slice(0, 10).map((c) => ({ name: c.name, rolle: c.character, foto: c.profile_path })),
      bilder: (images.backdrops || []).slice(0, 8).map((b) => b.file_path),
    };
    await pool.query(
      `INSERT INTO titel_details_cache (tmdb_id, type, laufzeit_minuten, erscheinungsdatum, budget, einspielergebnis, besetzung_rollen, bilder)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tmdb_id, type) DO UPDATE SET
         laufzeit_minuten = EXCLUDED.laufzeit_minuten, erscheinungsdatum = EXCLUDED.erscheinungsdatum,
         budget = EXCLUDED.budget, einspielergebnis = EXCLUDED.einspielergebnis,
         besetzung_rollen = EXCLUDED.besetzung_rollen, bilder = EXCLUDED.bilder, fetched_at = now()`,
      [row.tmdb_id, row.type, row.laufzeit_minuten, row.erscheinungsdatum, row.budget, row.einspielergebnis,
        JSON.stringify(row.besetzung_rollen), JSON.stringify(row.bilder)]
    );
    return row;
  } catch (err) {
    console.error(`titeldetails: TMDB-Detailabruf fehlgeschlagen (${type}/${tmdbId}):`, err.message);
    return null;
  }
}

// Eigenstaendig statt Wiederverwendung von trailers.js' Route-Logik --
// dieselbe title_videos_cache-Tabelle, aber als reine Datenfunktion statt
// HTTP-Handler, damit seoData.js sie direkt aufrufen kann.
export async function holeTrailer(type, tmdbId) {
  const { rows } = await pool.query(
    `SELECT video_key, video_name FROM title_videos_cache WHERE tmdb_id = $1 AND type = $2`, [tmdbId, type]
  );
  const cached = rows[0];
  if (cached) return cached.video_key ? { key: cached.video_key, name: cached.video_name } : null;

  const key = process.env.TMDB_API_KEY;
  if (!key) return null;
  const kind = TMDB_KIND[type];
  try {
    const [de, en] = await Promise.all([
      tmdbJson(`/${kind}/${tmdbId}/videos?language=de-DE`, key),
      tmdbJson(`/${kind}/${tmdbId}/videos`, key),
    ]);
    const kandidaten = [...(de.results || []), ...(en.results || [])]
      .filter((v) => v.site === 'YouTube' && ['Trailer', 'Teaser'].includes(v.type) && v.key);
    const beste = kandidaten.find((v) => v.type === 'Trailer' && v.official) || kandidaten[0] || null;
    await pool.query(
      `INSERT INTO title_videos_cache (tmdb_id, type, video_key, video_name, fetched_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (tmdb_id, type) DO UPDATE SET video_key = EXCLUDED.video_key, video_name = EXCLUDED.video_name, fetched_at = now()`,
      [tmdbId, type, beste ? beste.key : null, beste ? beste.name : null]
    );
    return beste ? { key: beste.key, name: beste.name } : null;
  } catch (err) {
    console.error(`titeldetails: Trailer-Abruf fehlgeschlagen (${type}/${tmdbId}):`, err.message);
    return null;
  }
}
