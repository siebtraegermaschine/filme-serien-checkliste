// Datenzugriff fuer die SEO-Seiten (PLAN-SEO.md, Plan "SEO-Seiten:
// technische Umsetzung"). Reine Datenfunktionen, kein HTML -- das baut
// seoRender.js. Jede Funktion liefert `indexierbar: boolean`: an dieser
// einen Stelle entschieden, von der jeweiligen Seite UND der Sitemap UND
// der Canonical-Ergaenzung an /t/ gemeinsam genutzt.
import { pool } from '../db/pool.js';
import { slugify } from './slug.js';
import { regionFuerLocale } from './seoLocale.js';
import { bewertungFuerTitel, MINDESTZAHL_BEWERTUNGEN } from './bewertungsstatistik.js';
import { ladePersonDaten, resolvePersonIdCachedOnly } from './personen.js';
import { holeTitelDetails, holeTrailer } from './titeldetails.js';

const TMDB_KIND = { film: 'movie', serie: 'series' };
// Plural-Wortformen fuer Genre-/Bestenlisten-URLs (/filme/..., /serien/...).
const LISTEN_TYP = { filme: 'movie', serien: 'series' };
// genre_alias.art nutzt TMDBs eigene Schreibweise ('tv'), nicht 'series'
// wie titles.type -- siehe streaming.js-Ingest (`g.art === 'tv' ? 'tv' : 'movie'`).
const GENRE_ART = { movie: 'movie', series: 'tv' };

const SEITENGROESSE = 40;
// Ab dieser Zahl an Kinos gilt eine Stadt als eigene Seite wert -- weniger
// waere zu duenner Inhalt (Thin-Content-Vermeidung, siehe PLAN-SEO.md 3.9).
const MIN_KINOS_STADT = 3;

// Nur die vier Abo-Dienste, die auch der taegliche Streaming-Abgleich kennt
// (PROVIDER_NAMES in streaming.js), haben eine eigene Anbieter-Seite -- der
// Name in watch_providers_cache.flatrate (TMDB-Anbieter-IDs) muss deshalb auf
// den provider_id-Slug aus streaming_cache zurueckgefuehrt werden, um von der
// Titelseite dorthin verlinken zu koennen. Unbekannte Anbieter bleiben ohne
// Link (reiner Text) statt zu raten.
const ANBIETER_SLUG_VON_NAME = { 'Netflix': 'netflix', 'Amazon Prime Video': 'amazon', 'Disney+': 'disney', 'Apple TV+': 'apple' };

export async function ladeSeoText(bereich, schluessel, locale) {
  const { rows } = await pool.query(
    `SELECT text FROM seo_content WHERE bereich = $1 AND schluessel = $2 AND locale = $3`,
    [bereich, schluessel, locale]
  );
  return rows[0] ? rows[0].text : null;
}

