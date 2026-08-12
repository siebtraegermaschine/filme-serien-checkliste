/*
 * Englische Anzeige der Schlagwoerter (siehe PLAN-INTERNATIONALISIERUNG.md).
 *
 * In titles.keywords stehen deutsche CamelCase-Hashtags ("ZweiterWeltkrieg"),
 * entstanden aus den rohen TMDB-Keywords ueber keyword-translations-de.json
 * (apply-keyword-translation.mjs) bzw. von Hand (Katalog-Seed, Themen). Fuer
 * Englisch wird dieselbe Tabelle rueckwaerts gelesen: deutscher Hashtag ->
 * englisches TMDB-Keyword, als CamelCase-Hashtag ("WorldWarII"), damit im
 * Frontend dieselbe Auftrenn-Logik (kwGetrennt) und dieselbe Wort-Suche
 * greifen wie fuer die deutschen Hashtags. Hashtags ohne Eintrag bleiben
 * deutsch stehen -- derselbe Rueckfall wie bei Titeln und Inhaltsangaben.
 *
 * Uebersetzt wird zur Antwortzeit, nicht in der Datenbank: keywords ist die
 * einzige Spalte, die von Hand gepflegte Werte traegt (siehe den Kommentar in
 * routes/titles.js zum Import), eine zweite Sprachspalte muesste also bei
 * jeder Handpflege mitgezogen werden. Der Listen-Zwischenspeicher haelt die
 * fertige Antwort ohnehin je Sprache, es rechnet also nicht jeder Aufruf neu.
 */
import { readFileSync } from 'node:fs';

const ROH = JSON.parse(readFileSync(
  new URL('../scripts/keyword-translations-de.json', import.meta.url), 'utf8'
));

// Roemische Zahlen bleiben ganz gross ("world war ii" -> "WorldWarII") --
// die Wortanfangs-Regel machte sonst "World War Ii" daraus.
const ROEMISCH = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/;

function alsHashtag(en) {
  return en.split(/\s+/).filter(Boolean).map((wort) =>
    ROEMISCH.test(wort) ? wort.toUpperCase() : wort.charAt(0).toUpperCase() + wort.slice(1)
  ).join('');
}

// Mehrere englische Keywords koennen auf denselben deutschen Hashtag zeigen
// ("ww2" und "world war ii" -> "ZweiterWeltkrieg"); es gewinnt das laengste --
// das ist in der Praxis die ausgeschriebene, lesbare Form.
const EN_VON_DE = new Map();
for (const [en, de] of Object.entries(ROH)) {
  const bisher = EN_VON_DE.get(de);
  if (!bisher || en.length > bisher.length) EN_VON_DE.set(de, en);
}
for (const [de, en] of EN_VON_DE) EN_VON_DE.set(de, alsHashtag(en));

export function schlagworteFuer(lang, keywords) {
  if (lang !== 'en' || !Array.isArray(keywords)) return keywords;
  return keywords.map((k) => EN_VON_DE.get(k) || k);
}
