import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merkmaleAusDetail } from '../lib/tmdbMerkmale.js';

test('Film: Produktionsland als Ersatz, Laufzeit, keine Staffeln', () => {
  const m = merkmaleAusDetail({ original_language: 'fr', runtime: 118, production_countries: [{ iso_3166_1: 'FR' }, { iso_3166_1: 'BE' }] }, 'movie');
  assert.deepEqual(m, { originCountry: ['FR', 'BE'], originalLanguage: 'fr', runtime: 118, seasons: null });
});

test('Serie: origin_country und Staffelzahl, keine Laufzeit', () => {
  const m = merkmaleAusDetail({ original_language: 'ko', origin_country: ['KR'], number_of_seasons: 2, runtime: 60 }, 'tv');
  assert.deepEqual(m, { originCountry: ['KR'], originalLanguage: 'ko', runtime: null, seasons: 2 });
});

test('Leere und unsinnige Werte werden null', () => {
  const m = merkmaleAusDetail({ original_language: 'xx1', origin_country: ['usa', ''], runtime: 0, number_of_seasons: 0 }, 'series');
  assert.deepEqual(m, { originCountry: null, originalLanguage: null, runtime: null, seasons: null });
  assert.equal(merkmaleAusDetail(null, 'movie').originalLanguage, null);
});