// art hier ist 'film'/'serie' (die SEO-URL-Woerter), nicht 'movie'/'series'
// wie in share.js -- die Uebersetzung passiert an dieser einen Stelle.
export async function ladeTitelSeite(art, tmdbId, locale) {
  const type = TMDB_KIND[art];
  if (!type) return null;

  const { rows } = await pool.query(
    `SELECT t.id, COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id, t.type, t.title, t.title_en, t.year,
            t.genres, t.director, t.cast_names, t.keywords, t.rating, t.vote_count,
            t.poster_path, t.backdrop_path, t.plot, t.overview_en,
            t.certification, t.certifications, t.uebersetzungen
       FROM titles t
       LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
      WHERE t.type = $1 AND COALESCE(t.tmdb_id, r.tmdb_id) = $2
      LIMIT 1`,
    [type, tmdbId]
  );
  const titel = rows[0];
  if (!titel || titel.tmdb_id == null) return null;

  const region = regionFuerLocale(locale);
  const [bewertung, streamingRows, text, regisseurRows, aehnlicheRows, regisseurPersonId, details, trailer] = await Promise.all([
    bewertungFuerTitel(titel.id),
    pool.query(
      `SELECT flatrate, rent, buy FROM watch_providers_cache WHERE tmdb_id = $1 AND type = $2 AND region = $3`,
      [titel.tmdb_id, type, region]
    ),
    ladeSeoText('titel', `${type}:${titel.tmdb_id}`, locale),
    // "Weitere Filme von X" -- nur, wenn eine Regie bekannt ist.
    titel.director
      ? pool.query(
          `SELECT id, tmdb_id, title, year, poster_path FROM titles
            WHERE type = $1 AND director = $2 AND id <> $3
            ORDER BY vote_count DESC NULLS LAST LIMIT 6`,
          [type, titel.director, titel.id]
        )
      : { rows: [] },
    // "Aehnliche Titel" -- gleiches Genre, ueberschneidende Menge (&&).
    (titel.genres && titel.genres.length)
      ? pool.query(
          `SELECT id, tmdb_id, title, year, genres, rating, poster_path FROM titles
            WHERE type = $1 AND genres && $2::text[] AND id <> $3
            ORDER BY vote_count DESC NULLS LAST LIMIT 6`,
          [type, titel.genres, titel.id]
        )
      : { rows: [] },
    // Kein Live-TMDB-Aufruf hier -- nur ein Cache-Blick (resolvePersonIdCachedOnly),
    // damit ein Crawler-Treffer nicht auf eine noch unaufgeloeste Person wartet.
    titel.director ? resolvePersonIdCachedOnly(titel.director) : null,
    // Laufzeit/Budget/Bilder/Besetzung-mit-Rollen UND Trailer sind bewusst
    // live-abrufend (wie ergaenzeBackdrop() in share.js) -- anders als der
    // Regie-Link sollen diese immer vorhanden sein, sobald ein Text existiert.
    holeTitelDetails(type, titel.tmdb_id),
    holeTrailer(type, titel.tmdb_id),
  ]);

  const zuKarte = (r) => ({ id: String(r.id), tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year, posterPath: r.poster_path });
  const streaming = streamingRows.rows[0] || { flatrate: [], rent: [], buy: [] };
  const flatrateMitSlug = (streaming.flatrate || []).map((p) => ({ ...p, anbieterSlug: ANBIETER_SLUG_VON_NAME[p.name] || null }));

  return {
    id: String(titel.id),
    quelle: 'titles', // fuer ergaenzeBackdrop() aus share.js
    tmdbId: titel.tmdb_id,
    type: titel.type,
    slug: slugify(titel.title),
    title: titel.title,
    year: titel.year,
    genres: titel.genres || [],
    director: titel.director,
    castNames: titel.cast_names || [],
    keywords: titel.keywords || [],
    rating: titel.rating != null ? Number(titel.rating) : null,
    voteCount: titel.vote_count,
    posterPath: titel.poster_path,
    backdropPath: titel.backdrop_path,
    plot: titel.plot,
    certification: (titel.certifications || {})[region] || (titel.certifications || {}).DE || titel.certification || null,
    communityBewertung: bewertung, // null, solange die Mindestzahl (bewertungsstatistik.js) nicht erreicht ist
    streaming: { ...streaming, flatrate: flatrateMitSlug },
    regisseurFilme: regisseurRows.rows.map(zuKarte),
    regisseurPersonId, // null, solange die Person nicht schon einmal aufgeloest wurde
    aehnlicheTitel: aehnlicheRows.rows.map((r) => ({ ...zuKarte(r), genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null })),
    laufzeitMinuten: details ? details.laufzeit_minuten : null,
    erscheinungsdatum: details && details.erscheinungsdatum ? geburtstagString(details.erscheinungsdatum) : null,
    budget: details ? details.budget : null,
    einspielergebnis: details ? details.einspielergebnis : null,
    besetzungRollen: details ? details.besetzung_rollen : [],
    bilder: details ? details.bilder : [],
    trailerKey: trailer ? trailer.key : null,
    text,
    indexierbar: !!text,
  };
}

