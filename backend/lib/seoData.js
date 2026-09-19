// Datenzugriff fuer die SEO-Seiten (PLAN-SEO.md, Plan "SEO-Seiten:
// technische Umsetzung"). Reine Datenfunktionen, kein HTML -- das baut
// seoRender.js. Jede Funktion liefert `indexierbar: boolean`: an dieser
// einen Stelle entschieden, von der jeweiligen Seite UND der Sitemap UND
// der Canonical-Ergaenzung an /t/ gemeinsam genutzt.
import { pool } from '../db/pool.js';
import { slugify } from './slug.js';
import { anbieterSlug } from './anbieter.js';
import { regionFuerLocale } from './seoLocale.js';
import { bewertungFuerTitel, MINDESTZAHL_BEWERTUNGEN } from './bewertungsstatistik.js';
import { ladePersonDaten } from './personen.js';
import { holeTitelDetails, holeTrailer } from './titeldetails.js';
import { MIN_TITEL, MIN_TITEL_KINO, NEU_JAHRE, THEMEN, listeTitel } from './seoBestenlisten.js';

// Sortierung aller SEO-Titellisten: die GEWICHTETE TMDB-Bewertung, identisch
// zur App (gewichteteNote in index.html: m = 1000, Katalogmittel 6,76).
// Bewusst nicht das rohe rating -- damit staende jeder 10,0-Titel mit drei
// Stimmen ueber dem Klassiker mit 30.000. Ohne Bewertung zaehlt 0 (ans Ende),
// unbekannte Stimmenzahl wie null Stimmen (siehe Kommentar in index.html).
const NOTE_SQL = `CASE WHEN COALESCE(rating, 0) = 0 THEN 0
  ELSE (COALESCE(vote_count, 0)::float / (COALESCE(vote_count, 0) + 1000)) * rating
     + (1000::float / (COALESCE(vote_count, 0) + 1000)) * 6.76 END`;

// Titelquelle ALLER SEO-Listen (Genre, Bestenliste, Hub, Filmografie,
// "aehnliche Titel"). Zwei Dinge, die die Rohtabelle nicht hergibt:
//
// 1. Die Kennung. Die 600 kuratierten Katalog-Titel tragen in titles keine
//    tmdb_id -- ihre steht in title_tmdb_resolution (siehe schema.sql). Ohne
//    den Blick dorthin wurde der Listenlink zu "...-null" und lief auf "Seite
//    nicht gefunden"; so stand es vom 16.08. bis 16.09.2026 auf den Genre-,
//    Hub- und Bestenlisten, waehrend Titelseite und Sitemap laengst ueber
//    COALESCE gingen. Titel, deren Suche nichts fand (tmdb_id auch dort
//    NULL), koennen keine Seite haben und fehlen in den Listen.
// 2. Dubletten. 593 dieser Katalog-Titel gibt es ein zweites Mal aus dem
//    TMDB-Abzug -- derselbe Film stand zweimal in der Liste. Wie in der App
//    (ohneDubletten in index.html) bleibt je Kennung der Eintrag mit den
//    meisten Stimmen; auf dem Live-Bestand ist das ueberall der TMDB-Eintrag
//    mit Poster, Schlagwoertern und Kino-Abgleich.
//
// Kostet einen Sortierlauf ueber ~27.000 Zeilen, ~50 ms auf dem Server --
// tragbar fuer Seiten, die gecacht sind oder vor allem Crawler lesen.
const TITEL_MIT_KENNUNG = `(
  SELECT DISTINCT ON (t.type, COALESCE(t.tmdb_id, r.tmdb_id))
         t.id, COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id, t.type, t.title, t.year,
         t.genres, t.director, t.cast_names, t.rating, t.vote_count, t.poster_path, t.keywords
    FROM titles t LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
   WHERE COALESCE(t.tmdb_id, r.tmdb_id) IS NOT NULL
   ORDER BY t.type, COALESCE(t.tmdb_id, r.tmdb_id), COALESCE(t.vote_count, 0) DESC, t.id
) titel`;


