// Verzeichnis der SEO-Seitenarten: einzige Beschreibung, was es unter /<locale>/... gibt
// (Routen, Pfadwoerter, Sprachen, Cluster/hreflang, Sitemap, Analytics-Typ). Router-Pruefung,
// Cluster, Sprachumschalter, Sitemap und Konsistenztest leiten sich daraus ab.
// Rein: importiert nur seoLocale.js (und nur zur Laufzeit, nicht beim Laden -- seoLocale.js
// importiert dieses Verzeichnis ebenfalls). Die Datenfunktionen haengt seoSeitenartenDaten.js an.
import { LOCALE_KONFIG, SEO_LOCALES, PERSONEN_LOCALES, textLocale, localeIndexierbar, localesMitText } from './seoLocale.js';
import { slugifyName } from './slug.js';

// Pfadwoerter je Sprache (erstes Segment hinter dem Locale); intern und in de-de deutsch.
const SPRACHEN = ['en', 'fr', 'es', 'it', 'nl', 'pt'];
const wort = (...w) => Object.fromEntries(SPRACHEN.map((s, i) => [s, w[i]]));
export const PFADWOERTER = {
  film: wort('movie', 'film', 'pelicula', 'film', 'film', 'filme'),
  serie: wort('tv-show', 'serie', 'serie', 'serie-tv', 'serie', 'serie'),
  filme: wort('movies', 'films', 'peliculas', 'i-film', 'films', 'filmes'),
  serien: wort('tv-shows', 'series', 'series', 'le-serie-tv', 'series', 'series'),
  streaming: wort('streaming', 'streaming', 'streaming', 'streaming', 'streaming', 'streaming'),
  bestenlisten: wort('rankings', 'classements', 'rankings', 'classifiche', 'ranglijsten', 'rankings'),
  'beste-filme': wort('best-movies', 'meilleurs-films', 'mejores-peliculas', 'migliori-film', 'beste-films', 'melhores-filmes'),
  'beste-serien': wort('best-tv-shows', 'meilleures-series', 'mejores-series', 'migliori-serie-tv', 'beste-series', 'melhores-series'),
  kino: wort('cinema', 'cinema', 'cine', 'cinema', 'bioscoop', 'cinema'),
  'neu-auf': wort('new-on', 'nouveautes-sur', 'novedades-en', 'novita-su', 'nieuw-op', 'novidades-no'),
  reihen: wort('collections', 'sagas', 'sagas', 'saghe', 'filmreeksen', 'colecoes'),
  regisseur: wort('directors', 'realisateurs', 'directores', 'registi', 'regisseurs', 'realizadores'),
  schauspieler: wort('actors', 'acteurs', 'actores', 'attori', 'acteurs', 'atores'),
};
// Zweites Segment, nur hinter kino: /<locale>/kino/neustarts -> .../cinema/new-releases.
export const UNTERWOERTER = {
  kino: { neustarts: wort('new-releases', 'nouveautes', 'estrenos', 'nuove-uscite', 'nieuwe-films', 'estreias') },
};