// Community-Bewertung fuer eine bereits bekannte Menge von title_ids in EINER
// Abfrage -- dieselbe Mindestzahl-Regel wie bewertungFuerTitel(), aber
// batchweise fuer eine Trefferseite statt N Einzelabfragen.
async function bewertungenFuer(titleIds) {
  if (!titleIds.length) return new Map();
  const { rows } = await pool.query(
    `WITH alle AS (
       SELECT title_id, rating::smallint AS sterne, count(*)::int AS anzahl
         FROM user_progress
        WHERE title_id = ANY($1) AND rating IS NOT NULL
        GROUP BY title_id, rating
       UNION ALL
       SELECT title_id, sterne, anzahl FROM title_rating_stufen WHERE title_id = ANY($1)
     )
     SELECT title_id, sum(anzahl)::int AS gesamt,
            round(sum(anzahl * sterne)::numeric / sum(anzahl), 1) AS durchschnitt
       FROM alle GROUP BY title_id
      HAVING sum(anzahl) >= $2`,
    [titleIds, MINDESTZAHL_BEWERTUNGEN]
  );
  return new Map(rows.map((r) => [String(r.title_id), { gesamt: r.gesamt, durchschnitt: Number(r.durchschnitt) }]));
}

function genreArtWort(type) {
  return GENRE_ART[type] || 'movie';
}

async function genreName(type, slug) {
  const { rows } = await pool.query(
    `SELECT DISTINCT name_de FROM genre_alias WHERE art = $1`, [genreArtWort(type)]
  );
  const treffer = rows.find((r) => slugify(r.name_de) === slug);
  return treffer ? treffer.name_de : null;
}

// art hier ist 'filme'/'serien' (Plural-URL-Wort).
export async function ladeGenreSeite(art, genreSlug, seite, locale) {
  const type = LISTEN_TYP[art];
  if (!type) return null;
  const genre = await genreName(type, genreSlug);
  if (!genre) return null;

  const offset = Math.max(0, (seite - 1) * SEITENGROESSE);
  const { rows: gesamtRows } = await pool.query(
    `SELECT count(*)::int AS n FROM titles WHERE type = $1 AND genres @> ARRAY[$2::text]`,
    [type, genre]
  );
  const gesamt = gesamtRows[0].n;

  const { rows } = await pool.query(
    `SELECT id, tmdb_id, title, year, genres, rating, vote_count, poster_path
       FROM titles WHERE type = $1 AND genres @> ARRAY[$2::text]
      ORDER BY vote_count DESC NULLS LAST, rating DESC NULLS LAST, title ASC
      LIMIT $3 OFFSET $4`,
    [type, genre, SEITENGROESSE, offset]
  );
  const bewertungen = await bewertungenFuer(rows.map((r) => r.id));
  const text = await ladeSeoText('genre', genreSlug + ':' + type, locale);

  return {
    type, genre, genreSlug, seite, seiten: Math.max(1, Math.ceil(gesamt / SEITENGROESSE)), gesamt,
    text,
    indexierbar: !!text && gesamt > 0,
    titel: rows.map((r) => ({
      id: String(r.id), tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year,
      genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null,
      voteCount: r.vote_count, posterPath: r.poster_path,
      communityBewertung: bewertungen.get(String(r.id)) || null,
    })),
  };
}