// Ab wie vielen Woertern ein Redaktionstext eine Seite indexierbar macht.
// Die Regel lautet unveraendert: Seiten mit Inhalt stehen auf index, angelegte
// Seiten ohne Inhalt bleiben erreichbar mit noindex. Praezisiert wird nur, was
// "Inhalt" heisst -- ein Rumpftext ist keiner.
//
// Der Grund ist nicht Aesthetik, sondern Umkehrbarkeit: Eine Seite, die als
// duenn eingestuft und aus dem Index geworfen wurde, kommt schwerer zurueck
// als eine, die nie drin war. Lieber spaeter indexieren als zu frueh.
//
// Die Schwelle entspricht der Mindestwortzahl, die seo-texte-anhaengen.mjs und
// seo-batch.mjs beim Schreiben durchsetzen -- sie greift also erst, wenn ein
// Text auf anderem Weg in die Tabelle gelangt ist.
//
// Sie gilt AUSSCHLIESSLICH fuer Titelseiten. Dort ist der Text der Inhalt.
// Genre-, Anbieter-, Bestenlisten-, Hub- und Stadtseiten tragen bewusst kurze
// Einleitungen -- ihr Inhalt sind die Listen darunter, und die sind dort
// ohnehin schon Bedingung fuer index (`&& gesamt > 0` und Verwandte). Wuerde
// man die Schwelle auch auf sie anwenden, fielen 21 bereits indexierte Seiten
// heraus, ohne dass sich an ihrem Wert etwas geaendert haette.
export const MINDESTWOERTER_INDEX = 250;