// Reihenfolge = Registrierungsreihenfolge in routes/seo.js (kino/neustarts vor kino/:stadtSlug,
// Sitemap und /international vor /:locale). Felder:
//  namen        logische Namen, nach denen hatSeitenart() fragt (Pfadwort oder Renderer-Name)
//  routen       Express-Pfade (intern, deutsch)
//  sprachen     'alle' lokalisierten Locales | 'personen' (PERSONEN_LOCALES) | 'de' nur deutsche Texte
//  bezug        'sprache' | 'region' | 'gemischt' (Bestenlisten: Anbieter/Kino regional)
//  hreflang     'cluster' gleiche Adresse in allen Locales | 'eigen' Seite liefert Liste | 'selbst'
//  cluster      { tiefe, name } Form des Cluster-Pfads; name null = das erste Segment
//  gegenstueck  Flagge: 'partner' (hreflang) | 'gleicherPfad' (Region-Hub) | 'start'
//  indexierbar  'immer' | 'seite' (je Seite, lade*-Funktion) | Schluessel in seoSeitenartenDaten.js
//  sitemap      { bereich, bereichName?, nurRegion?, ungeprueft?, pfade?, woche? } (siehe seoSitemap.js)
//  analytics    [{ praefix, typ }] -- Analytics-Typ; sonst das erste Segment
export const SEITENARTEN = [
  { id: 'titel', namen: ['titel'], routen: ['/:locale/film/:slugId', '/:locale/serie/:slugId'], sprachen: 'alle',
    bezug: 'sprache', hreflang: 'eigen', gegenstueck: 'start', indexierbar: 'seite',
    sitemap: { bereich: 'titel', bereichName: 'titel' } },
  { id: 'filme-serien-hub', namen: ['filme', 'serien', 'hub'], routen: ['/:locale/filme', '/:locale/serien'], sprachen: 'alle',
    bezug: 'sprache', hreflang: 'cluster', cluster: { tiefe: 1, name: null }, gegenstueck: 'partner', indexierbar: 'immer',
    sitemap: { bereich: 'hub', pfade: [{ pfad: 'filme', rang: 2 }, { pfad: 'serien', rang: 3 }] } },
  { id: 'personen-hub', namen: ['schauspieler', 'regisseur'], routen: ['/:locale/schauspieler', '/:locale/regisseur'], sprachen: 'personen',
    bezug: 'sprache', hreflang: 'selbst', gegenstueck: 'start', indexierbar: 'personenHub',
    sitemap: { bereich: 'hub', pfade: [{ pfad: 'schauspieler', rang: 10, indexierbar: 'personenHub' }, { pfad: 'regisseur', rang: 11, indexierbar: 'personenHub' }] } },
  { id: 'genre', namen: ['genre'], routen: ['/:locale/filme/:genreSlug', '/:locale/serien/:genreSlug'], sprachen: 'alle',
    bezug: 'sprache', hreflang: 'cluster', cluster: { tiefe: 2, name: 'genre', erste: ['filme', 'serien'] }, gegenstueck: 'partner', indexierbar: 'seite',
    sitemap: { bereich: 'genre', bereichName: 'genre' } },
  { id: 'streaming-hub', namen: ['streaming'], routen: ['/:locale/streaming'], sprachen: 'alle',
    bezug: 'region', hreflang: 'selbst', gegenstueck: 'gleicherPfad', indexierbar: 'streamingHub',
    sitemap: { bereich: 'hub', pfade: [{ pfad: 'streaming', rang: 5, indexierbar: 'streamingHub' }] } },
  { id: 'anbieter', namen: ['anbieter'], routen: ['/:locale/streaming/:anbieterSlug'], sprachen: 'alle',
    bezug: 'region', hreflang: 'selbst', gegenstueck: 'start', indexierbar: 'seite',
    sitemap: { bereich: 'anbieter', bereichName: 'anbieter' } },
  { id: 'bestenlisten-uebersicht', namen: ['bestenlisten'], routen: ['/:locale/bestenlisten'], sprachen: 'alle',
    bezug: 'sprache', hreflang: 'cluster', cluster: { tiefe: 1, name: null }, gegenstueck: 'partner', indexierbar: 'immer',
    sitemap: { bereich: 'hub', pfade: [{ pfad: 'bestenlisten', rang: 6 }] } },
  { id: 'reihen-uebersicht', namen: ['reihen'], routen: ['/:locale/reihen'], sprachen: 'alle',
    bezug: 'sprache', hreflang: 'cluster', cluster: { tiefe: 1, name: null }, gegenstueck: 'partner', indexierbar: 'reihen',
    sitemap: { bereich: 'hub', pfade: [{ pfad: 'reihen', rang: 7, indexierbar: 'reihen' }] } },
  { id: 'reihe', namen: ['reihe'], routen: ['/:locale/reihen/:slug'], sprachen: 'alle',
    bezug: 'sprache', hreflang: 'cluster', cluster: { tiefe: 2, name: 'reihe', erste: ['reihen'] }, gegenstueck: 'partner', indexierbar: 'seite',
    sitemap: { bereich: 'reihe', bereichName: 'reihe' }, analytics: [{ praefix: ['reihen', '*'], typ: 'reihe' }] },
  { id: 'beste-hub', namen: ['beste-filme', 'beste-serien'], routen: ['/:locale/beste-filme', '/:locale/beste-serien'], sprachen: 'alle',
    bezug: 'sprache', hreflang: 'cluster', cluster: { tiefe: 1, name: null }, gegenstueck: 'partner', indexierbar: 'immer',
    sitemap: { bereich: 'hub', pfade: [{ pfad: 'beste-filme', rang: 8 }, { pfad: 'beste-serien', rang: 9 }] } },
  { id: 'bestenliste', namen: [], routen: [
    '/:locale/beste-filme/:a', '/:locale/beste-filme/:a/:b', '/:locale/beste-filme/:a/:b/:c/:d',
    '/:locale/beste-serien/:a', '/:locale/beste-serien/:a/:b', '/:locale/beste-serien/:a/:b/:c/:d'], sprachen: 'alle',
    bezug: 'gemischt', hreflang: 'selbst', gegenstueck: 'start', indexierbar: 'seite',
    sitemap: { bereich: 'bestenliste', bereichName: 'beste-filme' }, analytics: [{ praefix: ['beste-filme'], typ: 'liste' }, { praefix: ['beste-serien'], typ: 'liste' }] },
  { id: 'kino-hub', namen: ['kino'], routen: ['/:locale/kino'], sprachen: 'alle',
    bezug: 'region', hreflang: 'selbst', gegenstueck: 'gleicherPfad', indexierbar: 'kinoHub',
    sitemap: { bereich: 'hub', pfade: [{ pfad: 'kino', rang: 4, indexierbar: 'kinoHub' }] } },
  { id: 'kino-neustarts', namen: [], routen: ['/:locale/kino/neustarts'], sprachen: 'alle',
    bezug: 'region', hreflang: 'selbst', gegenstueck: 'start', indexierbar: 'kinoNeustarts',
    sitemap: { bereich: 'hub', woche: { rang: 3, name: 'kino', pfad: 'kino/neustarts', schluessel: 'kinoNeustarts' } },
    analytics: [{ praefix: ['kino', 'neustarts'], typ: 'kino-neustarts' }] },
  { id: 'neu-auf', namen: ['neu-auf'], routen: ['/:locale/neu-auf'], sprachen: 'alle',
    bezug: 'region', hreflang: 'selbst', gegenstueck: 'gleicherPfad', indexierbar: 'neuAuf',
    sitemap: { bereich: 'hub', woche: { rang: 1, name: 'neu-auf', pfad: 'neu-auf', schluessel: 'neuAuf' } },
    analytics: [{ praefix: ['neu-auf'], typ: 'neu-auf' }] },
  { id: 'neu-auf-anbieter', namen: [], routen: ['/:locale/neu-auf/:anbieterSlug'], sprachen: 'alle',
    bezug: 'region', hreflang: 'selbst', gegenstueck: 'start', indexierbar: 'seite',
    sitemap: { bereich: 'hub', woche: { rang: 2, name: 'neu-auf', pfad: 'neu-auf/', liste: 'anbieter' } },
    analytics: [{ praefix: ['neu-auf', '*'], typ: 'neu-anbieter' }] },
  { id: 'kino-stadt', namen: ['kino_stadt'], routen: ['/:locale/kino/:stadtSlug'], sprachen: 'de',
    bezug: 'region', hreflang: 'selbst', gegenstueck: 'start', indexierbar: 'seite',
    sitemap: { bereich: 'kino_stadt', bereichName: 'kino_stadt', nurRegion: 'DE' } },
  { id: 'person', namen: ['person'], routen: ['/:locale/schauspieler/:slugId', '/:locale/regisseur/:slugId'], sprachen: 'personen',
    bezug: 'sprache', hreflang: 'eigen', gegenstueck: 'start', indexierbar: 'seite',
    sitemap: { bereich: 'person', bereichName: 'person', ungeprueft: true } },
  { id: 'sitemap', namen: [], routen: ['/sitemap-index.xml', /^\/sitemap-([a-z]{2}-[a-z]{2})-([a-z_]+)(?:-(\d{1,2}))?\.xml$/],
    sprachen: 'alle', bezug: 'sprache', hreflang: 'selbst', gegenstueck: 'start', indexierbar: 'immer' },
  { id: 'international', namen: [], routen: ['/international'], sprachen: 'alle',
    bezug: 'sprache', hreflang: 'selbst', gegenstueck: 'start', indexierbar: 'immer' },
  { id: 'start', namen: ['start'], routen: ['/:locale'], sprachen: 'alle',
    bezug: 'sprache', hreflang: 'cluster', cluster: { tiefe: 0, name: 'start' }, gegenstueck: 'partner', indexierbar: 'start',
    sitemap: { bereich: 'hub', bereichName: 'start', pfade: [{ pfad: 'start', rang: 1, indexierbar: 'start' }] } },
];