export async function ladeAnbieterSeite(anbieterSlug, locale) {
  const region = regionFuerLocale(locale);
  const { rows } = await pool.query(
    `SELECT * FROM streaming_cache WHERE provider_id = $1 AND region = $2 ORDER BY type, title`,
    [anbieterSlug, region]
  );
  if (!rows.length) return null;

  const neuGrenze = new Date(Date.now() - 30 * 24 * 3_600_000);
  const filme = rows.filter((r) => r.type === 'movie');
  const serien = rows.filter((r) => r.type === 'series');
  const text = await ladeSeoText('anbieter', anbieterSlug, locale);

  const zuKarte = (r) => ({
    tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year,
    genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null,
    posterPath: r.poster_path, neu: r.first_seen_at && r.first_seen_at > neuGrenze,
  });

  return {
    anbieterSlug, name: rows[0].provider_name,
    filme: filme.map(zuKarte), serien: serien.map(zuKarte),
    text, indexierbar: !!text,
  };
}

// ~1h prozessintern gecacht -- die Bewertungs-Aggregation ist zu teuer fuer
// jeden Crawl-Treffer einzeln. Gleiches Muster wie providerCatalog in
// watchProviders.js.
const bestenlisteCache = new Map();
const BESTENLISTE_TTL_MS = 60 * 60 * 1000;

export async function ladeBestenliste(art, modus, wert, locale) {
  const type = LISTEN_TYP[art];
  if (!type || (modus !== 'jahr' && modus !== 'genre')) return null;

  const schluesselTeil = modus === 'jahr' ? `jahr:${wert}` : `genre:${wert}`;
  const cacheKey = `${type}:${schluesselTeil}:${locale}`;
  const jetzt = Date.now();
  const gecacht = bestenlisteCache.get(cacheKey);
  if (gecacht && jetzt - gecacht.at < BESTENLISTE_TTL_MS) return gecacht.wert;

  let bedingung, param;
  if (modus === 'jahr') {
    const jahr = Number(wert);
    if (!Number.isInteger(jahr) || jahr < 1900 || jahr > 2100) return null;
    bedingung = 'year = $2'; param = jahr;
  } else {
    const genre = await genreName(type, wert);
    if (!genre) return null;
    bedingung = 'genres @> ARRAY[$2::text]'; param = genre;
  }

  const { rows } = await pool.query(
    `SELECT id, tmdb_id, title, year, genres, rating, vote_count, poster_path
       FROM titles WHERE type = $1 AND ${bedingung}
      ORDER BY vote_count DESC NULLS LAST, rating DESC NULLS LAST LIMIT 200`,
    [type, param]
  );
  const bewertungen = await bewertungenFuer(rows.map((r) => r.id));
  // Community-Bewertung schlaegt TMDB-Popularitaet, wo vorhanden -- danach
  // wie zuvor nach TMDB-Stimmenzahl (die Reihenfolge der SQL-Abfrage).
  const sortiert = rows
    .map((r) => ({
      id: String(r.id), tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year,
      genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null,
      voteCount: r.vote_count, posterPath: r.poster_path,
      communityBewertung: bewertungen.get(String(r.id)) || null,
    }))
    .sort((a, b) => (b.communityBewertung ? b.communityBewertung.durchschnitt : -1) -
                     (a.communityBewertung ? a.communityBewertung.durchschnitt : -1))
    .slice(0, 20);

  const text = await ladeSeoText('bestenliste', `${schluesselTeil}:${type}`, locale);
  const ergebnis = {
    type, modus, wert, gesamtGefunden: rows.length, titel: sortiert,
    text, indexierbar: !!text && sortiert.length > 0,
  };
  bestenlisteCache.set(cacheKey, { at: jetzt, wert: ergebnis });
  return ergebnis;
}

// Wie providerCatalog in watchProviders.js: kleine, sich selten aendernde
// Liste, deshalb im Prozessspeicher statt bei jedem Aufruf neu aus der DB.
let staedteCache = { at: 0, liste: [] };
async function staedteListe() {
  if (staedteCache.liste.length && Date.now() - staedteCache.at < BESTENLISTE_TTL_MS) {
    return staedteCache.liste;
  }
  const { rows } = await pool.query(
    `SELECT ort, count(*)::int AS anzahl FROM kinos WHERE ort IS NOT NULL AND ort <> '' GROUP BY ort`
  );
  staedteCache = { at: Date.now(), liste: rows };
  return rows;
}