export function textReichtFuerIndex(text) {
  if (!text) return false;
  // Ueberschriftszeilen zaehlen nicht mit, sonst wuerde das Vier-Abschnitte-
  // Format allein schon acht Woerter beisteuern.
  return text.replace(/^#{1,6}.*$/gm, '').split(/\s+/).filter(Boolean).length >= MINDESTWOERTER_INDEX;
}

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

// Eine eigene Anbieter-Seite hat nur, wer im Streaming-Abgleich vorkommt --
// der Name aus watch_providers_cache.flatrate muss dafuer auf den
// provider_id-Slug aus streaming_cache zurueckgefuehrt werden (anbieterSlug,
// dieselbe Regel wie beim Ingest). Verlinkt wird erst, wenn es die Seite in
// dieser Region wirklich gibt: seit der Import mehr als die vier Anbieter der
// ersten Ausbaustufe kennt, waere ein blindes Mapping sonst eine Quelle toter
// Links. Unbekannte Anbieter bleiben reiner Text.
//
// Die frueher hier stehende Namensliste fuehrte 'Disney+'/'Apple TV+' -- TMDB
// nennt sie inzwischen 'Disney Plus'/'Apple TV', die beiden Links entstanden
// deshalb gar nicht mehr.
const ANBIETER_SEITEN_TTL_MS = 60 * 60 * 1000;
const anbieterSeitenCache = new Map();   // region -> { at, slugs:Set }

async function anbieterMitSeite(region) {
  const gecacht = anbieterSeitenCache.get(region);
  if (gecacht && Date.now() - gecacht.at < ANBIETER_SEITEN_TTL_MS) return gecacht.slugs;
  const { rows } = await pool.query(
    `SELECT DISTINCT provider_id FROM streaming_cache WHERE region = $1`, [region]
  );
  const slugs = new Set(rows.map((r) => r.provider_id));
  anbieterSeitenCache.set(region, { at: Date.now(), slugs });
  return slugs;
}

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
      -- Bei Dubletten (Katalog + TMDB-Abzug) derselbe Sieger wie in
      -- TITEL_MIT_KENNUNG, damit id hier und in den Listen uebereinstimmt.
      ORDER BY COALESCE(t.vote_count, 0) DESC, t.id
      LIMIT 1`,
    [type, tmdbId]
  );
  const titel = rows[0];
  if (!titel || titel.tmdb_id == null) return null;

  const region = regionFuerLocale(locale);
  const [bewertung, streamingRows, text, regisseurRows, aehnlicheRows, details, trailer] = await Promise.all([
    bewertungFuerTitel(titel.id),
    pool.query(
      `SELECT flatrate, rent, buy FROM watch_providers_cache WHERE tmdb_id = $1 AND type = $2 AND region = $3`,
      [titel.tmdb_id, type, region]
    ),
    ladeSeoText('titel', `${type}:${titel.tmdb_id}`, locale),
    // "Weitere Filme von X" -- nur, wenn eine Regie bekannt ist.
    titel.director
      ? pool.query(
          `SELECT id, tmdb_id, title, year, poster_path FROM ${TITEL_MIT_KENNUNG}
            WHERE type = $1 AND director = $2 AND tmdb_id <> $3
            ORDER BY ${NOTE_SQL} DESC LIMIT 6`,
          [type, titel.director, titel.tmdb_id]
        )
      : { rows: [] },
    // "Aehnliche Titel" -- gleiches Genre, ueberschneidende Menge (&&).
    (titel.genres && titel.genres.length)
      ? pool.query(
          `SELECT id, tmdb_id, title, year, genres, rating, poster_path FROM ${TITEL_MIT_KENNUNG}
            WHERE type = $1 AND genres && $2::text[] AND tmdb_id <> $3
            ORDER BY ${NOTE_SQL} DESC LIMIT 6`,
          [type, titel.genres, titel.tmdb_id]
        )
      : { rows: [] },
    // Laufzeit/Budget/Bilder/Besetzung-mit-Rollen UND Trailer sind bewusst
    // live-abrufend (wie ergaenzeBackdrop() in share.js) -- anders als der
    // Regie-Link sollen diese immer vorhanden sein, sobald ein Text existiert.
    holeTitelDetails(type, titel.tmdb_id),
    holeTrailer(type, titel.tmdb_id),
  ]);
  const besetzungNamen = details && details.besetzung_rollen.length
    ? details.besetzung_rollen.map((c) => c.name)
    : (titel.cast_names || []).slice(0, 10);
  // Kein Live-TMDB-Aufruf: nur bereits aufgeloeste Personen, damit ein
  // Crawler-Treffer nicht auf TMDB wartet.
  const [schauspielerIds, regisseurIds] = await Promise.all([
    personenMitSeite(besetzungNamen, 'schauspieler', locale),
    titel.director ? personenMitSeite([titel.director], 'regisseur', locale) : new Map(),
  ]);
  const regisseurPersonId = regisseurIds.get(titel.director) ?? null;

  const zuKarte = (r) => ({ id: String(r.id), tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year, posterPath: r.poster_path });
  const streaming = streamingRows.rows[0] || { flatrate: [], rent: [], buy: [] };
  const seiten = await anbieterMitSeite(region);
  const flatrateMitSlug = (streaming.flatrate || []).map((p) => {
    const slug = anbieterSlug(p.name);
    return { ...p, anbieterSlug: seiten.has(slug) ? slug : null };
  });

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
    regisseurPersonId, // null, solange die Person nicht aufgeloest ist oder keine Seite hat
    aehnlicheTitel: aehnlicheRows.rows.map((r) => ({ ...zuKarte(r), genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null })),
    laufzeitMinuten: details ? details.laufzeit_minuten : null,
    erscheinungsdatum: details && details.erscheinungsdatum ? geburtstagString(details.erscheinungsdatum) : null,
    budget: details ? details.budget : null,
    einspielergebnis: details ? details.einspielergebnis : null,
    besetzungRollen: details ? details.besetzung_rollen : [],
    schauspielerIds, // Map Name -> tmdbPersonId, nur Personen mit indexierbarer Seite
    bilder: details ? details.bilder : [],
    trailerKey: trailer ? trailer.key : null,
    text,
    indexierbar: textReichtFuerIndex(text),
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
    `SELECT count(*)::int AS n FROM ${TITEL_MIT_KENNUNG} WHERE type = $1 AND genres @> ARRAY[$2::text]`,
    [type, genre]
  );
  const gesamt = gesamtRows[0].n;

  const { rows } = await pool.query(
    `SELECT id, tmdb_id, title, year, genres, rating, vote_count, poster_path
       FROM ${TITEL_MIT_KENNUNG} WHERE type = $1 AND genres @> ARRAY[$2::text]
      ORDER BY ${NOTE_SQL} DESC, title ASC
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
    `SELECT * FROM streaming_cache WHERE provider_id = $1 AND region = $2 ORDER BY ${NOTE_SQL} DESC, title ASC`,
    [anbieterSlug, region]
  );
  if (!rows.length) return null;

  const neuGrenze = new Date(Date.now() - 30 * 24 * 3_600_000);
  const filme = rows.filter((r) => r.type === 'movie');
  const serien = rows.filter((r) => r.type === 'series');
  const text = await ladeSeoText('anbieter', anbieterSlug, locale);
  const [kFilme, kSerien] = await Promise.all([bestenlistenKatalog('movie', locale), bestenlistenKatalog('series', locale)]);
  const besteListen = {
    filme: kFilme.anbieter.some((a) => a.slug === anbieterSlug),
    serien: kSerien.anbieter.some((a) => a.slug === anbieterSlug),
  };

  const zuKarte = (r) => ({
    tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year,
    genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null,
    posterPath: r.poster_path, neu: r.first_seen_at && r.first_seen_at > neuGrenze,
  });

  return {
    anbieterSlug, name: rows[0].provider_name, besteListen,
    filme: filme.map(zuKarte), serien: serien.map(zuKarte),
    text, indexierbar: !!text,
  };
}

