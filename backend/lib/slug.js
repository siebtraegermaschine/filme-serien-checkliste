// Eine Slug-Funktion fuer alle SEO-Seitenarten (Titel/Genre/Anbieter/Stadt) --
// siehe PLAN-SEO.md Abschnitt 3. Deutsch orientiert (Umlaute/scharfes S
// transkribiert).
//
// Bestehende de-de-URLs duerfen sich nie aendern: Fuer 'de-de' (Standard)
// bleibt das Verhalten unveraendert (Akzente wie e/n werden dort weiter zu '-').
// Nur neue Locales bekommen die volle Transliteration (e->e, n->n, o->o usw.).
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
