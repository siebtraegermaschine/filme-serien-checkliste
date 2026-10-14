// Datenzugriff fuer die SEO-Seiten (PLAN-SEO.md, Plan "SEO-Seiten:
// technische Umsetzung"). Reine Datenfunktionen, kein HTML -- das baut
// seoRender.js. Jede Funktion liefert `indexierbar: boolean`: an dieser
// einen Stelle entschieden. Regel: index, sobald die Seite Eintraege hat --
// ein eigener Text ist KEINE Bedingung mehr. seoSitemap.js listet dieselben
// Seiten ueber die *FuerSitemap-Funktionen unten.
import { pool } from '../db/pool.js';
import { slugify } from './slug.js';
import { anbieterSlug } from './anbieter.js';
import { regionFuerLocale, sprachVon, textLocale, localesMitText, titelTextReicht } from './seoLocale.js';
import { sprachFeld } from './i18n.js';
import { bewertungFuerTitel, MINDESTZAHL_BEWERTUNGEN } from './bewertungsstatistik.js';
import { ladePersonDaten } from './personen.js';
import { holeTitelDetails, holeTrailer } from './titeldetails.js';
import { MIN_TITEL_REIHE, reihenName, reihenSlugs, inErscheinungsreihenfolge, reihenFakten } from './seoReihen.js';
import { streamingFenster, kinoFenster, heuteBerlin, istImportTag, TAGE_LANG } from './seoWochen.js';
import { genreAnzeige } from './genreNamen.js';
import { listeTitelLokal, jahrzehntNameL, seitenTexte } from './seoSeitenTexte.js';
import { MIN_TITEL, MIN_TITEL_KINO, MIN_TITEL_LAND_GENRE, NEU_JAHRE, THEMEN, LAUFZEITEN, STAFFELN, listeTitel } from './seoBestenlisten.js';
import {
  landName, landAus, landSlug, codeAusLandSlug, landHatSeite,
  sprachName, sprachSlug, codeAusSprachSlug, spracheHatSeite, landAnzeige, sprachAnzeige,
} from './herkunftsnamen.js';

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
         t.genres, t.director, t.cast_names, t.rating, t.vote_count, t.poster_path, t.keywords,
         t.origin_country, t.original_language, t.runtime, t.seasons,
         t.collection_id, t.collection_name, t.erschienen_am
    FROM titles t LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
   WHERE COALESCE(t.tmdb_id, r.tmdb_id) IS NOT NULL
   ORDER BY t.type, COALESCE(t.tmdb_id, r.tmdb_id), COALESCE(t.vote_count, 0) DESC, t.id
) titel`;


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
    [bereich, schluessel, textLocale(locale)]
  );
  return rows[0] ? rows[0].text : null;
}

// Anzeigetitel je Locale. de-de bleibt der Stammtitel; andere Locales nehmen
// Wunschsprache -> Englisch -> Deutsch (sprachFeld). Slugs bleiben bewusst vom
// deutschen Titel abgeleitet, damit URLs je Locale gleich aufgebaut sind.
export function anzeigeTitel(zeile, locale) {
  const sprache = sprachVon(locale);
  if (sprache === 'de') return zeile.title;
  return sprachFeld(sprache, zeile.title, zeile.title_en, zeile.uebersetzungen, 't');
}

// Lokalisierte Titel fuer Kartenlisten (Id -> Titel). Eigene Abfrage statt
// Spalten in TITEL_MIT_KENNUNG, damit die grossen Listenabfragen schlank bleiben.
async function lokaleTitel(ids, locale) {
  const sprache = sprachVon(locale);
  if (sprache === 'de' || !ids.length) return new Map();
  const { rows } = await pool.query(
    `SELECT id, title, title_en, jsonb_build_object($2::text, jsonb_build_object('t', uebersetzungen -> $2::text ->> 't')) AS uebersetzungen
       FROM titles WHERE id = ANY($1::bigint[])`,
    [ids, sprache]
  );
  return new Map(rows.map((r) => [String(r.id), anzeigeTitel(r, locale)]));
}

// Kartenlisten lokalisieren, ohne gecachte Objekte zu veraendern (Kopien).
// Mit Titel-Id (Genre, Bestenliste, Hub, Reihe) ...
async function titelNachId(karten, locale) {
  if (sprachVon(locale) === 'de' || !karten.length) return karten;
  const m = await lokaleTitel(karten.map((k) => k.id), locale);
  return karten.map((k) => (m.has(k.id) ? { ...k, title: m.get(k.id) } : k));
}

// ... und ohne Id (streaming_cache/cinema_cache kennen nur tmdb_id und Typ).
async function titelNachKennung(karten, locale, standardTyp) {
  if (sprachVon(locale) === 'de' || !karten.length) return karten;
  const { rows } = await pool.query(
    `SELECT id, type, tmdb_id FROM ${TITEL_MIT_KENNUNG} WHERE tmdb_id = ANY($1::int[])`,
    [[...new Set(karten.map((k) => k.tmdbId))]]
  );
  const idVon = new Map(rows.map((r) => [`${r.type}:${r.tmdb_id}`, String(r.id)]));
  const m = await lokaleTitel([...idVon.values()], locale);
  return karten.map((k) => {
    const id = idVon.get(`${k.type || standardTyp}:${k.tmdbId}`);
    return id && m.has(id) ? { ...k, title: m.get(id) } : k;
  });
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
            t.certification, t.certifications, t.uebersetzungen, t.collection_id
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
  const [bewertung, streamingRows, text, fassungenRows, regisseurRows, aehnlicheRows, details, trailer] = await Promise.all([
    bewertungFuerTitel(titel.id),
    pool.query(
      `SELECT flatrate, rent, buy FROM watch_providers_cache WHERE tmdb_id = $1 AND type = $2 AND region = $3`,
      [titel.tmdb_id, type, region]
    ),
    ladeSeoText('titel', `${type}:${titel.tmdb_id}`, locale),
    // Sprachfassungen mit Text -- Grundlage des hreflang-Clusters.
    pool.query(`SELECT locale FROM seo_content WHERE bereich = 'titel' AND schluessel = $1`, [`${type}:${titel.tmdb_id}`]),
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

  const kartenTitel = await lokaleTitel([...regisseurRows.rows, ...aehnlicheRows.rows].map((r) => r.id), locale);
  const zuKarte = (r) => ({ id: String(r.id), tmdbId: r.tmdb_id, slug: slugify(r.title, locale), title: kartenTitel.get(String(r.id)) || r.title, year: r.year, posterPath: r.poster_path });
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
    slug: slugify(titel.title, locale),
    title: anzeigeTitel(titel, locale),
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
    reihe: await reiheFuerTitel(titel.collection_id),
    text,
    textLocales: localesMitText(fassungenRows.rows.map((r) => r.locale)),
    indexierbar: titelTextReicht(locale, text),
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

  const titel = await titelNachId(rows.map((r) => ({
    id: String(r.id), tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year,
    genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null,
    voteCount: r.vote_count, posterPath: r.poster_path,
    communityBewertung: bewertungen.get(String(r.id)) || null,
  })), locale);

  return {
    type, genre: genreAnzeige(genre, sprachVon(locale)), genreSlug, seite, seiten: Math.max(1, Math.ceil(gesamt / SEITENGROESSE)), gesamt,
    text,
    indexierbar: gesamt > 0,
    titel,
  };
}

export async function ladeAnbieterSeite(anbieterSlug, locale) {
  const region = regionFuerLocale(locale);
  const { rows } = await pool.query(
    `SELECT * FROM streaming_cache WHERE provider_id = $1 AND region = $2 ORDER BY ${NOTE_SQL} DESC, title ASC`,
    [anbieterSlug, region]
  );
  if (!rows.length) return null;

  // Nur Titel mit eigener Titelseite duerfen verlinkt werden (sonst 404).
  const { rows: mitSeite } = await pool.query(
    `SELECT type, tmdb_id FROM ${TITEL_MIT_KENNUNG} WHERE tmdb_id = ANY($1::int[])`,
    [rows.map((r) => r.tmdb_id)]
  );
  const hatSeite = new Set(mitSeite.map((r) => `${r.type}:${r.tmdb_id}`));

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
    hatSeite: hatSeite.has(`${r.type}:${r.tmdb_id}`),
  });

  const [filmeL, serienL] = await Promise.all([
    titelNachKennung(filme.map(zuKarte), locale, 'movie'),
    titelNachKennung(serien.map(zuKarte), locale, 'series'),
  ]);
  return {
    anbieterSlug, name: rows[0].provider_name, besteListen,
    filme: filmeL, serien: serienL,
    text, indexierbar: true,
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
  const landTeil = (slug) => {
    const code = codeAusLandSlug(slug);
    if (!code) return false;
    namen.land = landAus(code); namen.landSlug = slug; namen.landKurz = landName(code); namen.landCode = code;
    teile.push(`origin_country @> ARRAY[${p(code)}::text]`);
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
    case 'land': ok = landTeil(a); break;
    case 'sprache': {
      const code = codeAusSprachSlug(a);
      ok = !!code;
      if (ok) {
        namen.sprache = sprachName(code); namen.spracheCode = code;
        teile.push(`original_language = ${p(code)}`);
      }
      break;
    }
    case 'laufzeit': {
      const l = LAUFZEITEN[a];
      ok = type === 'movie' && !!l;
      if (ok) teile.push(`runtime >= ${p(l.min)}${l.max ? ` AND runtime <= ${p(l.max)}` : ''}`);
      break;
    }
    case 'staffeln': {
      const st = STAFFELN[a];
      ok = type === 'series' && !!st;
      if (ok) teile.push(`seasons >= ${p(st.min)}${st.max ? ` AND seasons <= ${p(st.max)}` : ''}`);
      break;
    }
    case 'land-genre': ok = landTeil(a) && (await genreTeil(b)); break;
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
  const mindest = modus === 'kino' ? MIN_TITEL_KINO : modus === 'land-genre' ? MIN_TITEL_LAND_GENRE : MIN_TITEL;
  if (!ALTE_MODI.has(modus) && gesamt < mindest) {
    bestenlisteCache.set(cacheKey, { at: jetzt, wert: null });
    return null;
  }

  const bewertungen = await bewertungenFuer(rows.map((r) => r.id));
  // Community-Bewertung schlaegt TMDB, wo vorhanden -- danach nach der
  // gewichteten TMDB-Bewertung (NOTE_SQL, die Reihenfolge der SQL-Abfrage).
  const sortiertRoh = rows
    .map((r) => ({
      id: String(r.id), tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year,
      genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null,
      voteCount: r.vote_count, posterPath: r.poster_path,
      communityBewertung: bewertungen.get(String(r.id)) || null,
    }))
    .sort((a, b) => (b.communityBewertung ? b.communityBewertung.durchschnitt : -1) -
                     (a.communityBewertung ? a.communityBewertung.durchschnitt : -1))
    .slice(0, 20);
  const sortiert = await titelNachId(sortiertRoh, locale);

  const text = await ladeSeoText('bestenliste', `${modus}:${wert}:${type}`, locale);
  const katalog = await bestenlistenKatalog(type, locale);
  const sprache = sprachVon(locale);
  const de = sprache === 'de';
  const n = bed.namen;
  // Andere Sprachen: Anzeigenamen der Locale; der deutsche Pfad bleibt unveraendert.
  const lokal = {
    genre: n.genre ? genreAnzeige(n.genre, sprache) : null,
    anbieter: n.anbieter || null,
    land: n.landCode ? landAnzeige(n.landCode, sprache) : null,
    sprache: n.spracheCode ? sprachAnzeige(n.spracheCode, sprache) : null,
  };
  const ergebnis = {
    verwandt: verwandteListen(modus, wert, katalog, locale),
    type, modus, wert, gesamtGefunden: gesamt, titel: sortiert,
    ueberschrift: de ? listeTitel(type, modus, wert, n) : listeTitelLokal(sprache, type, modus, wert, lokal),
    genre: de ? (n.genre || null) : lokal.genre, genreSlug: n.genreSlug || null,
    anbieter: n.anbieter || null,
    land: de ? (n.landKurz || null) : lokal.land, landAus: de ? (n.land || null) : lokal.land, landSlug: n.landSlug || null,
    sprache: de ? (n.sprache || null) : lokal.sprache,
    text, indexierbar: sortiert.length > 0,
  };
  bestenlisteCache.set(cacheKey, { at: jetzt, wert: ergebnis });
  return ergebnis;
}

// Chips auf einer Liste: die naechstfeinere Kombination (Genre x Jahrzehnt,
// Genre x Anbieter), nur wo die Schwelle erreicht ist.
function verwandteListen(modus, wert, katalog, locale = 'de-de') {
  const sprache = sprachVon(locale);
  const T = seitenTexte(locale, regionFuerLocale(locale));
  const g = (name) => genreAnzeige(name, sprache);
  const gruppen = [];
  const add = (titel, links) => { if (links.length) gruppen.push({ titel, links }); };
  if (modus === 'land') {
    add(T.nachGenre, katalog.landGenre.filter((e) => e.land === wert)
      .map((e) => ({ label: g(e.genre), modus: 'land-genre', wert: `${wert}+${e.genreSlug}` })));
  } else if (modus === 'genre') {
    add(T.nachLand, katalog.landGenre.filter((e) => e.genreSlug === wert)
      .map((e) => ({ label: sprache === 'de' ? e.landName : landAnzeige(e.code, sprache), modus: 'land-genre', wert: `${e.land}+${wert}` })));
    add(T.nachJahrzehnt, katalog.genreJahrzehnt.filter((e) => e.slug === wert).sort((x, y) => x.jz - y.jz)
      .map((e) => ({ label: jahrzehntNameL(e.jz, sprache), modus: 'genre-jahrzehnt', wert: `${wert}+${e.jz}` })));
    add(T.verwNachAnbieter, katalog.genreAnbieter.filter((e) => e.slug === wert)
      .map((e) => ({ label: e.anbieterName, modus: 'genre-anbieter', wert: `${wert}+${e.anbieter}` })));
  } else if (modus === 'jahrzehnt') {
    add(T.nachGenre, katalog.genreJahrzehnt.filter((e) => String(e.jz) === wert)
      .map((e) => ({ label: g(e.genre), modus: 'genre-jahrzehnt', wert: `${e.slug}+${wert}` })));
  } else if (modus === 'anbieter') {
    add(T.nachGenre, katalog.genreAnbieter.filter((e) => e.anbieter === wert)
      .map((e) => ({ label: g(e.genre), modus: 'genre-anbieter', wert: `${e.slug}+${wert}` })));
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
  const [jz, anb, gj, ga, themen, kino, neu, laender, sprachen, landGenre, laufzeit, staffeln] = await Promise.all([
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
    q(`SELECT c AS code, count(*)::int AS n FROM ${TITEL_MIT_KENNUNG}, unnest(origin_country) c
        WHERE type = $1 GROUP BY 1 HAVING count(*) >= $2 ORDER BY n DESC, 1`, [type, MIN_TITEL]),
    q(`SELECT original_language AS code, count(*)::int AS n FROM ${TITEL_MIT_KENNUNG}
        WHERE type = $1 AND original_language IS NOT NULL GROUP BY 1 HAVING count(*) >= $2 ORDER BY n DESC, 1`, [type, MIN_TITEL]),
    q(`SELECT c AS code, g AS genre, count(*)::int AS n FROM ${TITEL_MIT_KENNUNG}, unnest(origin_country) c, unnest(genres) g
        WHERE type = $1 GROUP BY 1, 2 HAVING count(*) >= $2`, [type, MIN_TITEL_LAND_GENRE]),
    Promise.all(Object.entries(LAUFZEITEN).map(async ([slug, l]) => {
      const [r] = type === 'movie'
        ? await q(`SELECT count(*)::int AS n FROM ${TITEL_MIT_KENNUNG} WHERE type = 'movie' AND runtime >= $1 AND runtime <= COALESCE($2::int, 100000)`, [l.min, l.max])
        : [{ n: 0 }];
      return { slug, n: r.n };
    })),
    Promise.all(Object.entries(STAFFELN).map(async ([slug, st]) => {
      const [r] = type === 'series'
        ? await q(`SELECT count(*)::int AS n FROM ${TITEL_MIT_KENNUNG} WHERE type = 'series' AND seasons >= $1 AND seasons <= COALESCE($2::int, 100000)`, [st.min, st.max])
        : [{ n: 0 }];
      return { slug, n: r.n };
    })),
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
    laender: laender.filter((r) => landHatSeite(r.code)).map((r) => ({ code: r.code, slug: landSlug(r.code), name: landName(r.code) })),
    sprachen: sprachen.filter((r) => spracheHatSeite(r.code)).map((r) => ({ code: r.code, slug: sprachSlug(r.code), name: sprachName(r.code) })),
    landGenre: gEintraege(landGenre).filter((r) => landHatSeite(r.code))
      .map((r) => ({ genre: r.genre, genreSlug: slugify(r.genre), code: r.code, land: landSlug(r.code), landName: landName(r.code) })),
    laufzeit: laufzeit.filter((l) => l.n >= MIN_TITEL).map((l) => l.slug),
    staffeln: staffeln.filter((l) => l.n >= MIN_TITEL).map((l) => l.slug),
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
  // Orte in nicht-lateinischer Schrift ergeben einen leeren Slug (Link auf /kino/ selbst).
  const liste = rows.filter((r) => slugify(r.ort));
  staedteCache = { at: Date.now(), liste };
  return liste;
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
    topTitel(type).then((t) => titelNachId(t, locale)),
    alleGenres(type),
    ladeSeoText('hub', art, locale),
  ]);
  return { type, titel, genres, text, indexierbar: true };
}

// Einstiegsseite unter /<locale>/ -- verlinkt die sechs Bereichs-Hubs.
// robots.txt gibt /de-de/ ausdruecklich frei; ohne diese Route lief der Pfad
// bis 16.08.2026 in einen 404, Crawler landeten also auf einer Fehlerseite.
export async function ladeStartHub(locale) {
  const text = await ladeSeoText('hub', 'start', locale);
  return { text, indexierbar: true };
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
    region === 'DE' ? staedteListe() : [],
    ladeSeoText('hub', 'kino', locale),
  ]);
  const qualifiziert = staedte.filter((s) => s.anzahl >= MIN_KINOS_STADT).sort((a, b) => b.anzahl - a.anzahl);
  return {
    filme: await titelNachKennung(filme.map((f) => ({ tmdbId: f.tmdb_id, slug: slugify(f.title), title: f.title, year: f.year, genres: f.genres || [], posterPath: f.poster_path })), locale, 'movie'),
    staedte: qualifiziert.map((s) => ({ ort: s.ort, slug: slugify(s.ort) })),
    text, indexierbar: true,
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
    text, indexierbar: true,
  };
}

export async function ladeBestenlistenUebersicht(locale) {
  const [text, filme, serien] = await Promise.all([
    ladeSeoText('hub', 'bestenlisten', locale),
    bestenlistenKatalog('movie', locale), bestenlistenKatalog('series', locale),
  ]);
  return { text, indexierbar: true, katalog: { filme, serien } };
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
  return { type, art, jahre: jahre.map((r) => r.year), genres, katalog, text, indexierbar: true };
}

// Schauspieler-/Regisseur-Seiten (Phase 1b, PLAN-SEO.md 1.5/1.6). Redaktion
// (seo_content, bereich 'person', Schluessel '<rolle>:<tmdbPersonId>') wird
// hier geladen wie bei Titelseiten; solange keiner vorliegt, zeigt
// seoRender.js die rohe TMDB-Biografie.
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
  const [{ rows }, text, { rows: gleichnamig }, { rows: sprachen }] = await Promise.all([
    pool.query(
      `SELECT id, tmdb_id, type, title, year, poster_path FROM ${TITEL_MIT_KENNUNG}
        WHERE ${bedingung} ORDER BY ${NOTE_SQL} DESC LIMIT 24`,
      [person.name]
    ),
    ladeSeoText('person', `${rolle}:${tmdbPersonId}`, locale),
    pool.query(`SELECT count(*)::int AS n FROM personen_cache WHERE name = $1`, [person.name]),
    pool.query(`SELECT locale FROM seo_content WHERE bereich = 'person' AND schluessel = $1`, [`${rolle}:${tmdbPersonId}`]),
  ]);
  const filmografie = rows.map((r) => ({
    id: String(r.id), tmdbId: r.tmdb_id, type: r.type, slug: slugify(r.title), title: r.title, year: r.year, posterPath: r.poster_path,
  }));

  if (textLocale(locale) !== 'de-de' && !text) return null;

  return {
    tmdbPersonId, rolle, name: person.name, slug: slugify(person.name),
    biografie: person.biografie, fotoPfad: person.foto_pfad,
    geburtstag: geburtstagString(person.geburtstag),
    filmografie, text,
    textLocales: localesMitText(sprachen.map((r) => r.locale)), // fuer hreflang: Gegenstuecke mit uebersetztem Text
    // Gleichnamige Personen zeigen dieselbe (namensbasierte) Filmografie --
    // Dublette. Die bleibt ohne eigenen Text draussen.
    indexierbar: filmografie.length > 0 && (!!text || gleichnamig[0].n <= 1),
  };
}

// Namen, die in personen_cache genau einmal vorkommen, und die Personen mit
// Redaktionstext -- als CTE-Baustein. Korrelierte Unterabfragen je Person
// brauchten 30 s, so ~0,1 s.
const PERSONEN_CTES = `
  eindeutig AS (SELECT name FROM personen_cache GROUP BY name HAVING count(*) = 1),
  mit_text AS (SELECT split_part(schluessel, ':', 2)::int AS id FROM seo_content
                WHERE bereich = 'person' AND locale = $2 AND schluessel LIKE $1 || ':%')`;
// Nicht-de-Locales: Seite nur mit uebersetztem Text (sonst 404, siehe ladePersonSeite).
const personHatSeite = (locale) => (textLocale(locale) === 'de-de'
  ? `(pc.tmdb_person_id IN (SELECT id FROM mit_text) OR pc.name IN (SELECT name FROM eindeutig))`
  : `pc.tmdb_person_id IN (SELECT id FROM mit_text)`);

// Mindestmenge fuer eine indexierbare Personenseite: mindestens ein Titel im
// Katalog UND (Redaktionstext ODER eindeutiger Name). Dieselbe Regel steht in
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
  // Laeuft bei jedem Seitenaufruf -- daher nur ueber die wenigen Kandidaten,
  // nicht ueber die ganze Tabelle. rolle/locale bleiben fuer die Aufrufer.
  const mitText = textLocale(locale) !== 'de-de'
    ? ` AND pc.tmdb_person_id IN (SELECT split_part(schluessel, ':', 2)::int FROM seo_content
         WHERE bereich = 'person' AND locale = $2 AND schluessel LIKE $3 || ':%')`
    : '';
  const { rows } = await pool.query(
    `SELECT pc.name, pc.tmdb_person_id FROM personen_cache pc
      WHERE pc.name IN (SELECT name FROM personen_cache WHERE name = ANY($1::text[]) GROUP BY name HAVING count(*) = 1)${mitText}`,
    textLocale(locale) !== 'de-de' ? [eindeutig, textLocale(locale), rolle] : [eindeutig]
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
      WHERE pc.name IN (SELECT name FROM eindeutig) AND ${personHatSeite(locale)}
      ORDER BY z.anzahl DESC, pc.name
      LIMIT $3`,
    [rolle, textLocale(locale), HUB_PERSONEN]
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
  return { rolle, personen, text, indexierbar: personen.length > 0 };
}

