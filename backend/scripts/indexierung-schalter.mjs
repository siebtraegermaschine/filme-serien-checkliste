// Schaltet Locales indexierbar (an) oder wieder noindex (aus): LOCALE_KONFIG,
// Allow-Zeile in robots.txt und die Erwartung in seoLocale.test.js in einem Zug.
// Aufruf: node backend/scripts/indexierung-schalter.mjs an fr-fr en-gb
//         node backend/scripts/indexierung-schalter.mjs aus fr-fr
// Danach: cd backend && npm test, committen, pushen (= live), Sitemap und Seitenkopf pruefen.
import { readFileSync, writeFileSync } from 'node:fs';

const [modus, ...locales] = process.argv.slice(2);
if (!['an', 'aus'].includes(modus) || !locales.length) {
  console.error('Aufruf: indexierung-schalter.mjs an|aus <locale>...');
  process.exit(1);
}
const wert = modus === 'an';
const wurzel = new URL('../../', import.meta.url);
const pfade = {
  konfig: new URL('backend/lib/seoLocale.js', wurzel),
  robots: new URL('robots.txt', wurzel),
  test: new URL('backend/test/seoLocale.test.js', wurzel),
};
let konfig = readFileSync(pfade.konfig, 'utf8');
let robots = readFileSync(pfade.robots, 'utf8');

for (const l of locales) {
  const re = new RegExp(`(\\n  '${l}': \\{[^\\n]*indexierbar: )(true|false)`);
  if (!re.test(konfig)) throw new Error(`Locale ${l} nicht in LOCALE_KONFIG`);
  konfig = konfig.replace(re, `$1${wert}`);
  const zeile = `Allow: /${l}/\n`;
  robots = robots.replace(zeile, '');
  if (wert) robots = robots.replace('Allow: /sitemap-*.xml\n', `${zeile}Allow: /sitemap-*.xml\n`);
}
writeFileSync(pfade.konfig, konfig);
writeFileSync(pfade.robots, robots);

// Erwartung im Test aus der Konfiguration neu ableiten.
const aktiv = [...konfig.matchAll(/\n  '([a-z]{2}-[a-z]{2})': \{[^\n]*indexierbar: true/g)].map((m) => m[1]);
let test = readFileSync(pfade.test, 'utf8');
test = test.replace(/test\('SEO_LOCALES \(Sitemap\)[^\n]*\n  assert\.deepEqual\(SEO_LOCALES, \[[^\]]*\]\);/,
  `test('SEO_LOCALES (Sitemap): indexierbare Locales laut Konfiguration', () => {\n  assert.deepEqual(SEO_LOCALES, [${aktiv.map((l) => `'${l}'`).join(', ')}]);`);
writeFileSync(pfade.test, test);
console.log(`${modus}: ${locales.join(', ')} -- indexierbar jetzt: ${aktiv.join(', ')}`);
