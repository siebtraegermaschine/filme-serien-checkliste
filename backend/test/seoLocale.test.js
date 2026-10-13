import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEO_LOCALES, LOCALE_KONFIG, localeGueltig, localeIndexierbar, hatSeitenart, sprachVon, hreflangCode, regionFuerLocale } from '../lib/seoLocale.js';

test('localeGueltig: nur aktive Locales', () => {
  assert.equal(localeGueltig('de-de'), true);
  assert.equal(localeGueltig('en-gb'), true);
  assert.equal(localeGueltig('es-es'), true);
  assert.equal(localeGueltig('de-at'), true); // Laender-Locale, noindex
  assert.equal(localeGueltig('pt-br'), false); // Nicht-EWR: nur vorbereitet
  assert.equal(localeGueltig('pt-br'), false);
  assert.equal(localeGueltig('xx-yy'), false);
  assert.equal(localeGueltig(''), false);
});

test('hreflangCode: Sprache klein, Land gross', () => {
  assert.equal(hreflangCode('de-de'), 'de-DE');
  assert.equal(hreflangCode('en-gb'), 'en-GB');
});

test('regionFuerLocale: bekanntes Locale liefert seine Region, sonst DE', () => {
  assert.equal(regionFuerLocale('de-de'), 'DE');
  assert.equal(regionFuerLocale('en-gb'), 'GB');
  assert.equal(regionFuerLocale('es-es'), 'ES');
  assert.equal(regionFuerLocale('unbekannt'), 'DE');
});

test('SEO_LOCALES (Sitemap): indexierbare Locales laut Konfiguration', () => {
  assert.deepEqual(SEO_LOCALES, ['de-de', 'en-gb', 'fr-fr']);
  assert.equal(localeIndexierbar('de-de'), true);
  assert.equal(localeIndexierbar('es-es'), false);
});

test('sprachVon und hatSeitenart', () => {
  assert.equal(sprachVon('de-de'), 'de');
  assert.equal(sprachVon('pt-pt'), 'pt');
  assert.equal(hatSeitenart('de-de', 'bestenliste'), true);
  assert.equal(hatSeitenart('en-gb', 'bestenlisten'), true);
  assert.equal(hatSeitenart('en-gb', 'person'), true); // uebersetzte Personentexte
  assert.equal(hatSeitenart('fr-fr', 'regisseur'), true);
  assert.equal(hatSeitenart('es-es', 'person'), false);
  assert.equal(hatSeitenart('it-it', 'schauspieler'), false);
  assert.equal(hatSeitenart('en-gb', 'titel'), true);
});

test('Jede indexierbare Locale hat eine Allow-Zeile in robots.txt, keine andere', () => {
  const robots = readFileSync(new URL('../../robots.txt', import.meta.url), 'utf8');
  for (const l of Object.keys(LOCALE_KONFIG)) {
    const erlaubt = new RegExp(`^Allow: /${l}/`, 'm').test(robots);
    assert.equal(erlaubt, LOCALE_KONFIG[l].indexierbar, l);
  }
});

test('Laender-Locales: Texte aus der Sprachfassung, eigene Region, noindex', async () => {
  const { textLocale, localesMitText, istDeutsch, hatSeitenart, regionFuerLocale, localeIndexierbar } = await import('../lib/seoLocale.js');
  assert.equal(textLocale('de-at'), 'de-de');
  assert.equal(textLocale('en-ca'), 'en-gb');
  assert.equal(textLocale('fr-ca'), 'fr-fr');
  assert.equal(textLocale('es-es'), 'es-es');
  assert.deepEqual(localesMitText(['de-de']).sort(), ['de-at', 'de-ch', 'de-de']);
  assert.ok(localesMitText(['fr-fr']).includes('fr-ch'));
  assert.equal(regionFuerLocale('de-ch'), 'CH');
  assert.ok(istDeutsch('de-at') && !istDeutsch('fr-ch'));
  assert.ok(hatSeitenart('de-at', 'schauspieler') && hatSeitenart('en-us', 'schauspieler') && hatSeitenart('fr-ca', 'schauspieler') && !hatSeitenart('es-es', 'schauspieler'));
  assert.ok(['de-at', 'de-ch', 'fr-ch', 'en-ca', 'fr-ca', 'en-us'].every((l) => !localeIndexierbar(l)));
});
