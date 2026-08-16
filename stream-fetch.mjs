#!/usr/bin/env node
/*
 * stream-fetch.mjs – erzeugt streaming.json für die "Streaming"-Ansicht der App.
 *
 * Holt von TMDB (Daten via JustWatch) die aktuell im Abo (Flatrate) verfügbaren
 * Filme & Serien für EINE Region (TMDB_REGION, Default DE). WELCHE Anbieter das
 * sind, leitet der Lauf selbst aus dem Anbieterkatalog des Landes ab (siehe
 * anbieterDerRegion weiter unten) – früher waren es vier fest verdrahtete.
 * Geschrieben wird nach ./streaming.json – im gleichen Feld-Format wie
 * die Discovery-Kandidaten ({id,t,y,g,d,c,p,r}), plus "ov" (Kurzbeschreibung)
 * für die Detailansicht sowie "tEn"/"ovEn" (englische Fassung) und "certs"
 * (Altersfreigaben je Land, siehe TMDB_CERT_REGIONS).
 *
 * Für mehrere Länder läuft das Skript je Region einmal (TMDB_REGION=DE,
 * TMDB_REGION=AT, ...) – der Ingest im Backend verwaltet jede Region getrennt.
 * Die Titel-DETAILS (Besetzung, Regie, Freigaben, Übersetzungen) sind dabei
 * sprachneutral bzw. decken ohnehin alle Länder ab – nur die VERFÜGBARKEIT
 * (discover je Anbieter) ist regionsspezifisch. Deshalb fragt das Skript vor
 * dem Lauf per GET /api/streaming/enriched ab, welche tmdb_ids bereits frisch
 * (Default: 7 Tage) angereichert in der Datenbank liegen, und überspringt für
 * die den Detail-Abruf komplett (Markierung "ohneDetails" im Payload; der
 * Ingest lässt die Anreicherungsfelder dann unangetastet). Das drückt einen
 * Nicht-Erst-Regionen-Lauf von 57–87 Minuten auf gemessene ~8 Minuten
 * (AT, 21.986 Titel, 12. August 2026).
 *
 * Läuft NUR in der GitHub Action (oder lokal) – der API-Key kommt aus der
 * Umgebungsvariable TMDB_API_KEY (GitHub Secret) und landet NIE im Client-Code.
 *
 * Ist STREAMING_API_URL gesetzt, wird das Ergebnis zusätzlich per POST an den
 * eigenen Backend-Endpoint /api/streaming/ingest geschickt (Auth über
 * STREAMING_INGEST_SECRET) – das ist der Zielzustand nach dem Relaunch, damit
 * die Daten in Postgres statt in streaming.json landen. Ohne STREAMING_API_URL
 * verhält sich das Skript wie bisher (nur lokale Datei) – nützlich solange kein
 * Backend erreichbar ist.
 *
 * Aufruf:  TMDB_API_KEY=xxxx node stream-fetch.mjs
 * Node >= 18 (globales fetch).
 */

import { anbieterKatalog, anbieterSlug } from './backend/lib/anbieter.js';

const API = 'https://api.themoviedb.org/3';
const KEY = process.env.TMDB_API_KEY;
const REGION = process.env.TMDB_REGION || 'DE';
const LANG = process.env.TMDB_LANG || 'de-DE';
// Keine Mindest-Stimmenzahl mehr per Default: TMDB-Stimmenzahl und IMDb-
// Stimmenzahl sind zwei unabhaengige Zaehlungen -- gerade neuere oder nicht-
// englischsprachige Titel (z.B. "Unfamiliar", DE-Produktion) haben bei TMDB oft
// nur eine Handvoll Stimmen, obwohl sie bei IMDb laengst tausende haben und
// ganz reguplaer im Streaming-Angebot laufen. Verfuegbarkeit beim Anbieter ist
// hier schon das eigentliche Signal, die Bewertung zeigt sich trotzdem ganz
// normal in der App. Optional weiterhin per Env-Var einschraenkbar.
const MIN_VOTES = process.env.STREAM_MIN_VOTES ? parseInt(process.env.STREAM_MIN_VOTES, 10) : null;
// Keine Jahresuntergrenze mehr per Default (auch Klassiker wie "2001: Odyssee im
// Weltraum" (1968) sollen auftauchen) -- optional weiterhin per Env-Var einschraenkbar.
const MIN_YEAR = process.env.STREAM_MIN_YEAR ? parseInt(process.env.STREAM_MIN_YEAR, 10) : null;
const STREAMING_API_URL = process.env.STREAMING_API_URL || '';
const STREAMING_INGEST_SECRET = process.env.STREAMING_INGEST_SECRET || '';

