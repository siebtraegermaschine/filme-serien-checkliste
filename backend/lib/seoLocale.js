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
  'en-gb': { sprache: 'en', region: 'GB', aktiv: true, indexierbar: true },
  'es-es': { sprache: 'es', region: 'ES', aktiv: true, indexierbar: true },
  'fr-fr': { sprache: 'fr', region: 'FR', aktiv: true, indexierbar: true },
  'it-it': { sprache: 'it', region: 'IT', aktiv: true, indexierbar: true },
  'nl-nl': { sprache: 'nl', region: 'NL', aktiv: true, indexierbar: true },
  'pt-pt': { sprache: 'pt', region: 'PT', aktiv: true, indexierbar: true },
  // Laender-Locales: eigene Region (Streaming/Kino), Texte der textLocale. Alle noindex.
  'de-at': { sprache: 'de', region: 'AT', aktiv: true, indexierbar: true, textLocale: 'de-de' },
  'de-ch': { sprache: 'de', region: 'CH', aktiv: true, indexierbar: true, textLocale: 'de-de' },
  'fr-ch': { sprache: 'fr', region: 'CH', aktiv: true, indexierbar: true, textLocale: 'fr-fr' },
  'en-ca': { sprache: 'en', region: 'CA', aktiv: true, indexierbar: true, textLocale: 'en-gb' },
  'fr-ca': { sprache: 'fr', region: 'CA', aktiv: true, indexierbar: true, textLocale: 'fr-fr' },
  'en-us': { sprache: 'en', region: 'US', aktiv: true, indexierbar: true, textLocale: 'en-gb' },
  // Nicht-EWR: nur vorbereitet (kein aktives Marketing ausserhalb des EWR, siehe STATUS.md).
  'pt-br': { sprache: 'pt', region: 'BR', aktiv: false, indexierbar: false },
  // Phase 7b (Vorlage fuer weitere Laender-Varianten, siehe docs/PLAN-SEO-GLEICHSTAND.md): erst nach Freigabe aktiv.
  'es-mx': { sprache: 'es', region: 'MX', aktiv: false, indexierbar: false, textLocale: 'es-es' },
};

// Titelseiten in Nicht-de-Locales: unter dieser Textlaenge noindex und nicht in der
// Sitemap (Thin Content). de-de ist ausgenommen, dort werden die Texte noch aufgefuellt.
export const MIN_TITELTEXT = 200;
export const titelTextReicht = (locale, text) => textLocale(locale) === 'de-de' || (text || '').length >= MIN_TITELTEXT;

// Indexierbare Locales: Sitemap-Index, Sitemap-Dateien, robots.txt.
export const SEO_LOCALES = Object.keys(LOCALE_KONFIG).filter((l) => LOCALE_KONFIG[l].indexierbar);

export function localeGueltig(locale) {
  return !!(LOCALE_KONFIG[locale] && LOCALE_KONFIG[locale].aktiv);
}

export function localeIndexierbar(locale) {
  return !!(LOCALE_KONFIG[locale] && LOCALE_KONFIG[locale].indexierbar);
}

// Personen: nur in Locales mit uebersetzten Personentexten (PERSON_ABSCHNITTE in
// scripts/seo-kategorien-uebersetzen.mjs, Ueberschriften in seoRender.js). Eine
// Personenseite gibt es dort nur mit Text (seoData.js), sonst 404.
export const PERSONEN_LOCALES = ['en-gb', 'fr-fr', 'es-es', 'it-it', 'nl-nl', 'pt-pt'];

// Welche Seitenarten es in welchem Locale gibt, welche Cluster und Gegenstuecke:
// siehe lib/seoSeitenarten.js (Verzeichnis). Hier nur durchgereicht.
export { hatSeitenart, clusterAlternates, gegenstueck, seitenartFuer as seitenartFuerPfad } from './seoSeitenarten.js';

// Locale, aus dem die Redaktionstexte (seo_content) kommen: bei Laender-Locales die
// Sprachfassung (de-at -> de-de), sonst das Locale selbst.
export function textLocale(locale) {
  return (LOCALE_KONFIG[locale] && LOCALE_KONFIG[locale].textLocale) || locale;
}

// Alle aktiven Locales, die mit den vorhandenen Text-Locales eine Fassung haben
// (hreflang-Cluster eines Titels/einer Person).
export function localesMitText(textLocales) {
  const vorhanden = new Set(textLocales);
  return Object.keys(LOCALE_KONFIG).filter((l) => LOCALE_KONFIG[l].aktiv && vorhanden.has(textLocale(l)));
}

// Deutsche Sprache (de-de, de-at, de-ch): deutsche Vorlagen, Pfadwoerter, Rechtstexte.
export function istDeutsch(locale) {
  return sprachVon(locale) === 'de';
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
