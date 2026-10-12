// Deutsche Namen und URL-Slugs fuer Herkunftslaender (ISO 3166) und
// Originalsprachen (ISO 639-1) der Bestenlisten. Namen kommen aus dem
// ICU-Bestand von Node, wenige Ausnahmen stehen unten. Reine Funktionen.
import { slugify } from './slug.js';

const REGION = new Intl.DisplayNames(['de'], { type: 'region' });
const SPRACHE = new Intl.DisplayNames(['de'], { type: 'language' });

const LAND_NAME = { US: 'USA', GB: 'Großbritannien', HK: 'Hongkong' };
// Nach "aus": nur Laender, die einen Artikel brauchen.
const LAND_AUS = {
  US: 'den USA', NL: 'den Niederlanden', CH: 'der Schweiz', TR: 'der Türkei', IR: 'dem Iran', IQ: 'dem Irak', LB: 'dem Libanon', SN: 'dem Senegal', SD: 'dem Sudan', PH: 'den Philippinen', AE: 'den Vereinigten Arabischen Emiraten',
  DO: 'der Dominikanischen Republik', CZ: 'Tschechien',
};
const SPRACHE_NAME = { cn: 'Kantonesisch' };

export function landName(code) {
  if (LAND_NAME[code]) return LAND_NAME[code];
  let n;
  try { n = REGION.of(code); } catch { return null; }
  return n && n !== code ? n : null;
}
export function landAus(code) {
  const n = landName(code);
  return n ? `aus ${LAND_AUS[code] || n}` : null;
}
export function landSlug(code) {
  const n = landName(code);
  return n ? slugify(n) : null;
}

export function sprachName(code) {
  if (SPRACHE_NAME[code]) return SPRACHE_NAME[code];
  if (code === 'xx') return null;
  let n;
  try { n = SPRACHE.of(code); } catch { return null; }
  return n && n !== code ? n : null;
}
export function sprachSlug(code) {
  const n = sprachName(code);
  return n ? slugify(n) : null;
}

// Anzeigenamen in der Sprache einer Locale (nur Text; Slugs bleiben deutsch).
// Fehlt der Name in ICU, greift der deutsche.
const anzeigeNamen = new Map();
function anzeige(sprache, type, code) {
  const key = sprache + type;
  if (!anzeigeNamen.has(key)) {
    let dn = null;
    try { dn = new Intl.DisplayNames([sprache], { type }); } catch { /* deutscher Name */ }
    anzeigeNamen.set(key, dn);
  }
  const dn = anzeigeNamen.get(key);
  try { const n = dn && dn.of(code); return n && n !== code ? n : null; } catch { return null; }
}
export function landAnzeige(code, sprache) {
  if (sprache === 'de') return landName(code);
  return anzeige(sprache, 'region', code) || landName(code);
}
export function sprachAnzeige(code, sprache) {
  if (sprache === 'de') return sprachName(code);
  return anzeige(sprache, 'language', code) || sprachName(code);
}

// Slug -> Code. Einmal aus allen Zwei-Buchstaben-Codes aufgebaut. Veraltete
// Codes, die ICU auf denselben Namen abbildet (DD/DE, SU/RU ...), sind
// ausgeschlossen, sonst gewaenne der alphabetisch erste und nicht der aktuelle.
const VERALTET_LAND = new Set(['AN', 'HV', 'DY', 'BU', 'ZR', 'CS', 'YU', 'DD', 'FX', 'UK', 'NH', 'RH', 'SU', 'TP', 'VD', 'YD']);
const VERALTET_SPRACHE = new Set(['tw', 'iw', 'in', 'ji', 'jw', 'mo']);
let landIndex = null;
let sprachIndex = null;
const buchstaben = 'abcdefghijklmnopqrstuvwxyz'.split('');
function baue(namensfunktion, gross) {
  const m = new Map();
  for (const a of buchstaben) for (const b of buchstaben) {
    const code = gross ? (a + b).toUpperCase() : a + b;
    if ((gross ? VERALTET_LAND : VERALTET_SPRACHE).has(code)) continue;
    const s = namensfunktion(code);
    if (s && !m.has(s)) m.set(s, code);
  }
  return m;
}
export function codeAusLandSlug(slug) {
  if (!landIndex) landIndex = baue(landSlug, true);
  return landIndex.get(slug) || null;
}
export function codeAusSprachSlug(slug) {
  if (!sprachIndex) sprachIndex = baue(sprachSlug, false);
  return sprachIndex.get(slug) || null;
}
// Nur Codes, deren Slug eindeutig zurueckfuehrt (sonst gaebe es zwei Seiten
// mit gleichem Pfad).
export const landHatSeite = (code) => { const s = landSlug(code); return !!s && codeAusLandSlug(s) === code; };
export const spracheHatSeite = (code) => { const s = sprachSlug(code); return !!s && codeAusSprachSlug(s) === code; };
