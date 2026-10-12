import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uebersetzungPruefen, zahlenIn, markenIn, titelIn } from '../scripts/seo-kategorien-uebersetzen.mjs';

const DE = 'Im MovieMatch-Katalog stehen über 27.000 Filme. Die TMDB-Bewertung liegt bei 7,6 von 10. An der Spitze steht „Vikings“.\n\nAdresse und Website stammen aus OpenStreetMap.';

test('Zahlen und Marken werden normalisiert erkannt', () => {
  assert.deepEqual(zahlenIn('27.000 und 7,6 und 1962 bis 2025'), ['27000', '76', '1962', '2025']);
  assert.deepEqual(zahlenIn('27,000 / 27 000 / 7.6'), ['27000', '27000', '76']);
  assert.deepEqual(markenIn('MovieMatch TMDB-Bewertung OpenStreetMap Kino AMC'), ['MovieMatch', 'TMDB', 'OpenStreetMap', 'AMC']);
  assert.deepEqual(titelIn('führt „Vikings“ und „Shōgun“ an'), ['Vikings', 'Shōgun']);
});

test('gute Uebersetzung besteht', () => {
  const en = 'The MovieMatch catalogue holds over 27,000 films. The TMDB rating averages 7.6 out of 10. “Vikings” tops the list.\n\nAddress and website come from OpenStreetMap.';
  assert.deepEqual(uebersetzungPruefen(DE, en, 'en-gb'), []);
});

test('Fehler werden erkannt', () => {
  const ok = 'The MovieMatch catalogue holds over 27,000 films. The TMDB rating averages 7.6 out of 10. “Vikings” tops the list.\n\nAddress and website come from OpenStreetMap.';
  assert.ok(uebersetzungPruefen(DE, ok.replace('27,000', '26,000'), 'en-gb').some((f) => f.startsWith('zahl')));
  assert.ok(uebersetzungPruefen(DE, ok.replace('Vikings', 'Wikinger'), 'en-gb').some((f) => f.startsWith('titel')));
  assert.ok(uebersetzungPruefen(DE, ok.replace('OpenStreetMap', 'a map'), 'en-gb').some((f) => f.startsWith('marke')));
  assert.ok(uebersetzungPruefen(DE, ok.replace('\n\n', ' '), 'en-gb').some((f) => f.startsWith('absaetze')));
  assert.ok(uebersetzungPruefen(DE, DE, 'en-gb').includes('deutsch'));
  assert.ok(uebersetzungPruefen(DE, 'Here is the translation:\n' + ok, 'en-gb').includes('vorrede'));
  assert.ok(uebersetzungPruefen(DE, '', 'en-gb').includes('leer'));
});

test('deutsche Titel in Anfuehrungszeichen loesen keinen Deutsch-Fehler aus', () => {
  const q = 'Top sind „Der Pate“ und „Der Herr der Ringe - Die Rückkehr des Königs“ mit über 100 Stimmen.';
  const z = 'Currently on top are "Der Pate" and "Der Herr der Ringe - Die Rückkehr des Königs" with over 100 votes.';
  assert.deepEqual(uebersetzungPruefen(q, z, 'en-gb'), []);
});