// ~1h prozessintern gecacht -- die Bewertungs-Aggregation ist zu teuer fuer
// jeden Crawl-Treffer einzeln. Gleiches Muster wie providerCatalog in
// watchProviders.js.
const bestenlisteCache = new Map();
const BESTENLISTE_TTL_MS = 60 * 60 * 1000;

async function anbieterName(slug, region) {
  const { rows } = await pool.query(
    `SELECT provider_name FROM streaming_cache WHERE provider_id = $1 AND region = $2 LIMIT 1`, [slug, region]
  );
  return rows[0] ? rows[0].provider_name : null;
}

// Bedingungen einer Liste als SQL-Fragment ueber TITEL_MIT_KENNUNG (alias
// `titel`). $1 ist immer der Typ. null = Wert unbekannt.
async function listeBedingung(type, modus, wert, region) {
  const params = [type];
  const p = (v) => { params.push(v); return `$${params.length}`; };
  const [a, b] = String(wert).split('+');
  const namen = {};
  const teile = [];

  const genreTeil = async (slug) => {
    const g = await genreName(type, slug);
    if (!g) return false;
    namen.genre = g; namen.genreSlug = slug;
    teile.push(`genres @> ARRAY[${p(g)}::text]`);
    return true;
  };
  const anbieterTeil = async (slug) => {
    const n = await anbieterName(slug, region);
    if (!n) return false;
    namen.anbieter = n;
    teile.push(`EXISTS (SELECT 1 FROM streaming_cache s WHERE s.type = titel.type AND s.tmdb_id = titel.tmdb_id AND s.provider_id = ${p(slug)} AND s.region = ${p(region)})`);
    return true;
  };
  const jahrzehntTeil = (jz) => {
    const j = Number(jz);
    if (!Number.isInteger(j) || j % 10 || j < 1900 || j > 2020) return false;
    teile.push(`year >= ${p(j)} AND year < ${p(j + 10)}`);
    return true;
  };

  let ok;
  switch (modus) {
    case 'jahr': {
      const j = Number(wert);
      ok = Number.isInteger(j) && j >= 1900 && j <= 2100;
      if (ok) teile.push(`year = ${p(j)}`);
      break;
    }
    case 'genre': ok = await genreTeil(a); break;
    case 'anbieter': ok = await anbieterTeil(a); break;
    case 'jahrzehnt': ok = jahrzehntTeil(a); break;
    case 'thema':
      ok = !!THEMEN[a];
      if (ok) teile.push(`keywords && ${p(THEMEN[a].keywords)}::text[]`);
      break;
    case 'genre-jahrzehnt': ok = (await genreTeil(a)) && jahrzehntTeil(b); break;
    case 'genre-anbieter': ok = (await genreTeil(a)) && (await anbieterTeil(b)); break;
    case 'kino':
      ok = type === 'movie' && wert === 'aktuell';
      if (ok) teile.push(`EXISTS (SELECT 1 FROM cinema_cache c WHERE c.tmdb_id = titel.tmdb_id AND c.region = ${p(region)} AND c.category = 'now')`);
      break;
    case 'neu':
      ok = wert === 'aktuell';
      if (ok) teile.push(`year >= ${p(new Date().getFullYear() - NEU_JAHRE + 1)}`);
      break;
    default: ok = false;
  }
  if (!ok) return null;
  return { where: teile.join(' AND '), params, namen };
}

// Modi, die neu dazukamen: unter der Schwelle gibt es keine Seite (404).
// jahr/genre bleiben wie frueher ohne Mindestzahl erreichbar.
const ALTE_MODI = new Set(['jahr', 'genre']);

