import { test } from 'node:test';
import assert from 'node:assert/strict';
import { istLateinisch, englischAusOriginal, vorschlagFehler } from '../lib/titelLokal.js';

test('istLateinisch: Akzente ja, andere Schriften nein', () => {
  assert.equal(istLateinisch('Le Fabuleux Destin d’Amélie Poulain'), true);
  assert.equal(istLateinisch('Fate/Zero'), true);
  assert.equal(istLateinisch('千と千尋の神隠し'), false);
  assert.equal(istLateinisch('Dilwale दुल्हनिया'), false);
  assert.equal(istLateinisch('1899'), true);
  assert.equal(istLateinisch('8½'), true);
  assert.equal(istLateinisch('!!'), false);
  assert.equal(istLateinisch(''), false);
  assert.equal(istLateinisch(null), false);
});

test('englischAusOriginal: nur bei leerem title_en und lateinischem Original', () => {
  assert.equal(englischAusOriginal({ title_en: '', original_title: 'El Bola' }), 'El Bola');
  assert.equal(englischAusOriginal({ title_en: null, original_title: ' Airlift ' }), 'Airlift');
  assert.equal(englischAusOriginal({ title_en: 'The Ball', original_title: 'El Bola' }), null);
  assert.equal(englischAusOriginal({ title_en: '', original_title: 'ブラック' }), null);
  assert.equal(englischAusOriginal({ title_en: '', original_title: '' }), null);
});

test('vorschlagFehler', () => {
  assert.equal(vorschlagFehler('Spirited Away'), null);
  assert.equal(vorschlagFehler('  '), 'leer');
  assert.equal(vorschlagFehler('千と千尋'), 'nicht lateinisch');
  assert.equal(vorschlagFehler(5), 'kein Text');
});
