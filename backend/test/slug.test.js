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

test('slugify: de-de bleibt unveraendert (bestehende URLs), Akzente werden dort weiter zu Bindestrich', () => {
  assert.equal(slugify('Amélie'), 'am-lie');
  assert.equal(slugify('Amélie', 'de-de'), 'am-lie');
  assert.equal(slugify('Ciudad de México'), 'ciudad-de-m-xico');
});

test('slugify: neue Locales transliterieren Akzente und Sonderbuchstaben', () => {
  assert.equal(slugify('Amélie', 'fr-fr'), 'amelie');
  assert.equal(slugify('Ciudad de México', 'es-es'), 'ciudad-de-mexico');
  assert.equal(slugify('El Niño', 'es-es'), 'el-nino');
  assert.equal(slugify('Der Übeltäter', 'en-gb'), 'der-uebeltaeter');
  assert.equal(slugify('Ægir Søren Łódź', 'nl-nl'), 'aegir-soren-lodz');
  assert.equal(slugify('Œuvre', 'it-it'), 'oeuvre');
  assert.equal(slugify('Αθήνα', 'pt-pt'), ''); // nicht-lateinisch bleibt leer (wird vom Aufrufer verworfen)
});