export async function ladeBestenliste(art, modus, wert, locale) {
  const type = LISTEN_TYP[art];
  if (!type) return null;

  const cacheKey = `${type}:${modus}:${wert}:${locale}`;
  const jetzt = Date.now();
  const gecacht = bestenlisteCache.get(cacheKey);
  if (gecacht && jetzt - gecacht.at < BESTENLISTE_TTL_MS) return gecacht.wert;

  const region = regionFuerLocale(locale);
  const bed = await listeBedingung(type, modus, wert, region);
  if (!bed) return null;

  const { rows } = await pool.query(
    `SELECT id, tmdb_id, title, year, genres, rating, vote_count, poster_path, (count(*) OVER ())::int AS gesamt
       FROM ${TITEL_MIT_KENNUNG} WHERE type = $1 AND ${bed.where}
      ORDER BY ${NOTE_SQL} DESC LIMIT 200`,
    bed.params
  );
  const gesamt = rows.length ? rows[0].gesamt : 0;
  const mindest = modus === 'kino' ? MIN_TITEL_KINO : MIN_TITEL;
  if (!ALTE_MODI.has(modus) && gesamt < mindest) {
    bestenlisteCache.set(cacheKey, { at: jetzt, wert: null });
    return null;
  }

  const bewertungen = await bewertungenFuer(rows.map((r) => r.id));
  // Community-Bewertung schlaegt TMDB, wo vorhanden -- danach nach der
  // gewichteten TMDB-Bewertung (NOTE_SQL, die Reihenfolge der SQL-Abfrage).
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

  const text = await ladeSeoText('bestenliste', `${modus}:${wert}:${type}`, locale);
  const katalog = await bestenlistenKatalog(type, locale);
  const ergebnis = {
    verwandt: verwandteListen(modus, wert, katalog),
    type, modus, wert, gesamtGefunden: gesamt, titel: sortiert,
    ueberschrift: listeTitel(type, modus, wert, bed.namen),
    genre: bed.namen.genre || null, genreSlug: bed.namen.genreSlug || null,
    anbieter: bed.namen.anbieter || null,
    text, indexierbar: !!text && sortiert.length > 0,
  };
  bestenlisteCache.set(cacheKey, { at: jetzt, wert: ergebnis });
  return ergebnis;
}

// Chips auf einer Liste: die naechstfeinere Kombination (Genre x Jahrzehnt,
// Genre x Anbieter), nur wo die Schwelle erreicht ist.
function verwandteListen(modus, wert, katalog) {
  const gruppen = [];
  const add = (titel, links) => { if (links.length) gruppen.push({ titel, links }); };
  if (modus === 'genre') {
    add('Nach Jahrzehnt', katalog.genreJahrzehnt.filter((e) => e.slug === wert).sort((x, y) => x.jz - y.jz)
      .map((e) => ({ label: `${e.jz}er`, modus: 'genre-jahrzehnt', wert: `${wert}+${e.jz}` })));
    add('Nach Anbieter', katalog.genreAnbieter.filter((e) => e.slug === wert)
      .map((e) => ({ label: e.anbieterName, modus: 'genre-anbieter', wert: `${wert}+${e.anbieter}` })));
  } else if (modus === 'jahrzehnt') {
    add('Nach Genre', katalog.genreJahrzehnt.filter((e) => String(e.jz) === wert)
      .map((e) => ({ label: e.genre, modus: 'genre-jahrzehnt', wert: `${e.slug}+${wert}` })));
  } else if (modus === 'anbieter') {
    add('Nach Genre', katalog.genreAnbieter.filter((e) => e.anbieter === wert)
      .map((e) => ({ label: e.genre, modus: 'genre-anbieter', wert: `${e.slug}+${wert}` })));
  }
  return gruppen;
}

// Welche Listen es je Typ gibt (Schwelle erreicht) -- Grundlage der Chips auf
// Hubs und Listen, der Verlinkung von Genre-/Anbieter-Seiten und des
// Textgenerators. Eine Handvoll gruppierter Abfragen, 1 h gecacht.
const katalogCache = new Map();

