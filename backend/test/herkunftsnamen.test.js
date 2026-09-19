import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  landName, landAus, landSlug, sprachName, sprachSlug, codeAusLandSlug, codeAusSprachSlug, landHatSeite, spracheHatSeite,
} from '../lib/herkunftsnamen.js';

test('Laender: Namen, Slugs und Rueckwaertsaufloesung', () => {
  assert.equal(landName('US'), 'USA');
  assert.equal(landAus('US'), 'aus den USA');
  assert.equal(landAus('FR'), 'aus Frankreich');
  assert.equal(codeAusLandSlug(landSlug('FR')), 'FR');
  assert.equal(codeAusLandSlug(landSlug('US')), 'US');
  assert.equal(landHatSeite('XX'), false);
  assert.equal(landHatSeite('DE'), true);
});

test('Sprachen: Namen und Rueckwaertsaufloesung', () => {
  assert.equal(sprachName('fr'), 'Französisch');
  assert.equal(codeAusSprachSlug(sprachSlug('fr')), 'fr');
  assert.equal(sprachName('cn'), 'Kantonesisch');
  assert.equal(spracheHatSeite('xx'), false);
  assert.equal(spracheHatSeite('en'), true);
});

test('Laender mit Artikel', () => {
  assert.equal(landAus('CH'), 'aus der Schweiz');
  assert.equal(landAus('IR'), 'aus dem Iran');
  assert.equal(landAus('TR'), 'aus der Türkei');
});