// Alle Personen mit indexierbarer Seite (Regel wie ladePersonSeite): Text ODER
// eindeutiger Name, plus mindestens ein Katalog-Titel.
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
      WHERE ${personHatSeite(locale)}
      ORDER BY pc.tmdb_person_id`,
    [rolle, textLocale(locale)]
  );
  return rows.map((r) => ({ tmdbPersonId: r.tmdb_person_id, slug: slugify(r.name) }));
}

export async function ladeKinoStadt(stadtSlug, locale) {
  // Die Kinodatenbank (kinos) kennt nur deutsche Orte.
  if (regionFuerLocale(locale) !== 'DE') return null;
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
    filme: await titelNachKennung(filme.map((f) => ({
      tmdbId: f.tmdb_id, slug: slugify(f.title), title: f.title, year: f.year,
      genres: f.genres || [], posterPath: f.poster_path,
    })), locale, 'movie'),
    text, indexierbar: kinos.length > 0,
  };
}

// ---- Wochen-Seiten: "Neu auf <Anbieter>" und "Neu im Kino diese Woche".
// Zeitabhaengig, deshalb nichts in seo_content: Titel und Zahlen kommen bei
// jedem Cache-Aufbau (1 h) frisch aus streaming_cache/cinema_cache, die
// Einleitung wird in seoWochen.js daraus gebaut. Regeln (Fenster, Schwelle,
// Importtage) stehen dort.
const wochenCache = new Map();   // 'streaming:DE' | 'kino:DE' -> { at, daten }

async function gecacht(key, laden) {
  const g = wochenCache.get(key);
  if (g && Date.now() - g.at < BESTENLISTE_TTL_MS) return g.daten;
  const daten = await laden();
  wochenCache.set(key, { at: Date.now(), daten });
  return daten;
}

function wochenKarte(r, datum) {
  return {
    tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year,
    genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null,
    posterPath: r.poster_path, hatSeite: !!r.hat_seite, datum,
  };
}

// Alle Anbieter einer Region in EINER Abfrage (nur Zeilen der letzten 14 Tage
// kommen zurueck; die Fensterfunktionen zaehlen vorher ueber den ganzen
// Bestand, daran haengt die Importtag-Regel). Titel ohne eigene Titelseite
// bleiben drin (ohne Link), sie zaehlen fuer die Schwelle mit.
async function streamingWochen(region) {
  return gecacht(`streaming:${region}`, async () => {
    const [{ rows }, { rows: anbieter }] = await Promise.all([
      pool.query(
        `WITH basis AS (
           SELECT s.provider_id, s.type, s.tmdb_id, s.title, s.year, s.genres, s.poster_path, s.rating,
                  s.first_seen_at, ${NOTE_SQL} AS note,
                  count(*) OVER (PARTITION BY s.provider_id) AS gesamt,
                  count(*) OVER (PARTITION BY s.provider_id, (s.first_seen_at AT TIME ZONE 'Europe/Berlin')::date) AS am_tag
             FROM streaming_cache s WHERE s.region = $1)
         SELECT b.*, (titel.tmdb_id IS NOT NULL) AS hat_seite
           FROM basis b LEFT JOIN ${TITEL_MIT_KENNUNG} ON titel.type = b.type AND titel.tmdb_id = b.tmdb_id
          WHERE b.first_seen_at >= now() - make_interval(days => $2::int)
          ORDER BY b.note DESC, b.title`,
        [region, TAGE_LANG]
      ),
      pool.query(
        `SELECT provider_id, min(provider_name) AS name FROM streaming_cache WHERE region = $1 GROUP BY provider_id`,
        [region]
      ),
    ]);
    const jetzt = Date.now();
    const karten = new Map(anbieter.map((a) => [a.provider_id, []]));
    for (const r of rows) {
      if (istImportTag(Number(r.am_tag), Number(r.gesamt))) continue;
      karten.get(r.provider_id)?.push({ ...wochenKarte(r, r.first_seen_at), type: r.type });
    }
    const liste = anbieter.map((a) => {
      const f = streamingFenster(karten.get(a.provider_id), jetzt);
      return {
        slug: a.provider_id, name: a.name, tage: f.tage, indexierbar: f.indexierbar,
        filme: f.eintraege.filter((e) => e.type === 'movie'),
        serien: f.eintraege.filter((e) => e.type === 'series'),
      };
    }).sort((a, b) => (b.filme.length + b.serien.length) - (a.filme.length + a.serien.length));
    return { stand: heuteBerlin(jetzt), anbieter: liste };
  });
}

export async function ladeNeuAufUebersicht(locale) {
  const d = await streamingWochen(regionFuerLocale(locale));
  const anbieter = d.anbieter.filter((a) => a.indexierbar);
  return { stand: d.stand, anbieter, indexierbar: anbieter.length > 0 };
}

export async function ladeNeuAufAnbieter(anbieterSlug, locale) {
  const d = await streamingWochen(regionFuerLocale(locale));
  const a = d.anbieter.find((x) => x.slug === anbieterSlug);
  if (!a) return null;
  const andere = d.anbieter.filter((x) => x.indexierbar && x.slug !== anbieterSlug).map((x) => ({ slug: x.slug, name: x.name }));
  const [filme, serien] = await Promise.all([titelNachKennung(a.filme, locale, 'movie'), titelNachKennung(a.serien, locale, 'series')]);
  return { ...a, filme, serien, stand: d.stand, andere };
}

export async function ladeKinoNeustarts(locale) {
  const d = await kinoNeustartsBasis(locale);
  if (sprachVon(locale) === 'de') return d;
  const [gestartet, naechste] = await Promise.all([titelNachKennung(d.gestartet, locale, 'movie'), titelNachKennung(d.naechste, locale, 'movie')]);
  return { ...d, gestartet, naechste };
}

async function kinoNeustartsBasis(locale) {
  const region = regionFuerLocale(locale);
  return gecacht(`kino:${region}`, async () => {
    const { rows } = await pool.query(
      `SELECT c.tmdb_id, c.title, c.year, c.genres, c.poster_path, c.rating, c.vote_count,
              to_char(c.release_date, 'YYYY-MM-DD') AS start,
              EXISTS (SELECT 1 FROM ${TITEL_MIT_KENNUNG} WHERE titel.type = 'movie' AND titel.tmdb_id = c.tmdb_id) AS hat_seite
         FROM cinema_cache c
        WHERE c.region = $1 AND c.release_date BETWEEN (now() AT TIME ZONE 'Europe/Berlin')::date - 13
                                                    AND (now() AT TIME ZONE 'Europe/Berlin')::date + 7
        ORDER BY c.release_date DESC, COALESCE(c.vote_count, 0) DESC, c.title`,
      [region]
    );
    const heute = heuteBerlin();
    const f = kinoFenster(rows.map((r) => ({ ...wochenKarte(r, null), start: r.start })), heute);
    const staedte = (region !== 'DE' ? [] : await staedteListe()).filter((s) => s.anzahl >= MIN_KINOS_STADT)
      .sort((a, b) => b.anzahl - a.anzahl).slice(0, 12).map((s) => ({ ort: s.ort, slug: slugify(s.ort) }));
    return { stand: heute, tage: f.tage, gestartet: f.gestartet, naechste: f.naechste, staedte, indexierbar: f.indexierbar };
  });
}

// Sitemap: nur Wochen-Seiten, die index,follow tragen (kein noindex in der Sitemap).
export async function wochenSeitenFuerSitemap(locale) {
  const [uebersicht, kino] = await Promise.all([ladeNeuAufUebersicht(locale), ladeKinoNeustarts(locale)]);
  return {
    stand: uebersicht.stand,
    neuAuf: uebersicht.indexierbar,
    anbieter: uebersicht.anbieter.map((a) => a.slug),
    kinoNeustarts: kino.indexierbar,
  };
}

// ---- Sitemap (seoSitemap.js): alle Seiten, die es gibt -- nach denselben
// Regeln wie `indexierbar` oben, unabhaengig davon, ob schon ein Text existiert.

export async function titelFuerSitemap() {
  const { rows } = await pool.query(`SELECT type, tmdb_id, title FROM ${TITEL_MIT_KENNUNG}`);
  return rows;
}

// Genres mit mindestens einem Titel (ladeGenreSeite: gesamt > 0).
async function genresMitTiteln(type) {
  const [erlaubt, { rows }] = await Promise.all([
    alleGenres(type),
    pool.query(`SELECT DISTINCT unnest(genres) AS g FROM ${TITEL_MIT_KENNUNG} WHERE type = $1`, [type]),
  ]);
  const vorhanden = new Set(rows.map((r) => r.g));
  return [...new Set(erlaubt)].filter((g) => vorhanden.has(g));
}

export async function genresFuerSitemap() {
  const liste = [];
  for (const type of ['movie', 'series']) {
    for (const g of await genresMitTiteln(type)) liste.push({ type, slug: slugify(g) });
  }
  return liste;
}

export async function anbieterFuerSitemap(locale) {
  return [...await anbieterMitSeite(regionFuerLocale(locale))];
}

export async function staedteFuerSitemap() {
  return (await staedteListe()).filter((s) => s.anzahl >= MIN_KINOS_STADT).map((s) => slugify(s.ort));
}

// Alle Bestenlisten als [art, modus, wert] -- auch fuer scripts/seo-bestenlisten-texte.mjs.
export async function alleBestenlisten(locale) {
  const liste = [];
  for (const [art, type] of [['filme', 'movie'], ['serien', 'series']]) {
    const k = await bestenlistenKatalog(type, locale);
    const { rows: jahre } = await pool.query(
      `SELECT year FROM titles WHERE type = $1 AND year >= 1900 GROUP BY year HAVING count(*) >= $2 ORDER BY year`, [type, MIN_TITEL]);
    for (const j of jahre) liste.push([art, 'jahr', String(j.year)]);
    for (const g of await genresMitTiteln(type)) liste.push([art, 'genre', slugify(g)]);
    for (const a of k.anbieter) liste.push([art, 'anbieter', a.slug]);
    for (const j of k.jahrzehnte) liste.push([art, 'jahrzehnt', String(j)]);
    for (const t of k.themen) liste.push([art, 'thema', t]);
    for (const e of k.genreJahrzehnt) liste.push([art, 'genre-jahrzehnt', `${e.slug}+${e.jz}`]);
    for (const e of k.genreAnbieter) liste.push([art, 'genre-anbieter', `${e.slug}+${e.anbieter}`]);
    for (const e of k.laender) liste.push([art, 'land', e.slug]);
    for (const e of k.sprachen) liste.push([art, 'sprache', e.slug]);
    for (const e of k.landGenre) liste.push([art, 'land-genre', `${e.land}+${e.genreSlug}`]);
    for (const e of k.laufzeit) liste.push([art, 'laufzeit', e]);
    for (const e of k.staffeln) liste.push([art, 'staffeln', e]);
    if (k.kino) liste.push([art, 'kino', 'aktuell']);
    if (k.neu) liste.push([art, 'neu', 'aktuell']);
  }
  return liste;
}

// ---- Reihen/Franchises (TMDB-Collections), nur Filme.

const REIHEN_TTL_MS = 60 * 60 * 1000;
let reihenCache = null;   // { at, liste, nachSlug, nachId }

// Alle Reihen mit mindestens MIN_TITEL_REIHE Filmen, die eine Titelseite haben.
// Eine Abfrage fuer alle (Uebersicht, Reihenseite, Sitemap, Titelseiten-Block),
// deshalb prozessintern gecacht.
async function reihenKatalog() {
  if (reihenCache && Date.now() - reihenCache.at < REIHEN_TTL_MS) return reihenCache;
  const { rows } = await pool.query(
    `SELECT collection_id, collection_name, id, tmdb_id, title, year, erschienen_am::text AS erschienen_am,
            genres, rating, vote_count, poster_path, ${NOTE_SQL} AS note
       FROM ${TITEL_MIT_KENNUNG} WHERE type = 'movie' AND collection_id IS NOT NULL`
  );
  const gruppen = new Map();
  for (const r of rows) {
    if (!gruppen.has(r.collection_id)) gruppen.set(r.collection_id, { id: r.collection_id, roh: r.collection_name, titel: [] });
    gruppen.get(r.collection_id).titel.push({
      id: String(r.id), tmdbId: r.tmdb_id, slug: slugify(r.title), title: r.title, year: r.year,
      erschienenAm: r.erschienen_am, genres: r.genres || [], rating: r.rating != null ? Number(r.rating) : null,
      voteCount: r.vote_count, posterPath: r.poster_path, note: Number(r.note),
    });
  }
  const gueltig = [...gruppen.values()].filter((g) => g.titel.length >= MIN_TITEL_REIHE);
  const slugs = reihenSlugs(gueltig.map((g) => ({ id: g.id, name: g.roh })));
  const liste = gueltig.map((g) => {
    const titel = inErscheinungsreihenfolge(g.titel);
    return {
      id: g.id, slug: slugs.get(g.id), name: reihenName(g.roh), titel, fakten: reihenFakten(titel),
      stimmen: titel.reduce((s, t) => s + (t.voteCount || 0), 0),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  reihenCache = {
    at: Date.now(), liste,
    nachSlug: new Map(liste.map((r) => [r.slug, r])), nachId: new Map(liste.map((r) => [r.id, r])),
  };
  return reihenCache;
}

// Kleiner Verweis auf der Titelseite: null, wenn der Film in keiner (qualifizierenden) Reihe ist.
async function reiheFuerTitel(collectionId) {
  if (!collectionId) return null;
  const r = (await reihenKatalog()).nachId.get(collectionId);
  return r ? { slug: r.slug, name: r.name, anzahl: r.titel.length } : null;
}

export async function ladeReihenUebersicht(locale) {
  const [k, text] = await Promise.all([reihenKatalog(), ladeSeoText('hub', 'reihen', locale)]);
  const eintrag = (r) => ({
    slug: r.slug, name: r.name, anzahl: r.titel.length, jahrVon: r.fakten.jahrVon, jahrBis: r.fakten.jahrBis,
    posterPath: (r.titel.find((t) => t.posterPath) || {}).posterPath || null,
  });
  const beliebt = [...k.liste].sort((a, b) => b.stimmen - a.stimmen).slice(0, 12).map(eintrag);
  return { reihen: k.liste.map(eintrag), beliebt, text, indexierbar: k.liste.length > 0 };
}

export async function ladeReihe(slug, locale) {
  const r = (await reihenKatalog()).nachSlug.get(slug);
  if (!r) return null;
  const region = regionFuerLocale(locale);
  const [bewertungen, { rows: stream }, seiten, text] = await Promise.all([
    bewertungenFuer(r.titel.map((t) => t.id)),
    pool.query(
      `SELECT tmdb_id, flatrate FROM watch_providers_cache WHERE type = 'movie' AND region = $1 AND tmdb_id = ANY($2::int[])`,
      [region, r.titel.map((t) => t.tmdbId)]
    ),
    anbieterMitSeite(region),
    ladeSeoText('reihe', r.slug, locale),
  ]);
  const flatrate = new Map(stream.map((s) => [s.tmdb_id, s.flatrate || []]));
  const titel = await titelNachId(r.titel.map((t) => ({
    ...t,
    communityBewertung: bewertungen.get(t.id) || null,
    flatrate: (flatrate.get(t.tmdbId) || []).map((p) => {
      const as = anbieterSlug(p.name);
      return { name: p.name, anbieterSlug: seiten.has(as) ? as : null };
    }),
  })), locale);
  return { slug: r.slug, name: r.name, collectionId: r.id, titel, fakten: r.fakten, text, indexierbar: true };
}

// Nur fuer Tests: Cache verwerfen, damit frisch eingefuegte Testdaten sichtbar werden.
export function reihenCacheLeeren() { reihenCache = null; }

export async function reihenFuerSitemap() {
  return (await reihenKatalog()).liste.map((r) => r.slug);
}

// Fuer scripts/seo-reihen-texte.mjs: Name, Fakten und vorhandenen Text je Reihe.
export async function alleReihen(locale) {
  const k = await reihenKatalog();
  const { rows } = await pool.query(`SELECT schluessel FROM seo_content WHERE bereich = 'reihe' AND locale = $1`, [textLocale(locale)]);
  const mitText = new Set(rows.map((r) => r.schluessel));
  return k.liste.map((r) => ({ slug: r.slug, name: r.name, fakten: r.fakten, hatText: mitText.has(r.slug) }));
}
