import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merkmaleAusDetail } from '../lib/tmdbMerkmale.js';

test('Film: Produktionsland als Ersatz, Laufzeit, keine Staffeln', () => {
  const m = merkmaleAusDetail({ original_language: 'fr', runtime: 118, production_countries: [{ iso_3166_1: 'FR' }, { iso_3166_1: 'BE' }] }, 'movie');
  assert.deepEqual(m, { originCountry: ['FR', 'BE'], originalLanguage: 'fr', runtime: 118, seasons: null, collectionId: null, collectionName: null, erschienenAm: null });
});

test('Serie: origin_country und Staffelzahl, keine Laufzeit', () => {
  const m = merkmaleAusDetail({ original_language: 'ko', origin_country: ['KR'], number_of_seasons: 2, runtime: 60, episode_run_time: [45] }, 'tv');
  assert.deepEqual(m, { originCountry: ['KR'], originalLanguage: 'ko', runtime: 45, seasons: 2, collectionId: null, collectionName: null, erschienenAm: null });
});

test('Leere und unsinnige Werte werden null', () => {
  const m = merkmaleAusDetail({ original_language: 'xx1', origin_country: ['usa', ''], runtime: 0, number_of_seasons: 0 }, 'series');
  assert.deepEqual(m, { originCountry: null, originalLanguage: null, runtime: null, seasons: null, collectionId: null, collectionName: null, erschienenAm: null });
  assert.equal(merkmaleAusDetail(null, 'movie').originalLanguage, null);
});

test('Film: Reihe und Erscheinungsdatum; Serien und kaputte Reihen bleiben leer', () => {
  const film = { release_date: '2001-12-19', belongs_to_collection: { id: 119, name: 'Der Herr der Ringe - Filmreihe' } };
  const m = merkmaleAusDetail(film, 'movie');
  assert.equal(m.collectionId, 119);
  assert.equal(m.collectionName, 'Der Herr der Ringe - Filmreihe');
  assert.equal(m.erschienenAm, '2001-12-19');
  assert.equal(merkmaleAusDetail(film, 'tv').collectionId, null);
  assert.equal(merkmaleAusDetail({ belongs_to_collection: null }, 'movie').collectionId, null);
  assert.equal(merkmaleAusDetail({ belongs_to_collection: { id: 5, name: '  ' } }, 'movie').collectionId, null);
  assert.equal(merkmaleAusDetail({ release_date: '' }, 'movie').erschienenAm, null);
});
