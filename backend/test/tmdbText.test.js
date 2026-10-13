import test from 'node:test';
import assert from 'node:assert/strict';
import { tmdbText } from '../lib/tmdbText.js';

test('tmdbText ersetzt Doppelpunkt-Lookalikes', () => {
  assert.equal(tmdbText('Dragon Ball Z꞉ ¡La Derrota!'), 'Dragon Ball Z: ¡La Derrota!');
  assert.equal(tmdbText('A： B'), 'A: B');
});

test('tmdbText laesst Bindestriche und leere Werte in Ruhe', () => {
  assert.equal(tmdbText(' Spider-Man  Home '), 'Spider-Man Home');
  assert.equal(tmdbText(null), '');
});