export async function bestenlistenKatalog(type, locale) {
  const region = regionFuerLocale(locale);
  const key = `${type}:${region}`;
  const gecacht = katalogCache.get(key);
  if (gecacht && Date.now() - gecacht.at < BESTENLISTE_TTL_MS) return gecacht.wert;

  const erlaubteGenres = new Set(await alleGenres(type));
  const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
  const [jz, anb, gj, ga, themen, kino, neu] = await Promise.all([
    q(`SELECT (year / 10 * 10) AS jz, count(*)::int AS n FROM ${TITEL_MIT_KENNUNG}
        WHERE type = $1 AND year >= 1900 GROUP BY 1 HAVING count(*) >= $2 ORDER BY 1`, [type, MIN_TITEL]),
    q(`SELECT s.provider_id AS slug, min(s.provider_name) AS name, count(DISTINCT titel.tmdb_id)::int AS n
         FROM ${TITEL_MIT_KENNUNG} JOIN streaming_cache s ON s.type = titel.type AND s.tmdb_id = titel.tmdb_id AND s.region = $2
        WHERE titel.type = $1 GROUP BY 1 HAVING count(DISTINCT titel.tmdb_id) >= $3 ORDER BY n DESC`, [type, region, MIN_TITEL]),
    q(`SELECT g AS genre, (year / 10 * 10) AS jz, count(*)::int AS n
         FROM ${TITEL_MIT_KENNUNG}, unnest(genres) g
        WHERE type = $1 AND year >= 1900 GROUP BY 1, 2 HAVING count(*) >= $2`, [type, MIN_TITEL]),
    q(`SELECT g AS genre, s.provider_id AS slug, min(s.provider_name) AS name, count(DISTINCT titel.tmdb_id)::int AS n
         FROM ${TITEL_MIT_KENNUNG} JOIN streaming_cache s ON s.type = titel.type AND s.tmdb_id = titel.tmdb_id AND s.region = $2,
              unnest(titel.genres) g
        WHERE titel.type = $1 GROUP BY 1, 2 HAVING count(DISTINCT titel.tmdb_id) >= $3`, [type, region, MIN_TITEL]),
    Promise.all(Object.entries(THEMEN).map(async ([slug, t]) => {
      const [r] = await q(`SELECT count(*)::int AS n FROM ${TITEL_MIT_KENNUNG} WHERE type = $1 AND keywords && $2::text[]`, [type, t.keywords]);
      return { slug, n: r.n };
    })),
    type === 'movie'
      ? q(`SELECT count(*)::int AS n FROM ${TITEL_MIT_KENNUNG}
            WHERE type = 'movie' AND EXISTS (SELECT 1 FROM cinema_cache c WHERE c.tmdb_id = titel.tmdb_id AND c.region = $1 AND c.category = 'now')`, [region])
      : Promise.resolve([{ n: 0 }]),
    q(`SELECT count(*)::int AS n FROM ${TITEL_MIT_KENNUNG} WHERE type = $1 AND year >= $2`, [type, new Date().getFullYear() - NEU_JAHRE + 1]),
  ]);

  const gEintraege = (rows) => rows.filter((r) => erlaubteGenres.has(r.genre));
  const wert = {
    jahrzehnte: jz.map((r) => r.jz),
    anbieter: anb.map((r) => ({ slug: r.slug, name: r.name })),
    genreJahrzehnt: gEintraege(gj).map((r) => ({ genre: r.genre, slug: slugify(r.genre), jz: r.jz })),
    genreAnbieter: gEintraege(ga).map((r) => ({ genre: r.genre, slug: slugify(r.genre), anbieter: r.slug, anbieterName: r.name })),
    themen: themen.filter((t) => t.n >= MIN_TITEL).map((t) => t.slug),
    kino: kino[0].n >= MIN_TITEL_KINO,
    neu: neu[0].n >= MIN_TITEL,
  };
  katalogCache.set(key, { at: Date.now(), wert });
  return wert;
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
       FROM ${TITEL_MIT_KENNUNG} WHERE type = $1 ORDER BY ${NOTE_SQL} DESC LIMIT $2`,
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

// Einstiegsseite unter /<locale>/ -- verlinkt die sechs Bereichs-Hubs.
// robots.txt gibt /de-de/ ausdruecklich frei; ohne diese Route lief der Pfad
// bis 16.08.2026 in einen 404, Crawler landeten also auf einer Fehlerseite.
export async function ladeStartHub(locale) {
  const text = await ladeSeoText('hub', 'start', locale);
  return { text, indexierbar: !!text };
}

export async function ladeFilmeHub(locale) {
  return filmeOderSerienHub('filme', locale);
}

export async function ladeSerienHub(locale) {
  return filmeOderSerienHub('serien', locale);
}

// Nur Kinofilme mit Titelseite: die anderen (~150 von ~180) fuehrten auf 404.
export async function ladeKinoHub(locale) {
  const region = regionFuerLocale(locale);
  const [{ rows: filme }, staedte, text] = await Promise.all([
    pool.query(
      `SELECT tmdb_id, title, year, genres, poster_path FROM cinema_cache
        WHERE region = $1 AND category = 'now'
          AND tmdb_id IN (SELECT tmdb_id FROM ${TITEL_MIT_KENNUNG} WHERE type = 'movie') ORDER BY release_date DESC LIMIT $2`,
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

export async function ladeBestenlistenUebersicht(locale) {
  const [text, filme, serien] = await Promise.all([
    ladeSeoText('hub', 'bestenlisten', locale),
    bestenlistenKatalog('movie', locale), bestenlistenKatalog('series', locale),
  ]);
  return { text, indexierbar: !!text, katalog: { filme, serien } };
}

export async function ladeBestenlisteHub(art, locale) {
  const type = LISTEN_TYP[art];
  if (!type) return null;
  const [{ rows: jahre }, genres, text, katalog] = await Promise.all([
    pool.query(
      `SELECT DISTINCT year FROM titles WHERE type = $1 AND year IS NOT NULL ORDER BY year DESC LIMIT 15`,
      [type]
    ),
    alleGenres(type),
    ladeSeoText('hub', `beste-${art}`, locale),
    bestenlistenKatalog(type, locale),
  ]);
  return { type, art, jahre: jahre.map((r) => r.year), genres, katalog, text, indexierbar: !!text };
}

// Schauspieler-/Regisseur-Seiten (Phase 1b, PLAN-SEO.md 1.5/1.6). Redaktion
// (seo_content, bereich 'person', Schluessel '<rolle>:<tmdbPersonId>') wird
// hier geladen wie bei Titelseiten -- ohne sie bleibt die Seite noindex
// (s.u.), die rohe TMDB-Biografie dient nur noch als Rueckfallanzeige
// (seoRender.js), solange fuer diese Person noch kein Text vorliegt.
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
  const [{ rows }, text] = await Promise.all([
    pool.query(
      `SELECT id, tmdb_id, type, title, year, poster_path FROM ${TITEL_MIT_KENNUNG}
        WHERE ${bedingung} ORDER BY ${NOTE_SQL} DESC LIMIT 24`,
      [person.name]
    ),
    ladeSeoText('person', `${rolle}:${tmdbPersonId}`, locale),
  ]);
  const filmografie = rows.map((r) => ({
    id: String(r.id), tmdbId: r.tmdb_id, type: r.type, slug: slugify(r.title), title: r.title, year: r.year, posterPath: r.poster_path,
  }));

  return {
    tmdbPersonId, rolle, name: person.name, slug: slugify(person.name),
    biografie: person.biografie, fotoPfad: person.foto_pfad,
    geburtstag: geburtstagString(person.geburtstag),
    filmografie, text,
    indexierbar: filmografie.length > 0 && (!!text || !!person.foto_pfad),
  };
}

// Namen, die in personen_cache genau einmal vorkommen, und die Personen mit
// Redaktionstext -- als CTE-Baustein. Korrelierte Unterabfragen je Person
// brauchten 30 s, so ~0,1 s.
const PERSONEN_CTES = `
  eindeutig AS (SELECT name FROM personen_cache GROUP BY name HAVING count(*) = 1),
  mit_text AS (SELECT split_part(schluessel, ':', 2)::int AS id FROM seo_content
                WHERE bereich = 'person' AND locale = $2 AND schluessel LIKE $1 || ':%')`;
const PERSON_HAT_SEITE = `(pc.tmdb_person_id IN (SELECT id FROM mit_text)
     OR (pc.foto_pfad IS NOT NULL AND pc.name IN (SELECT name FROM eindeutig)))`;

// Mindestmenge fuer eine indexierbare Personenseite: mindestens ein Titel im
// Katalog UND (Redaktionstext ODER Foto). Dieselbe Regel steht in
// ladePersonSeite() und in seoSitemap.js (personenUrls).
//
// Welche der Namen haben eine solche Seite? Nur die werden auf Titelseiten
// verlinkt. Mehrdeutige Namen (zwei Personen gleichen Namens in
// personen_cache) werden bewusst nicht verlinkt statt geraten. Der Titel,
// auf dem der Name steht, liefert den Katalog-Titel bereits mit.
export async function personenMitSeite(namen, rolle, locale) {
  const ids = new Map();
  const eindeutig = [...new Set((namen || []).filter(Boolean))];
  if (!eindeutig.length) return ids;
  // Laeuft bei jedem Seitenaufruf -- daher nur ueber die wenigen Kandidaten
  // (Index-Zugriff auf seo_content), nicht ueber die ganze Tabelle.
  const { rows } = await pool.query(
    `SELECT pc.name, pc.tmdb_person_id FROM personen_cache pc
      WHERE pc.name IN (SELECT name FROM personen_cache WHERE name = ANY($3::text[]) GROUP BY name HAVING count(*) = 1)
        AND (pc.foto_pfad IS NOT NULL OR EXISTS (
              SELECT 1 FROM seo_content s
               WHERE s.bereich = 'person' AND s.locale = $2 AND s.schluessel = $1 || ':' || pc.tmdb_person_id))`,
    [rolle, locale, eindeutig]
  );
  for (const r of rows) ids.set(r.name, r.tmdb_person_id);
  return ids;
}

// Uebersichtsseiten /<locale>/schauspieler und /regisseur: die Personen mit den
// meisten Titeln im Katalog (nur mit Seite, siehe personenMitSeite). Die
// Rangliste ist teuer (Gruppierung ueber alle Titel), aendert sich aber selten --
// deshalb wie die Bestenlisten im Prozessspeicher.
const HUB_PERSONEN = 96;
const personenHubCache = new Map();

const TITEL_ZAEHLUNG = {
  schauspieler: `SELECT unnest(cast_names) AS name, count(*)::int AS anzahl FROM titles WHERE cast_names IS NOT NULL GROUP BY 1`,
  regisseur: `SELECT director AS name, count(*)::int AS anzahl FROM titles WHERE director IS NOT NULL GROUP BY 1`,
};

async function personenRangliste(rolle, locale) {
  const key = `${rolle}:${locale}`;
  const gecacht = personenHubCache.get(key);
  if (gecacht && Date.now() - gecacht.at < BESTENLISTE_TTL_MS) return gecacht.liste;
  const { rows } = await pool.query(
    `WITH zaehlung AS (${TITEL_ZAEHLUNG[rolle]}), ${PERSONEN_CTES}
     SELECT pc.tmdb_person_id, pc.name, pc.foto_pfad, z.anzahl
       FROM personen_cache pc
       JOIN zaehlung z ON z.name = pc.name
      WHERE pc.name IN (SELECT name FROM eindeutig) AND ${PERSON_HAT_SEITE}
      ORDER BY z.anzahl DESC, pc.name
      LIMIT $3`,
    [rolle, locale, HUB_PERSONEN]
  );
  const liste = rows.map((r) => ({
    tmdbPersonId: r.tmdb_person_id, name: r.name, slug: slugify(r.name), fotoPfad: r.foto_pfad, anzahl: r.anzahl,
  }));
  personenHubCache.set(key, { at: Date.now(), liste });
  return liste;
}

export async function ladePersonenHub(rolle, locale) {
  const [personen, text] = await Promise.all([
    personenRangliste(rolle, locale),
    ladeSeoText('hub', rolle, locale),
  ]);
  return { rolle, personen, text, indexierbar: !!text && personen.length > 0 };
}

// Alle Personen mit indexierbarer Seite (Regel wie ladePersonSeite): Text ODER
// Foto (bei Foto nur bei eindeutigem Namen), plus mindestens ein Katalog-Titel.
// Eine Abfrage statt ladePersonSeite() je Person -- ~20.000 Personen.
export async function personenFuerSitemap(rolle, locale) {
  const titelMitKennung = `titles t LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
     WHERE COALESCE(t.tmdb_id, r.tmdb_id) IS NOT NULL`;
  const zaehlung = rolle === 'regisseur'
    ? `SELECT DISTINCT t.director AS name FROM ${titelMitKennung} AND t.director IS NOT NULL`
    : `SELECT DISTINCT unnest(t.cast_names) AS name FROM ${titelMitKennung} AND t.cast_names IS NOT NULL`;
  const { rows } = await pool.query(
    `WITH mit_titel AS (${zaehlung}), ${PERSONEN_CTES}
     SELECT pc.tmdb_person_id, pc.name FROM personen_cache pc
       JOIN mit_titel m ON m.name = pc.name
      WHERE ${PERSON_HAT_SEITE}
      ORDER BY pc.tmdb_person_id`,
    [rolle, locale]
  );
  return rows.map((r) => ({ tmdbPersonId: r.tmdb_person_id, slug: slugify(r.name) }));
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
         FROM cinema_cache WHERE region = $1 AND category = 'now'
          AND tmdb_id IN (SELECT tmdb_id FROM ${TITEL_MIT_KENNUNG} WHERE type = 'movie') ORDER BY release_date DESC LIMIT 30`,
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
