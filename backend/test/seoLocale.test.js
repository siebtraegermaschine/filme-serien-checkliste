import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEO_LOCALES, LOCALE_KONFIG, localeGueltig, localeIndexierbar, hatSeitenart, sprachVon, hreflangCode, regionFuerLocale } from '../lib/seoLocale.js';

test('localeGueltig: nur aktive Locales', () => {
  assert.equal(localeGueltig('de-de'), true);
  assert.equal(localeGueltig('en-gb'), true);
  assert.equal(localeGueltig('es-es'), true);
  assert.equal(localeGueltig('de-at'), false); // noch nicht freigegeben
  assert.equal(localeGueltig('en-us'), false); // Nicht-EWR: nur vorbereitet
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

test('SEO_LOCALES (Sitemap): nur de-de ist indexierbar', () => {
  assert.deepEqual(SEO_LOCALES, ['de-de']);
  assert.equal(localeIndexierbar('de-de'), true);
  assert.equal(localeIndexierbar('en-gb'), false);
});

test('sprachVon und hatSeitenart', () => {
  assert.equal(sprachVon('de-de'), 'de');
  assert.equal(sprachVon('pt-pt'), 'pt');
  assert.equal(hatSeitenart('de-de', 'bestenliste'), true);
  assert.equal(hatSeitenart('en-gb', 'bestenlisten'), true);
  assert.equal(hatSeitenart('en-gb', 'person'), false);
  assert.equal(hatSeitenart('en-gb', 'titel'), true);
});

test('Jede indexierbare Locale hat eine Allow-Zeile in robots.txt, keine andere', () => {
  const robots = readFileSync(new URL('../../robots.txt', import.meta.url), 'utf8');
  for (const l of Object.keys(LOCALE_KONFIG)) {
    const erlaubt = new RegExp(`^Allow: /${l}/`, 'm').test(robots);
    assert.equal(erlaubt, LOCALE_KONFIG[l].indexierbar, l);
  }
});
