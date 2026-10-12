import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { GENRE_NAMEN_ALLE } from '../lib/genreNamen.js';

// index.html bleibt die Quelle der App-Texte; die Backend-Kopie darf nicht abweichen.
test('genreNamen.js entspricht GENRE_EN/GENRE_NAMEN in index.html', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const en = html.match(/var GENRE_EN = \{[\s\S]*?\n\};/)[0];
  const nm = html.match(/var GENRE_NAMEN = \{[\s\S]*?\n\};/)[0];
  const c = {};
  vm.createContext(c);
  vm.runInContext(`${en}\n${nm}\nthis.ER=JSON.stringify({en:GENRE_EN, ...GENRE_NAMEN});`, c);
  assert.deepEqual(GENRE_NAMEN_ALLE, JSON.parse(c.ER));
});