// Indexreihenfolge der Sitemap-Bereiche (sitemap-index.xml).
export const SITEMAP_BEREICHE = ['titel', 'genre', 'anbieter', 'bestenliste', 'kino_stadt', 'hub', 'person', 'reihe'];


// Name des ersten Pfadsegments (nach dem Locale): film/serie -> 'titel', sonst das Segment.
const SEGMENT_NAME = { film: 'titel', serie: 'titel' };
export function seitenartFuer(pfad) {
  const [erstes] = String(pfad || '').split('/').filter(Boolean).slice(1);
  if (!erstes) return 'start';
  return SEGMENT_NAME[erstes] || erstes;
}

const mitName = (name) => SEITENARTEN.find((s) => s.namen.includes(name));
const personenLocale = (locale) => PERSONEN_LOCALES.includes(textLocale(locale));

// Gibt es die Seitenart (logischer Name oder Pfadwort) in diesem Locale? de-Texte kennen alle.
export function hatSeitenart(locale, name) {
  if (textLocale(locale) === 'de-de') return true;
  const s = mitName(name);
  if (!s) return false;
  if (s.sprachen === 'personen') return personenLocale(locale);
  return s.sprachen === 'alle';
}

// Namen, die in allen lokalisierten Locales vorkommen (frueher ARTEN_LOKALISIERT).
export const namenLokalisiert = () => SEITENARTEN.filter((s) => s.sprachen === 'alle').flatMap((s) => s.namen);

