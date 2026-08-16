import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEO_LOCALES, localeGueltig, hreflangCode, regionFuerLocale } from '../lib/seoLocale.js';

test('localeGueltig: nur bekannte Locales', () => {
  assert.equal(localeGueltig('de-de'), true);
  assert.equal(localeGueltig('de-at'), false); // noch nicht freigegeben
  assert.equal(localeGueltig('xx-yy'), false);
  assert.equal(localeGueltig(''), false);
});

test('hreflangCode: Sprache klein, Land gross', () => {
  assert.equal(hreflangCode('de-de'), 'de-DE');
});

test('regionFuerLocale: bekanntes Locale liefert seine Region, sonst DE', () => {
  assert.equal(regionFuerLocale('de-de'), 'DE');
  assert.equal(regionFuerLocale('unbekannt'), 'DE');
});

test('SEO_LOCALES: Startumfang ist nur de-de', () => {
  assert.deepEqual(SEO_LOCALES, ['de-de']);
});
