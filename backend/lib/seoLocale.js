// Einzige Stelle, die auflistet, fuer welche Land/Sprache-Kombinationen die
// SEO-Seiten (PLAN-SEO.md, PLAN-SEO-UMSETZUNG) Inhalte haben. Start nur
// de-de; weitere Locales (de-at, de-ch, ...) kommen als neue Eintraege
// dazu, ohne Routen/Templates umzubauen -- siehe Architektur-Entscheidung 2
// im Plan.
export const SEO_LOCALES = ['de-de'];

// Region, die ein Locale fuer Kino-/Streaming-Daten anspricht (REGIONEN aus
// i18n.js). Separat von hreflangCode gehalten, weil ein Locale spaeter eine
// andere Region als sein Sprachteil haben kann (z.B. de-at -> Region AT).
const REGION_JE_LOCALE = { 'de-de': 'DE' };

export function localeGueltig(locale) {
  return SEO_LOCALES.includes(locale);
}

// 'de-de' -> 'de-DE', wie von hreflang verlangt (Sprache klein, Land gross).
export function hreflangCode(locale) {
  const [sprache, land] = String(locale || '').split('-');
  return sprache && land ? sprache + '-' + land.toUpperCase() : locale;
}

export function regionFuerLocale(locale) {
  return REGION_JE_LOCALE[locale] || 'DE';
}