function clusterForm() {
  const einsegmentig = [], unterseite = {};
  for (const s of SEITENARTEN) {
    if (s.hreflang !== 'cluster') continue;
    if (s.cluster.tiefe === 1) einsegmentig.push(...s.namen.filter((n) => s.routen.some((r) => r === `/:locale/${n}`)));
    if (s.cluster.tiefe === 2) for (const e of s.cluster.erste) unterseite[e] = s.cluster.name;
  }
  return { einsegmentig, unterseite };
}
export const CLUSTER_FORM = clusterForm();
const REGION_HUBS = SEITENARTEN.filter((s) => s.gegenstueck === 'gleicherPfad').flatMap((s) => s.namen);
export const regionHubs = () => REGION_HUBS;

// hreflang-Cluster: dieselbe Adresse in jedem indexierbaren Locale, das die Seitenart kennt.
export function clusterAlternates(locale, pfad) {
  if (!pfad || pfad.includes('?') || !pfad.startsWith(`/${locale}`)) return undefined;
  const teile = pfad.slice(locale.length + 1).split('/').filter(Boolean);
  let art;
  if (teile.length === 0) art = 'start';
  else if (teile.length === 1 && CLUSTER_FORM.einsegmentig.includes(teile[0])) art = teile[0];
  else if (teile.length === 2 && CLUSTER_FORM.unterseite[teile[0]]) art = CLUSTER_FORM.unterseite[teile[0]];
  else return undefined;
  const rest = teile.length ? '/' + teile.join('/') : '/';
  const locales = SEO_LOCALES.filter((l) => hatSeitenart(l, art));
  if (locales.length < 2 || !locales.includes(locale)) return undefined;
  return locales.map((l) => ({ locale: l, pfad: `/${l}${rest}` }));
}

