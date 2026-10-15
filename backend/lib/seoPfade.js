// Pfadwoerter je Sprache (erstes Segment hinter dem Locale). Intern bleiben alle
// Routen, Renderer und seo_content-Schluessel deutsch; die Lokalisierung sitzt nur
// an der Aussengrenze (routes/seo.js): eingehend zurueck ins Deutsche, ausgehend
// in jeder URL der Antwort (Links, canonical, hreflang, JSON-LD, Sitemap).
// de-de bleibt unveraendert.
import { LOCALE_KONFIG } from './seoLocale.js';

const DE = ['film', 'serie', 'filme', 'serien', 'streaming', 'bestenlisten', 'beste-filme', 'beste-serien',
  'kino', 'neu-auf', 'reihen', 'regisseur', 'schauspieler'];

const WOERTER = {
  en: ['movie', 'tv-show', 'movies', 'tv-shows', 'streaming', 'rankings', 'best-movies', 'best-tv-shows',
    'cinema', 'new-on', 'collections', 'directors', 'actors'],
  fr: ['film', 'serie', 'films', 'series', 'streaming', 'classements', 'meilleurs-films', 'meilleures-series',
    'cinema', 'nouveautes-sur', 'sagas', 'realisateurs', 'acteurs'],
  es: ['pelicula', 'serie', 'peliculas', 'series', 'streaming', 'rankings', 'mejores-peliculas', 'mejores-series',
    'cine', 'novedades-en', 'sagas', 'directores', 'actores'],
  it: ['film', 'serie-tv', 'i-film', 'le-serie-tv', 'streaming', 'classifiche', 'migliori-film', 'migliori-serie-tv',
    'cinema', 'novita-su', 'saghe', 'registi', 'attori'],
  nl: ['film', 'serie', 'films', 'series', 'streaming', 'ranglijsten', 'beste-films', 'beste-series',
    'bioscoop', 'nieuw-op', 'filmreeksen', 'regisseurs', 'acteurs'],
  pt: ['filme', 'serie', 'filmes', 'series', 'streaming', 'rankings', 'melhores-filmes', 'melhores-series',
    'cinema', 'novidades-no', 'colecoes', 'realizadores', 'atores'],
};

// Zweites Segment, nur hinter kino: /<locale>/kino/neustarts -> .../cinema/new-releases.
const UNTERWOERTER = {
  neustarts: { en: 'new-releases', fr: 'nouveautes', es: 'estrenos', it: 'nuove-uscite', nl: 'nieuwe-films', pt: 'estreias' },
};
const unterwort = (locale, deutsch) => UNTERWOERTER[deutsch]?.[LOCALE_KONFIG[locale]?.sprache] || deutsch;
const unterDeutsch = (locale, wort) =>
  Object.keys(UNTERWOERTER).find((d) => UNTERWOERTER[d][LOCALE_KONFIG[locale]?.sprache] === wort) || null;

const aktiveLocales = () => Object.keys(LOCALE_KONFIG).filter((l) => LOCALE_KONFIG[l].sprache !== 'de');
const wortFuer = (locale, de) => {
  const liste = WOERTER[LOCALE_KONFIG[locale]?.sprache];
  return liste ? liste[DE.indexOf(de)] : de;
};

// 'bestenlisten' ist ein deutsches Wort fuer die Uebersicht; fremde Sprachen haben ein eigenes.
export function lokalWort(locale, deutsch) {
  if (LOCALE_KONFIG[locale]?.sprache === 'de' || !DE.includes(deutsch)) return deutsch;
  return wortFuer(locale, deutsch);
}

// Lokales Wort -> deutsches Wort (null, wenn es keins ist).
export function deutschWort(locale, wort) {
  const liste = WOERTER[LOCALE_KONFIG[locale]?.sprache];
  if (!liste) return null;
  const i = liste.indexOf(wort);
  return i >= 0 ? DE[i] : null;
}

const ALTERNATIVEN = DE.slice().sort((a, b) => b.length - a.length).join('|');
const LOCALE_RE = aktiveLocales().join('|');
const URL_RE = new RegExp(`/(${LOCALE_RE})/(${ALTERNATIVEN})(/neustarts)?(?=[/"'?#<\\s)\\\\]|$)`, 'g');

// Ersetzt in einem Text (HTML/XML) jedes /<locale>/<deutsches Wort> durch das lokale Wort.
export function lokalisierePfade(text) {
  return String(text).replace(URL_RE, (_, locale, wort, unter) =>
    `/${locale}/${lokalWort(locale, wort)}${unter ? (wort === 'kino' ? '/' + unterwort(locale, 'neustarts') : unter) : ''}`);
}

// Eingehender Pfad: { pfad (intern, deutsch), umleiten (lokale URL) }. Gleichbleibende
// Woerter (film in fr/nl/it) werden nicht umgeleitet.
export function pfadAnalysieren(pfad) {
  const teile = String(pfad).split('/');
  const locale = teile[1];
  const wort = teile[2];
  if (!wort || !LOCALE_KONFIG[locale] || LOCALE_KONFIG[locale].sprache === 'de') return { pfad };
  const deutsch = deutschWort(locale, wort);
  const unter = teile[3];
  let umleiten = null;
  if (deutsch) teile[2] = deutsch;
  else if (DE.includes(wort) && lokalWort(locale, wort) !== wort) {
    umleiten = lokalWort(locale, wort);
    teile[2] = umleiten;
  }
  // Unterwort nur hinter kino; das deutsche Wort in fremder Sprache geht per 301 aufs lokale.
  if (unter && teile[2] !== undefined && (deutsch === 'kino' || wort === 'kino')) {
    const d = unterDeutsch(locale, unter);
    if (d) teile[3] = d;
    else if (unter === 'neustarts' && unterwort(locale, 'neustarts') !== 'neustarts') {
      teile[3] = unterwort(locale, 'neustarts');
      umleiten = lokalWort(locale, 'kino');
      teile[2] = umleiten;
    }
  }
  if (umleiten) {
    const ziel = teile.join('/');
    return { pfad, umleiten: ziel };
  }
  return { pfad: teile.join('/') };
}