// ---- Hub-Seiten (/filme, /serien, /kino, /streaming, /beste-filme,
// /beste-serien ohne weiteren Pfad) -- oben an der SEO-Pyramide, verlinken
// nur nach unten zu den bestehenden Genre-/Anbieter-/Stadt-/Bestenlisten-
// Seiten. Kein neuer Datenbedarf, nur breitere Abfragen derselben Tabellen.
const HUB_ANZAHL = 24;

async function alleGenres(type) {
  const { rows } = await pool.query(`SELECT name_de FROM genre_alias WHERE art = $1 ORDER BY name_de`, [genreArtWort(type)]);
  return rows.map((r) => r.name_de);
}

async function topTitel(type, limit = HUB_ANZAHL) {
  const { rows } = await pool.query(
    `SELECT id, tmdb_id, title, year, genres, rating, vote_count, poster_path
       FROM titles WHERE type = $1 ORDER BY vote_count DESC NULLS LAST, rating DESC NULLS LAST LIMIT $2`,
    [type, limit]
  );
  const bewertungen = await bewertungenFuer(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: String(r.id), tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year,
    genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null,
    communityBewertung: bewertungen.get(String(r.id)) || null,
  }));
}

async function filmeOderSerienHub(art, locale) {
  const type = LISTEN_TYP[art];
  const [titel, genres, text] = await Promise.all([
    topTitel(type),
    alleGenres(type),
    ladeSeoText('hub', art, locale),
  ]);
  return { type, titel, genres, text, indexierbar: !!text };
}

export async function ladeFilmeHub(locale) {
  return filmeOderSerienHub('filme', locale);
}

export async function ladeSerienHub(locale) {
  return filmeOderSerienHub('serien', locale);
}

export async function ladeKinoHub(locale) {
  const region = regionFuerLocale(locale);
  const [{ rows: filme }, staedte, text] = await Promise.all([
    pool.query(
      `SELECT tmdb_id, title, year, genres, poster_path FROM cinema_cache
        WHERE region = $1 AND category = 'now' ORDER BY release_date DESC LIMIT $2`,
      [region, HUB_ANZAHL]
    ),
    staedteListe(),
    ladeSeoText('hub', 'kino', locale),
  ]);
  const qualifiziert = staedte.filter((s) => s.anzahl >= MIN_KINOS_STADT).sort((a, b) => b.anzahl - a.anzahl);
  return {
    filme: filme.map((f) => ({ tmdbId: f.tmdb_id, slug: slugify(f.title), title: f.title, year: f.year, genres: f.genres || [], posterPath: f.poster_path })),
    staedte: qualifiziert.map((s) => ({ ort: s.ort, slug: slugify(s.ort) })),
    text, indexierbar: !!text,
  };
}

export async function ladeStreamingHub(locale) {
  const region = regionFuerLocale(locale);
  const [{ rows }, text] = await Promise.all([
    pool.query(
      `SELECT provider_id, provider_name, count(*)::int AS anzahl
         FROM streaming_cache WHERE region = $1 GROUP BY provider_id, provider_name ORDER BY anzahl DESC`,
      [region]
    ),
    ladeSeoText('hub', 'streaming', locale),
  ]);
  return {
    anbieter: rows.map((r) => ({ slug: r.provider_id, name: r.provider_name, anzahl: r.anzahl })),
    text, indexierbar: !!text,
  };
}

export async function ladeBestenlisteHub(art, locale) {
  const type = LISTEN_TYP[art];
  if (!type) return null;
  const [{ rows: jahre }, genres, text] = await Promise.all([
    pool.query(
      `SELECT DISTINCT year FROM titles WHERE type = $1 AND year IS NOT NULL ORDER BY year DESC LIMIT 15`,
      [type]
    ),
    alleGenres(type),
    ladeSeoText('hub', `beste-${art}`, locale),
  ]);
  return { type, art, jahre: jahre.map((r) => r.year), genres, text, indexierbar: !!text };
}