// Skip-Liste: tmdb_ids, deren Details bereits frisch in der Datenbank liegen
// (siehe Kopf-Kommentar). Schluessel wie in discover(): 'movie' | 'tv' --
// das Backend nennt Serien 'series', hier heissen sie TMDB-konform 'tv'.
const frischAngereichert = { movie: new Set(), tv: new Set() };

async function ladeSkipListe() {
  if (!STREAMING_API_URL || !STREAMING_INGEST_SECRET) return;
  try {
    const res = await fetch(new URL('/api/streaming/enriched', STREAMING_API_URL), {
      headers: { Authorization: `Bearer ${STREAMING_INGEST_SECRET}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    for (const id of d.movie || []) frischAngereichert.movie.add(String(id));
    for (const id of d.series || []) frischAngereichert.tv.add(String(id));
    console.log(`Skip-Liste: ${frischAngereichert.movie.size} Filme und ${frischAngereichert.tv.size} Serien sind bereits frisch angereichert – für sie entfällt der Detail-Abruf.`);
  } catch (e) {
    // Fail-open: Ohne Skip-Liste wird einfach alles voll geholt -- langsamer,
    // aber korrekt (so lief es vor Einführung der Liste immer).
    console.warn(`WARN: Skip-Liste nicht abrufbar (${e.message}) – hole alle Details.`);
  }
}

/* Welche Anbieter dieser Lauf einliest -- je Region aus dem TMDB-Katalog
 * abgeleitet, nicht mehr fest verdrahtet.
 *
 * Bis zum 16. August 2026 standen hier vier feste Plattformen (Amazon,
 * Netflix, Disney+, Apple TV+). Nur die speisten streaming_cache -- und damit
 * den Listenfilter "Deine Streaming-Anbieter" und die Sortierung "Neu im
 * Streaming". Waehlbar waren in der Einstellung aber alle rund 200 Anbieter:
 * Wer WOW, RTL+ oder Globoplay anhakte, bekam dort schlicht nichts. Genau
 * diese Erwartungsluecke schliesst die Ableitung unten.
 *
 * Ausgewaehlt werden die prominentesten Anbieter DES LANDES (Reihenfolge aus
 * display_priorities[REGION], siehe backend/lib/anbieter.js) -- aber nur die,
 * die dort wirklich ein ABO fuehren. Diese Unterscheidung ist der heikle Teil:
 *
 *   `with_watch_monetization_types=flatrate` in /discover filtert NICHT
 *   anbietergenau. Es heisst "dieser Titel laeuft bei diesem Anbieter UND ist
 *   irgendwo im Abo zu haben" -- nicht "dieser Anbieter hat ihn im Abo". Am
 *   16. August 2026 nachgemessen: /discover/movie mit
 *   with_watch_providers=2 (Apple TV Store) und flatrate meldet 12.930
 *   Filme; von zehn Stichproben stand Apple TV Store bei ZEHN nur unter
 *   Leihen/Kaufen. Dasselbe bei Amazon Video, Rakuten TV, Sky Store und
 *   MagentaTV. Ungeprueft uebernommen behauptete die App also "im Abo bei
 *   Apple TV Store".
 *
 * Deshalb zwei Pruefungen je Kandidat, beide gemessen statt geraten:
 *
 *   1. Abo-Anteil: total_results MIT flatrate-Filter geteilt durch
 *      total_results OHNE. Ein echter Abo-Dienst liegt bei 1,00 (Netflix
 *      8.840/8.840, RTL+ 1.564/1.564, WOW, Sky Go, Crunchyroll, HBO Max,
 *      Globoplay ...), ein Shop bei 0,54-0,66 (Apple TV Store 0,542, Amazon
 *      Video 0,575, Google Play 0,579, YouTube 0,577, Sky Store 0,664),
 *      Werbe-/Gratisangebote noch tiefer (JustWatch TV 0,285, ARD Mediathek
 *      0,264). Die Luecke ist gross genug fuer eine Schwelle bei 0,95.
 *   2. Gegenprobe an echten Titeln: fuer eine Stichprobe wird
 *      /<art>/<id>/watch/providers geholt und geprueft, ob der Anbieter dort
 *      tatsaechlich unter `flatrate` steht. Erst das macht aus der Faustregel
 *      eine belegte Aussage -- und faellt auf, falls TMDB die Zaehlweise
 *      aendert.
 *
 * Mischformen (Joyn 0,63, MagentaTV 0,56, Claro video 0,46) fallen damit
 * heraus, obwohl es sie im Abo gibt: Bei ihnen laesst sich aus discover nicht
 * ablesen, WELCHE ihrer Titel zum Abo gehoeren und welche einzeln kosten.
 * Lieber ein Anbieter zu wenig als ein Schildchen, das nicht stimmt.
 *
 * Kanal-/Tarifvarianten ("HBO Max Amazon Channel", "Netflix Standard with
 * Ads") sind schon aus dem Katalog gefallen bzw. hier per `kanonisch`
 * ausgeschlossen -- sie sind derselbe Dienst unter fremder Abrechnung.
 */
const MAX_ANBIETER   = Number(process.env.STREAM_MAX_PROVIDER || 12);
// Unter so vielen Abo-Titeln lohnt ein Anbieter die Laufzeit nicht.
const MIN_TITEL      = Number(process.env.STREAM_MIN_TITEL || 50);
// Ab diesem Abo-Anteil gilt ein Anbieter als Abo-Anbieter (siehe oben).
const MIN_ABO_ANTEIL = Number(process.env.STREAM_ABO_ANTEIL || 0.95);
// So viele Titel je Kandidat gehen in die Gegenprobe.
const STICHPROBE     = Number(process.env.STREAM_STICHPROBE || 6);

/* Zusatzpakete und Tarifstufen mit EIGENEM Namen, die deshalb weder aus dem
 * Katalog fallen noch als Variante erkannt werden: die ueber Amazon/Apple/Roku
 * gebuchten Themenkanaele ("Amazon Arthaus Channel") und Kinderprofile
 * ("Netflix Kids"). Beide fuehren einen Ausschnitt eines Katalogs, den die App
 * ohnehin schon einliest -- sie wuerden einen der wenigen Plaetze belegen,
 * ohne einen einzigen neuen Titel zu zeigen. Im AT-Probelauf am 16. August
 * 2026 standen genau diese zwei auf Platz 7 und 12 und verdraengten damit
 * echte Dienste.
 *
 * Bewusst an den Markennamen gebunden und nicht an "Channel" allein: Es gibt
 * eigenstaendige Dienste, die so heissen (etwa "Hallmark Channel"). */
const KEIN_EIGENES_ABO = /^(?:Amazon|Apple TV|Roku)\b.*\bChannel$|\bKids$/i;

/* Tarifstufen desselben Dienstes: In den USA fuehrt TMDB "Paramount Plus
 * Premium" UND "Paramount Plus Essential" als eigene Anbieter mit eigener ID
 * -- zwei Plaetze fuer einen Dienst, dessen Katalog sich fast deckt.
 * stammName() schneidet EIN abschliessendes Stufenwort ab; zwei Kandidaten mit
 * gleichem Stamm gelten als derselbe Dienst, und der prominentere gewinnt.
 *
 * Bewusst nur EIN Wort und nur am Ende: "WOW Presents Plus" (ein voellig
 * anderer Dienst als "WOW") wird so zu "WOW Presents" und bleibt erhalten,
 * "YouTube Premium" zu "YouTube" -- und weil der Shop YouTube die
 * Abo-Pruefung ohnehin nicht besteht, bleibt auch der erhalten. */
const TARIFSTUFE = /\s+(?:Premium|Essential|Basic|Standard|Lite|Plus|Max)$/i;
function stammName(name) {
  return String(name).replace(TARIFSTUFE, '').trim().toLowerCase();
}

/* Fuer einzelne Regionen liefert TMDB ueberhaupt keinen Anbieterkatalog -- am
 * 16. August 2026 gilt das fuer Bulgarien (0 Eintraege bei /watch/providers,
 * sowohl movie als auch tv). Die Verfuegbarkeitsabfrage /discover funktioniert
 * dort aber sehr wohl (Netflix BG: 6.731 Filme). Bis zum regionalen Ausbau fiel
 * das nicht auf, weil die vier Plattformen samt Nummern fest verdrahtet waren.
 *
 * Damit solche Regionen nicht leer ausgehen, greift dann diese Liste --
 * dieselben vier Dienste wie zuvor, nur jetzt als Rueckfall statt als Regel.
 * Amazon steht mit beiden Nummern drin (je nach Land 9 oder 119); geprueft
 * wird ohnehin jede einzeln, und der Slug-Schutz weiter unten laesst nur eine
 * davon durch. */
const RUECKFALL_ANBIETER = [
  { id: 8,   name: 'Netflix' },
  { id: 9,   name: 'Amazon Prime Video' },
  { id: 119, name: 'Amazon Prime Video' },
  { id: 337, name: 'Disney Plus' },
  { id: 350, name: 'Apple TV' },
].map((p) => ({ ...p, slug: anbieterSlug(p.name), kanonisch: true, arten: ['movie', 'tv'] }));
// So viele Katalogplaetze werden dafuer ueberhaupt geprueft. Weiter hinten
// kommen nur noch Nischenangebote, und jede Pruefung kostet zwei Abrufe.
const KANDIDATEN     = Number(process.env.STREAM_KANDIDATEN || 40);
// Pause zwischen zwei discover-Seiten. Der Lauf besteht seit der Skip-Liste im
// Wesentlichen aus diesem Paging -- mit mehr Anbietern entscheidet dieser Wert
// ueber die Laufzeit. tmdb() faengt ein 429 ohnehin mit Wiederholung ab.
const SEITEN_PAUSE   = Number(process.env.TMDB_PAUSE_MS || 250);

if (!KEY) { console.error('FEHLER: TMDB_API_KEY ist nicht gesetzt.'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Zaehlt, wie oft TMDB gebremst hat -- am Ende eine Zeile im Log. Ohne die
// Zahl liesse sich nach einer Aenderung an SEITEN_PAUSE nicht beurteilen, ob
// das Tempo noch tragbar ist.
let rateLimitTreffer = 0;
// Laender, fuer die Altersfreigaben mitgenommen werden. Die TMDB-Antwort
// enthaelt ohnehin ALLE Laender -- weitere Regionen kosten hier also keinen
// einzigen zusaetzlichen Abruf (siehe PLAN-INTERNATIONALISIERUNG.md).
const CERT_REGIONS = (process.env.TMDB_CERT_REGIONS || 'DE,AT,CH,GB,FR,IT,ES,NL,PT,PL,DK,SE,NO,FI,BE,IE,CZ,GR,HU,RO,BG,HR,SI,SK,LT,LV,EE,LU,MT,CY,US,IS,LI,CA,AU,NZ,MX,AR,CL,CO,BR')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

// Altersfreigaben je Land aus dem ohnehin geholten Detail-Datensatz lesen.
// Filme fuehren sie unter release_dates (je Land mehrere Eintraege, oft mit
// leerem certification-Feld -- daher der erste nicht leere), Serien unter
// content_ratings. Ergebnis z.B. { DE: '12', AT: '14' }.
function zertifikate(detail, kind) {
  const certs = {};
  for (const region of CERT_REGIONS) {
    if (kind === 'movie') {
      const eintrag = ((detail.release_dates || {}).results || []).find((r) => r.iso_3166_1 === region);
      const wert = eintrag && (eintrag.release_dates || []).map((r) => r.certification).find((c) => c);
      if (wert) certs[region] = wert;
    } else {
      const eintrag = ((detail.content_ratings || {}).results || []).find((r) => r.iso_3166_1 === region);
      if (eintrag && eintrag.rating) certs[region] = eintrag.rating;
    }
  }
  return certs;
}

// Englischen Titel und englische Inhaltsangabe aus den mitgelieferten
// Uebersetzungen ziehen (append_to_response=translations). Bevorzugt en-US,
// sonst die erste englische Fassung mit Text.
// Weitere Inhaltssprachen aus denselben mitgelieferten Uebersetzungen
// (append_to_response=translations): je Sprache Titel + Inhaltsangabe,
// bevorzugt die Fassung des Hauptlandes (pt: Brasilien). Was TMDB nicht
// hat, fehlt einfach im Ergebnis -- leere Fassungen entstehen nicht.
const INHALTS_SPRACHEN = [['fr', 'FR'], ['es', 'ES'], ['it', 'IT'], ['nl', 'NL'], ['pt', 'BR']];
function uebersetzungenAus(detail, kind) {
  const alle = ((detail.translations || {}).translations || []);
  const aus = {};
  for (const [sprache, hauptland] of INHALTS_SPRACHEN) {
    const kandidaten = alle.filter((u) => u.iso_639_1 === sprache && u.data
      && (u.data.overview || u.data.title || u.data.name));
    const beste = kandidaten.find((u) => u.iso_3166_1 === hauptland) || kandidaten[0];
    if (!beste) continue;
    const t = ((kind === 'movie' ? beste.data.title : beste.data.name) || '').trim();
    const ov = (beste.data.overview || '').trim();
    if (!t && !ov) continue;
    aus[sprache] = {};
    if (t) aus[sprache].t = t;
    if (ov) aus[sprache].ov = ov;
  }
  return aus;
}

function englischAus(detail, kind) {
  const alle = ((detail.translations || {}).translations || [])
    .filter((t) => t.iso_639_1 === 'en' && t.data);
  const beste = alle.find((t) => t.iso_3166_1 === 'US' && (t.data.overview || t.data.title || t.data.name))
    || alle.find((t) => t.data.overview || t.data.title || t.data.name);
  if (!beste) return { titel: '', ov: '' };
  return {
    titel: ((kind === 'movie' ? beste.data.title : beste.data.name) || '').trim(),
    ov: (beste.data.overview || '').trim(),
  };
}


async function tmdb(path, params = {}) {
  const u = new URL(API + path);
  u.searchParams.set('api_key', KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(u);
    if (res.status === 429) { rateLimitTreffer++; await sleep(2000 + attempt * 1000); continue; }
    if (!res.ok) throw new Error(`TMDB ${res.status} für ${path}`);
    return res.json();
  }
  throw new Error('TMDB Rate-Limit für ' + path);
}

// Besetzung (≤4) und Regie/Erfinder je Titel – ein Extra-Request mit append_to_response,
// Ergebnisse werden gecacht, damit auf mehreren Plattformen gelistete Titel nur einmal abgefragt werden.
const enrichCache = new Map();
async function enrich(kind, id) {
  const ck = kind + ':' + id;
  if (enrichCache.has(ck)) return enrichCache.get(ck);
  const result = { cast: [], dir: '', fsk: null, certs: {}, tEn: '', ovEn: '' };
  try {
    const d = await tmdb(`/${kind}/${id}`, { language: LANG,
      // release_dates/content_ratings und translations haengen sich an den
      // ohnehin noetigen Detailaufruf an -- kein zusaetzlicher Abruf.
      append_to_response: kind === 'movie' ? 'credits,release_dates,translations' : 'credits,content_ratings,translations' });
    const cr = d.credits || {};
    result.cast = (cr.cast || []).slice(0, 4).map(p => p.name).filter(Boolean);
    if (kind === 'movie') {
      const dd = (cr.crew || []).find(p => p.job === 'Director');
      result.dir = dd ? dd.name : '';
    } else {
      result.dir = (d.created_by || []).map(p => p.name).filter(Boolean).join(', ');
    }
    result.certs = zertifikate(d, kind);
    result.fsk = result.certs.DE || null;
    const en = englischAus(d, kind);
    // Der Originaltitel ist bei englischsprachigen Produktionen bereits die
    // englische Fassung -- die Uebersetzungstabelle laesst title dort oft leer.
    result.tEn = en.titel || ((d.original_language === 'en' && (kind === 'movie' ? d.original_title : d.original_name)) || '');
    result.ovEn = en.ov;
    result.uebers = uebersetzungenAus(d, kind);
  } catch (e) { /* Titel ohne Credits: Felder bleiben leer */ }
  enrichCache.set(ck, result);
  return result;
}

// TMDB liefert bei language=de-DE ein LEERES overview, wenn es zum Titel keine
// deutsche Uebersetzung gibt -- auch dann, wenn eine englische existiert. Kleine,
// neue und internationale Titel trifft das regelmaessig (z.B. "INK"), in der App
// blieb die Kurzbeschreibung dann komplett leer. Fuer genau diese Luecken wird
// hier der englische Text nachgeholt.
//
// Der Zusatzabruf entsteht nur fuer betroffene Titel, nicht fuer den ganzen
// Katalog. Ueberschrieben wird dadurch nichts: Taucht spaeter doch eine deutsche
// Fassung bei TMDB auf, liefert der naechste Lauf sie oben schon mit, und der
// Ingest bevorzugt jeden nicht-leeren neuen Wert (siehe die COALESCE/NULLIF-
// Regel in backend/routes/streaming.js).
const ovFallbackCache = new Map();
async function overviewFallback(kind, id) {
  const ck = kind + ':' + id;
  if (ovFallbackCache.has(ck)) return ovFallbackCache.get(ck);
  let text = '';
  try {
    const d = await tmdb(`/${kind}/${id}`, { language: 'en-US' });
    text = (d.overview || '').trim();
  } catch (e) { /* auch ohne englischen Text bleibt der Titel nutzbar */ }
  ovFallbackCache.set(ck, text);
  return text;
}

async function genreMap(kind) {              // kind: 'movie' | 'tv'
  const d = await tmdb(`/genre/${kind}/list`, { language: LANG });
  const m = {}; (d.genres || []).forEach(g => m[g.id] = g.name); return m;
}

// Deutsch-Englisch-Paarung der Genres, direkt von TMDB: Dieselbe Liste, einmal
// mit language=de-DE und einmal mit en-US, verbunden ueber die Genre-ID.
//
// Damit muss niemand von Hand pflegen, dass "Comedy" auf "Komödie" zeigt -- und
// die Zuordnung bleibt richtig, wenn TMDB umbenennt oder ein Genre ergaenzt.
// Vorher fand eine Suche nach "Comedy" nur eine Handvoll Titel, die den
// englischen Begriff zufaellig als Schlagwort trugen, statt der 13.162 Komoedien.
async function genrePaare() {
  const paare = [];
  for (const kind of ['movie', 'tv']) {
    const [de, en] = await Promise.all([
      tmdb(`/genre/${kind}/list`, { language: 'de-DE' }),
      tmdb(`/genre/${kind}/list`, { language: 'en-US' }),
    ]);
    const enNach = {};
    (en.genres || []).forEach(g => enNach[g.id] = g.name);
    (de.genres || []).forEach(g => {
      if (!enNach[g.id]) return;
      paare.push({ id: g.id, art: kind, de: g.name, en: enNach[g.id] });
    });
    await sleep(200);
  }
  return paare;
}

/* Fuehrt dieser Anbieter in DIESER Region ein Abo -- und wie gross ist es?
   Die beiden Pruefungen sind im Kopf-Kommentar bei MAX_ANBIETER begruendet.
   Liefert {ok, filme, serien, anteil, gegenprobe} zurueck. */
async function aboAngebotPruefen(p) {
  const umfang = { movie: 0, tv: 0 };
  let flat = 0, gesamt = 0;
  const proben = [];
  for (const kind of ['movie', 'tv']) {
    if (!p.arten.includes(kind)) continue;
    const basis = {
      language: LANG, watch_region: REGION,
      with_watch_providers: p.id, include_adult: 'false', page: 1,
    };
    const mitAbo = await tmdb(`/discover/${kind}`, { ...basis, with_watch_monetization_types: 'flatrate' });
    const ohne   = await tmdb(`/discover/${kind}`, basis);
    umfang[kind] = mitAbo.total_results || 0;
    flat   += mitAbo.total_results || 0;
    gesamt += ohne.total_results || 0;
    for (const t of (mitAbo.results || []).slice(0, STICHPROBE)) proben.push([kind, t.id]);
  }
  const anteil = gesamt ? flat / gesamt : 0;
  const ergebnis = { filme: umfang.movie, serien: umfang.tv, anteil, gegenprobe: null };
  if (flat < MIN_TITEL) return { ...ergebnis, ok: false, grund: `nur ${flat} Abo-Titel` };
  if (anteil < MIN_ABO_ANTEIL) {
    return { ...ergebnis, ok: false, grund: `Abo-Anteil ${(anteil * 100).toFixed(0)} %` };
  }

  // Gegenprobe: steht der Anbieter bei echten Titeln wirklich unter `flatrate`?
  // Bewusst durchmischt (je Art die vordersten), damit nicht eine einzelne
  // Sortierlaune der Discover-Antwort das Ergebnis traegt.
  const stichprobe = proben.slice(0, STICHPROBE);
  let treffer = 0;
  for (const [kind, id] of stichprobe) {
    try {
      const w = await tmdb(`/${kind}/${id}/watch/providers`);
      const r = (w.results || {})[REGION] || {};
      if ((r.flatrate || []).some((x) => x.provider_id === p.id)) treffer++;
    } catch (e) { /* einzelner Ausfall soll den Kandidaten nicht kippen */ }
  }
  ergebnis.gegenprobe = `${treffer}/${stichprobe.length}`;
  if (treffer * 2 < stichprobe.length) {
    return { ...ergebnis, ok: false, grund: `Gegenprobe ${ergebnis.gegenprobe} im Abo` };
  }
  return { ...ergebnis, ok: true };
}

// Siehe Kopf-Kommentar bei MAX_ANBIETER: die prominentesten Abo-Anbieter des
// Landes, gemessen statt geraten.
async function anbieterDerRegion() {
  const katalog = await anbieterKatalog(REGION);
  if (!katalog.length) {
    console.warn(`WARN: TMDB kennt fuer ${REGION} keinen Anbieterkatalog -- Rueckfall auf die vier grossen Dienste.`);
  }
  // `kanonisch` haelt Kanal-Varianten draussen, deren Basisname sonst nirgends
  // vorkommt ("RTL+ Max Amazon Channel" -> Basis "RTL+ Max").
  const kandidaten = (katalog.length ? katalog : RUECKFALL_ANBIETER)
    .filter((p) => p.kanonisch && !KEIN_EIGENES_ABO.test(p.name))
    .slice(0, KANDIDATEN);

  const gewaehlt = [];
  const verworfen = [];
  const staemme = new Set();
  const slugs = new Set();
  for (const p of kandidaten) {
    if (gewaehlt.length >= MAX_ANBIETER) break;
    const stamm = stammName(p.name);
    // Zwei Eintraege mit demselben Slug wuerden im Ingest auf dieselben Zeilen
    // schreiben (provider_id ist Teil des Primaerschluessels) -- der zweite
    // ueberschriebe den ersten zur Haelfte.
    if (slugs.has(p.slug)) { verworfen.push(`${p.name} (Slug ${p.slug} schon vergeben)`); continue; }
    if (staemme.has(stamm)) { verworfen.push(`${p.name} (Tarifstufe)`); continue; }
    const pruefung = await aboAngebotPruefen(p);
    await sleep(SEITEN_PAUSE);
    if (!pruefung.ok) { verworfen.push(`${p.name} (${pruefung.grund})`); continue; }
    staemme.add(stamm);
    slugs.add(p.slug);
    gewaehlt.push({
      id: p.slug, name: p.name, tmdbId: p.id,
      filme: pruefung.filme, serien: pruefung.serien, gegenprobe: pruefung.gegenprobe,
    });
  }

  // Ein plausibler Lauf findet mindestens die grossen Vier. Weniger heisst:
  // TMDB hat gerade eine kaputte Antwort geliefert. Dann lieber hier
  // abbrechen, als dem Ingest eine duenne Lieferung zu schicken -- der wuerde
  // sie zwar zurueckweisen (Mindestanteil), aber die Ursache staende nirgends.
  if (gewaehlt.length < 3) {
    throw new Error(`Nur ${gewaehlt.length} Abo-Anbieter fuer ${REGION} ermittelt -- Abbruch.`);
  }

  console.log(`Anbieter fuer ${REGION} (${gewaehlt.length} von ${kandidaten.length} geprueften):`);
  for (const a of gewaehlt) {
    console.log(`   ${a.name} [${a.id}] TMDB ${a.tmdbId} -- ${a.filme} Filme, ${a.serien} Serien im Abo (Gegenprobe ${a.gegenprobe})`);
  }
  if (verworfen.length) console.log(`   kein Abo-Anbieter: ${verworfen.join(', ')}`);
  return gewaehlt;
}

async function discover(kind, providerId, gmap) {
  const dateField = kind === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
  const out = [];
  const seen = new Set();
  let page = 1;
  let totalPages = 1;
  do {
    const params = {
      language: LANG,
      watch_region: REGION,
      with_watch_providers: providerId,
      with_watch_monetization_types: 'flatrate',
      sort_by: 'vote_average.desc',
      include_adult: 'false',
      page,
    };
    if (MIN_VOTES) params['vote_count.gte'] = MIN_VOTES;
    if (MIN_YEAR) params[dateField] = `${MIN_YEAR}-01-01`;
    const d = await tmdb(`/discover/${kind}`, params);
    totalPages = Math.min(d.total_pages || 1, 500); // TMDB-Limit: max. 500 Seiten je Query
    for (const it of (d.results || [])) {
      if (seen.has(it.id)) continue; seen.add(it.id);
      const dateStr = kind === 'movie' ? it.release_date : it.first_air_date;
      const year = dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
      out.push({
        id: String(it.id),
        t: kind === 'movie' ? it.title : it.name,
        y: year,
        g: (it.genre_ids || []).map(id => gmap[id]).filter(Boolean),
        d: '',                                    // Regie/Erfinder – unten via enrich() nachgeladen
        c: [],                                    // Besetzung – unten via enrich() nachgeladen
        p: it.poster_path || null,
        r: it.vote_average != null ? Math.round(it.vote_average * 10) / 10 : null,
        vc: it.vote_count != null ? it.vote_count : null,
        ov: (it.overview || '').trim(),            // Kurzbeschreibung/Plot für die Detailansicht
      });
    }
    page++;
    await sleep(SEITEN_PAUSE);
  } while (page <= totalPages);
  let uebersprungen = 0;
  for (const item of out) {
    if (frischAngereichert[kind].has(item.id)) {
      // Details liegen frisch in der DB: nur die Verfuegbarkeits-Zeile
      // schicken. Der Ingest laesst die Anreicherungsfelder dieser Titel
      // unangetastet (und kopiert sie fuer hier neu aufgetauchte Zeilen aus
      // Geschwisterzeilen anderer Regionen/Anbieter). Kein sleep: es gab ja
      // auch keinen TMDB-Abruf.
      item.ohneDetails = true;
      uebersprungen++;
      continue;
    }
    const ex = await enrich(kind, item.id);
    item.c = ex.cast;
    item.d = ex.dir;
    item.fsk = ex.fsk;
    item.certs = ex.certs;
    item.tEn = ex.tEn;
    item.ovEn = ex.ovEn;
    item.uebers = ex.uebers || {};
    if (!item.ov) {
      // Der englische Text steckt meist schon in den Uebersetzungen von
      // enrich() -- nur wenn auch der fehlt, lohnt der Extra-Abruf.
      item.ov = ex.ovEn || await overviewFallback(kind, item.id);
      if (!ex.ovEn) await sleep(120);
    }
    await sleep(120);            // sanftes Tempo gegen das Rate-Limit
  }
  if (uebersprungen) {
    console.log(`   ${uebersprungen} von ${out.length} Titeln ohne Detail-Abruf (bereits frisch angereichert).`);
  }
  return out;
}

async function main() {
  const begonnen = Date.now();
  await ladeSkipListe();
  const [movieGenres, tvGenres, gewaehlt] = await Promise.all([
    genreMap('movie'), genreMap('tv'), anbieterDerRegion(),
  ]);

  const providers = [];
  for (const w of gewaehlt) {
    console.log(`→ ${w.name}  (TMDB ${w.tmdbId})`);
    const f = w.filme  ? await discover('movie', w.tmdbId, movieGenres) : [];
    const s = w.serien ? await discover('tv', w.tmdbId, tvGenres) : [];
    // id ist der Slug -- an ihm haengen streaming_cache.provider_id und die
    // SEO-Seiten. tmdbId daneben, weil dieselbe Marke je Land verschiedene
    // TMDB-Nummern hat (Amazon Prime Video: 9 in DE/AT/GB/US, sonst 119).
    providers.push({ id: w.id, name: w.name, tmdbId: w.tmdbId, f, s });
    await sleep(300);
  }

  const genres = await genrePaare();
  console.log(`Genre-Paarung: ${genres.length} Eintraege (deutsch/englisch).`);

  const doc = { generated: new Date().toISOString(), region: REGION, providers, genres };
  const { writeFileSync } = await import('node:fs');
  writeFileSync('streaming.json', JSON.stringify(doc));
  const tot = providers.reduce((a, p) => a + p.f.length + p.s.length, 0);
  const eindeutig = new Set(providers.flatMap((p) =>
    [...p.f.map((c) => 'm' + c.id), ...p.s.map((c) => 's' + c.id)])).size;
  console.log(`streaming.json geschrieben: ${providers.length} Plattformen, ${tot} Anbieter-Zeilen, ${eindeutig} verschiedene Titel.`);
  console.log(`Laufzeit ${Math.round((Date.now() - begonnen) / 1000)} s, ${rateLimitTreffer} Rate-Limit-Bremsungen (Seitenpause ${SEITEN_PAUSE} ms).`);

  if (STREAMING_API_URL) {
    if (!STREAMING_INGEST_SECRET) {
      console.error('FEHLER: STREAMING_API_URL gesetzt, aber STREAMING_INGEST_SECRET fehlt.');
      process.exit(1);
    }
    const res = await fetch(new URL('/api/streaming/ingest', STREAMING_API_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${STREAMING_INGEST_SECRET}`,
      },
      body: JSON.stringify(doc),
    });
    if (!res.ok) {
      throw new Error(`Ingest-API ${res.status}: ${await res.text()}`);
    }
    console.log(`An Backend übertragen: ${STREAMING_API_URL}`);
  }
}

// Nur beim direkten Aufruf loslaufen. So laesst sich die Anbieter-Ableitung
// (der einzige Teil mit einer echten Entscheidung darin) einzeln nachrechnen,
// ohne einen kompletten Import auszuloesen -- genau das wurde vor der
// Umstellung fuer alle 41 Regionen gemacht.
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  main().catch(e => { console.error(e); process.exit(1); });
}

export { anbieterDerRegion };
