// Einzige Stelle, die auflistet, fuer welche Land/Sprache-Kombinationen die
// SEO-Seiten (PLAN-SEO.md, PLAN-SEO-UMSETZUNG) Inhalte haben.
//
// Zwei Stufen je Locale:
//  - aktiv: Routen liefern Seiten aus (sonst 404).
//  - indexierbar: Sitemap, robots.txt-Freigabe und meta robots "index". Erst
//    dann kann Google die Locale sehen. Neue Locales starten aktiv, aber nicht
//    indexierbar: sie sind zum Pruefen erreichbar, ohne ins Netz zu gehen.
// Sprachen: Texte in seoTexte.js. Pfadwoerter (/film/, /beste-filme, ...) bleiben
// fuer alle Locales deutsch -- eine Slug-Lokalisierung ist eine eigene Entscheidung.
export const LOCALE_KONFIG = {
  'de-de': { sprache: 'de', region: 'DE', aktiv: true, indexierbar: true },
  'en-gb': { sprache: 'en', region: 'GB', aktiv: true, indexierbar: false },
  'es-es': { sprache: 'es', region: 'ES', aktiv: true, indexierbar: false },
  'fr-fr': { sprache: 'fr', region: 'FR', aktiv: true, indexierbar: false },
  'it-it': { sprache: 'it', region: 'IT', aktiv: true, indexierbar: false },
  'nl-nl': { sprache: 'nl', region: 'NL', aktiv: true, indexierbar: false },
  'pt-pt': { sprache: 'pt', region: 'PT', aktiv: true, indexierbar: false },
  // Nicht-EWR: nur vorbereitet (kein aktives Marketing ausserhalb des EWR, siehe STATUS.md).
  'en-us': { sprache: 'en', region: 'US', aktiv: false, indexierbar: false },
  'pt-br': { sprache: 'pt', region: 'BR', aktiv: false, indexierbar: false },
};

// Indexierbare Locales: Sitemap-Index, Sitemap-Dateien, robots.txt.
export const SEO_LOCALES = Object.keys(LOCALE_KONFIG).filter((l) => LOCALE_KONFIG[l].indexierbar);

// Seitenarten, die in den Nicht-de-Locales schon lokalisiert sind (Stand: Start
// und Titelseiten). Alle anderen liefern dort 404 und werden nirgends verlinkt
// (seoRender.js). Weitere Arten ('hub', 'genre', 'anbieter', 'person', 'reihe', ...)
// erst eintragen, wenn Renderer und Daten lokalisiert sind. de-de kennt alle.
const ARTEN_LOKALISIERT = ['start', 'titel'];

export function localeGueltig(locale) {
  return !!(LOCALE_KONFIG[locale] && LOCALE_KONFIG[locale].aktiv);
}

export function localeIndexierbar(locale) {
  return !!(LOCALE_KONFIG[locale] && LOCALE_KONFIG[locale].indexierbar);
}

export function hatSeitenart(locale, art) {
  return locale === 'de-de' || ARTEN_LOKALISIERT.includes(art);
}

// 'de-de' -> 'de', 'pt-pt' -> 'pt'.
export function sprachVon(locale) {
  return LOCALE_KONFIG[locale] ? LOCALE_KONFIG[locale].sprache : 'de';
}

// 'de-de' -> 'de-DE', wie von hreflang verlangt (Sprache klein, Land gross).
export function hreflangCode(locale) {
  const [sprache, land] = String(locale || '').split('-');
  return sprache && land ? sprache + '-' + land.toUpperCase() : locale;
}

// Region, die ein Locale fuer Kino-/Streaming-Daten anspricht (REGIONEN aus
// i18n.js).
export function regionFuerLocale(locale) {
  return LOCALE_KONFIG[locale] ? LOCALE_KONFIG[locale].region : 'DE';
}

// Seitenart zu einem Pfad hinter dem Locale (/film/..., /filme/drama, ...).
export function seitenartFuerPfad(pfad) {
  const [erstes] = String(pfad || '').split('/').filter(Boolean).slice(1);
  if (!erstes) return 'start';
  if (erstes === 'film' || erstes === 'serie') return 'titel';
  return erstes;
}