// Schauspieler-/Regisseur-Seiten (Phase 1b, PLAN-SEO.md 1.5/1.6). Keine
// eigene Redaktion (seo_content) -- die Biografie ist TMDBs echter Text
// (siehe personen.js), der einzigartige Wert dieser Seite ist die
// Filmografie INNERHALB unseres Katalogs (Bewertung, Verfuegbarkeit).
// rolle 'regisseur' sucht ueber titles.director, 'schauspieler' ueber
// cast_names -- eine Person mit beiden Rollen bekommt zwei getrennte Seiten,
// damit keine der beiden Dubletten-Inhalt zur anderen wird.
// person.geburtstag kommt entweder als reiner ISO-String (frisch von TMDB)
// oder als JS-Date-Objekt aus Postgres (Spaltentyp DATE, von node-postgres
// zu LOKALER Mitternacht konstruiert). toISOString() wuerde das ins
// UTC-Datum konvertieren und in Zeitzonen vor UTC (z.B. CET) einen Tag
// zurueckspringen -- deshalb ueber lokale Datumskomponenten formatiert statt
// ueber eine UTC-Konvertierung, das passt fuer beide Faelle.
function geburtstagString(wert) {
  if (!wert) return null;
  const d = new Date(wert);
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, '0');
  const tag = String(d.getDate()).padStart(2, '0');
  return `${jahr}-${monat}-${tag}`;
}

export async function ladePersonSeite(rolle, tmdbPersonId, locale) {
  const person = await ladePersonDaten(tmdbPersonId);
  if (!person) return null;

  const bedingung = rolle === 'regisseur' ? 'director = $1' : '$1 = ANY(cast_names)';
  const { rows } = await pool.query(
    `SELECT id, tmdb_id, type, title, year, poster_path FROM titles
      WHERE ${bedingung} ORDER BY vote_count DESC NULLS LAST LIMIT 24`,
    [person.name]
  );
  const filmografie = rows.map((r) => ({
    id: String(r.id), tmdbId: r.tmdb_id, type: r.type, slug: slugify(r.title), title: r.title, year: r.year, posterPath: r.poster_path,
  }));

  return {
    tmdbPersonId, rolle, name: person.name, slug: slugify(person.name),
    biografie: person.biografie, fotoPfad: person.foto_pfad,
    geburtstag: geburtstagString(person.geburtstag),
    filmografie,
    indexierbar: !!person.biografie && filmografie.length > 0,
  };
}

export async function ladeKinoStadt(stadtSlug, locale) {
  const staedte = await staedteListe();
  const stadt = staedte.find((s) => slugify(s.ort) === stadtSlug);
  if (!stadt || stadt.anzahl < MIN_KINOS_STADT) return null;

  const region = regionFuerLocale(locale);
  const [{ rows: kinos }, { rows: filme }, text] = await Promise.all([
    pool.query(
      `SELECT name, strasse, plz, website FROM kinos WHERE ort = $1 ORDER BY name`,
      [stadt.ort]
    ),
    pool.query(
      `SELECT tmdb_id, title, year, genres, poster_path, release_date
         FROM cinema_cache WHERE region = $1 AND category = 'now' ORDER BY release_date DESC LIMIT 30`,
      [region]
    ),
    ladeSeoText('kino_stadt', stadtSlug, locale),
  ]);

  return {
    stadtSlug, ort: stadt.ort, anzahlKinos: stadt.anzahl,
    kinos: kinos.map((k) => ({ name: k.name, strasse: k.strasse, plz: k.plz, website: k.website })),
    filme: filme.map((f) => ({
      tmdbId: f.tmdb_id, slug: slugify(f.title), title: f.title, year: f.year,
      genres: f.genres || [], posterPath: f.poster_path,
    })),
    text, indexierbar: !!text,
  };
}
