import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../lib/slug.js';

test('slugify: Umlaute und scharfes S', () => {
  assert.equal(slugify('Der Übeltäter'), 'der-uebeltaeter');
  assert.equal(slugify('Straße der Verlorenen'), 'strasse-der-verlorenen');
});

test('slugify: Sonderzeichen zu Bindestrich, keine Mehrfach-/Rand-Bindestriche', () => {
  assert.equal(slugify('Mission: Impossible - Fallout'), 'mission-impossible-fallout');
  assert.equal(slugify('  Vorne & Hinten!!  '), 'vorne-hinten');
});

test('slugify: leer/undefined ergibt leeren String', () => {
  assert.equal(slugify(''), '');
  assert.equal(slugify(undefined), '');
});
