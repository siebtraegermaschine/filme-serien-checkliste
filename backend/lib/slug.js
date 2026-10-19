// Eine Slug-Funktion fuer alle SEO-Seitenarten (Titel/Genre/Anbieter/Stadt) --
// siehe PLAN-SEO.md Abschnitt 3. Deutsch orientiert (Umlaute/scharfes S
// transkribiert).
//
// slugify: fuer 'de-de' (Standard) werden Akzente weiter zu '-' (Land/Genre/Ort/
// Anbieter bleiben stabil). Andere Locales transliterieren voll.
// slugifyName: Titel und Personen -- immer volle Transliteration (Pokémon -> pokemon).
const UMLAUTE = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' };
const SONDER = { 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i' };

export function slugify(text, locale = 'de-de') {
  let s = String(text || '').toLowerCase();
  if (!String(locale).startsWith('de-')) {
    // ä/ö/ü zuerst (sonst wuerde NFD sie zu a/o/u machen), dann Akzente entfernen.
    s = s.replace(/[äöüß]/g, (z) => UMLAUTE[z])
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[æœøłđðþı]/g, (z) => SONDER[z]);
  } else {
    s = s.replace(/[äöüß]/g, (z) => UMLAUTE[z]);
  }
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function slugifyName(text) {
  return slugify(text, 'xx-xx');
}