// Wohin die Laender-Flagge `ziel` von `pfad` aus fuehrt: (1) hreflang-Partner, (2) dieselbe
// Uebersicht im Zielland, wenn es die Seitenart dort gibt, sonst (3) dessen Start.
export function gegenstueck(ziel, locale, pfad, alternates) {
  const partner = (alternates || []).find((a) => a.locale === ziel);
  if (partner) return partner.pfad;
  if (pfad && !pfad.includes('?') && pfad.startsWith(`/${locale}`)) {
    const teile = pfad.slice(locale.length + 1).split('/').filter(Boolean);
    const einfach = teile.length === 1 && (CLUSTER_FORM.einsegmentig.includes(teile[0]) || REGION_HUBS.includes(teile[0]));
    if (einfach && hatSeitenart(ziel, teile[0])) return `/${ziel}/${teile[0]}`;
    if (teile.length === 2 && CLUSTER_FORM.unterseite[teile[0]] && hatSeitenart(ziel, CLUSTER_FORM.unterseite[teile[0]])) {
      return `/${ziel}/${teile.join('/')}`;
    }
  }
  return `/${ziel}/`;
}

// Sitemap-Bereich -> Name, nach dem hatSeitenart() fragt (Kinoorte nur in Deutschland).
export function bereichFuerLocale(locale, bereich) {
  const s = SEITENARTEN.find((a) => a.sitemap?.bereich === bereich && a.sitemap.bereichName);
  const name = s ? s.sitemap.bereichName : bereich;
  if (s?.sitemap.nurRegion && (LOCALE_KONFIG[locale]?.region ?? 'DE') !== s.sitemap.nurRegion) return false;
  return hatSeitenart(locale, name);
}

// Hub-Seiten der Sitemap in Ausgabereihenfolge: { pfad, name, indexierbar }.
export function hubPfade() {
  return SEITENARTEN.flatMap((s) => (s.sitemap?.pfade || []).map((p) => ({
    pfad: p.pfad, rang: p.rang, name: p.pfad, indexierbar: p.indexierbar || s.indexierbar,
  }))).sort((a, b) => a.rang - b.rang);
}
// Wochenseiten (zeitabhaengig, stehen in der Sitemap vor den Hubs), nach Rang.
export function wochenArten() {
  return SEITENARTEN.filter((s) => s.sitemap?.woche).map((s) => ({ id: s.id, ...s.sitemap.woche, indexierbar: s.indexierbar }))
    .sort((a, b) => a.rang - b.rang);
}

// Analytics-Typ aus den Pfadsegmenten (ohne Locale-Pruefung); `liste` loest Bestenlisten auf.
const ANALYTICS = SEITENARTEN.flatMap((s) => (s.analytics || []).map((a) => ({ ...a }))).sort((a, b) => b.praefix.length - a.praefix.length);
export function analyticsTyp(teile, liste = () => null) {
  const rest = teile.slice(1);
  for (const r of ANALYTICS) {
    if (r.praefix.length > rest.length) continue;
    if (!r.praefix.every((p, i) => p === '*' || p === rest[i])) continue;
    return r.typ === 'liste' ? liste(teile.slice(1)) || teile[1] : r.typ;
  }
  return teile[1] || 'start';
}

// Express-Pfade (Strings und Regex) der Seitenart `id` oder aller.
export const routenVon = (id) => SEITENARTEN.find((s) => s.id === id)?.routen || [];

// hreflang der Seitenarten mit hreflang:'eigen' -- die Seite liefert die Locale-Liste selbst.
// Titel: nur indexierbare Locales mit Text, Slug je Locale. Person: de-de gibt es immer, dazu Locales mit Text.
export function alternatesTitel(titel, artWort) {
  const liste = (titel.textLocales || [])
    .filter((l) => localeIndexierbar(l))
    .map((l) => ({ locale: l, pfad: `/${l}/${artWort}/${titel.slugBasis ? slugifyName(titel.slugBasis) : titel.slug}-${titel.tmdbId}` }));
  return liste.length ? liste : undefined;
}
export function alternatesPerson(daten) {
  const cluster = [...new Set([...localesMitText(['de-de']), ...(daten.textLocales || [])])].filter((l) => localeIndexierbar(l));
  const liste = cluster.map((l) => ({ locale: l, pfad: `/${l}/${daten.rolle}/${daten.slug}-${daten.tmdbPersonId}` }));
  return liste.length ? liste : undefined;
}
