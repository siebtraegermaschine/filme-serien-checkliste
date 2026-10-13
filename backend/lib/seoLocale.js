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
  'es-es': { sprache: 'es', region: 'ES', aktiv: true, indexierbar: false },
  'fr-fr': { sprache: 'fr', region: 'FR', aktiv: true, indexierbar: true },
  'it-it': { sprache: 'it', region: 'IT', aktiv: true, indexierbar: false },
  'nl-nl': { sprache: 'nl', region: 'NL', aktiv: true, indexierbar: false },
  'pt-pt': { sprache: 'pt', region: 'PT', aktiv: true, indexierbar: false },
  // Laender-Locales: eigene Region (Streaming/Kino), Texte der textLocale. Alle noindex.
  'de-at': { sprache: 'de', region: 'AT', aktiv: true, indexierbar: false, textLocale: 'de-de' },
  'de-ch': { sprache: 'de', region: 'CH', aktiv: true, indexierbar: false, textLocale: 'de-de' },
  'fr-ch': { sprache: 'fr', region: 'CH', aktiv: true, indexierbar: false, textLocale: 'fr-fr' },
  'en-ca': { sprache: 'en', region: 'CA', aktiv: true, indexierbar: false, textLocale: 'en-gb' },
  'fr-ca': { sprache: 'fr', region: 'CA', aktiv: true, indexierbar: false, textLocale: 'fr-fr' },
  'en-us': { sprache: 'en', region: 'US', aktiv: true, indexierbar: false, textLocale: 'en-gb' },
  // Nicht-EWR: nur vorbereitet (kein aktives Marketing ausserhalb des EWR, siehe STATUS.md).
  'pt-br': { sprache: 'pt', region: 'BR', aktiv: false, indexierbar: false },
};

// Indexierbare Locales: Sitemap-Index, Sitemap-Dateien, robots.txt.
export const SEO_LOCALES = Object.keys(LOCALE_KONFIG).filter((l) => LOCALE_KONFIG[l].indexierbar);

// Seitenarten, die in den Nicht-de-Locales lokalisiert sind (alle noindex, nicht in
// der Sitemap). Eintraege sind Pfadwoerter UND die logischen Namen, nach denen der
// Renderer fragt. Personen ('person', 'schauspieler', 'regisseur') nur in
// PERSONEN_LOCALES (siehe unten). de-de kennt alle.
const ARTEN_LOKALISIERT = [
  'start', 'titel',
  'hub', 'genre', 'anbieter', 'reihe',
  'filme', 'serien', 'streaming', 'bestenlisten', 'beste-filme', 'beste-serien', 'kino', 'neu-auf', 'reihen',
];

export function localeGueltig(locale) {
  return !!(LOCALE_KONFIG[locale] && LOCALE_KONFIG[locale].aktiv);
}

export function localeIndexierbar(locale) {
  return !!(LOCALE_KONFIG[locale] && LOCALE_KONFIG[locale].indexierbar);
}

// Personen: nur in Locales mit uebersetzten Personentexten (PERSON_ABSCHNITTE in
// scripts/seo-kategorien-uebersetzen.mjs, Ueberschriften in seoRender.js). Eine
// Personenseite gibt es dort nur mit Text (seoData.js), sonst 404.
export const PERSONEN_LOCALES = ['en-gb', 'fr-fr'];
const ARTEN_PERSON = ['person', 'schauspieler', 'regisseur'];

export function hatSeitenart(locale, art) {
  const t = textLocale(locale);
  if (t === 'de-de') return true;
  if (ARTEN_PERSON.includes(art)) return PERSONEN_LOCALES.includes(t);
  return ARTEN_LOKALISIERT.includes(art);
}

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

// Seitenart zu einem Pfad hinter dem Locale (/film/..., /filme/drama, ...).
export function seitenartFuerPfad(pfad) {
  const [erstes] = String(pfad || '').split('/').filter(Boolean).slice(1);
  if (!erstes) return 'start';
  if (erstes === 'film' || erstes === 'serie') return 'titel';
  return erstes;
}
