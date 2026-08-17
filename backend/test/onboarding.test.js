import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sauberSchauverhalten, sauberGenres, titelStufe, aggregatRegion, aggregatZaehlen,
  GENRES_MINDESTENS,
} from '../lib/onboarding.js';

test('sauberSchauverhalten: nur bekannte Werte, Vorgabereihenfolge, ohne Dubletten', () => {
  assert.deepEqual(sauberSchauverhalten(['kino', 'selten', 'kino']), ['selten', 'kino']);
});

test('sauberSchauverhalten: unbekannte Werte fallen still weg', () => {
  assert.deepEqual(sauberSchauverhalten(['kino', 'ausgedacht']), ['kino']);
  // Bleibt nichts uebrig, ist der Schritt nicht beantwortet.
  assert.equal(sauberSchauverhalten(['ausgedacht']), null);
});

test('sauberSchauverhalten: leer, kein Array, falscher Typ ergibt null', () => {
  assert.equal(sauberSchauverhalten([]), null);
  assert.equal(sauberSchauverhalten('kino'), null);
  assert.equal(sauberSchauverhalten(undefined), null);
});

test('sauberGenres: erst ab der Mindestzahl gueltig', () => {
  const drei = ['Action', 'Drama', 'Horror'];
  assert.equal(drei.length, GENRES_MINDESTENS);
  assert.deepEqual(sauberGenres(drei), drei);
  assert.equal(sauberGenres(['Action', 'Drama']), null);
});

test('sauberGenres: Themen-Schlagwoerter zaehlen mit, Erfundenes nicht', () => {
  assert.deepEqual(
    sauberGenres(['Action', 'thema:TrueCrime', 'thema:Zeitreise']),
    ['Action', 'thema:TrueCrime', 'thema:Zeitreise']
  );
  // Zwei gueltige plus ein erfundenes bleiben unter der Mindestzahl.
  assert.equal(sauberGenres(['Action', 'Drama', 'Wunschgenre']), null);
});

test('titelStufe: Stufen statt exakter Zahl', () => {
  assert.equal(titelStufe(0), 'unter-5');
  assert.equal(titelStufe(4), 'unter-5');
  assert.equal(titelStufe(5), '5-9');
  assert.equal(titelStufe(9), '5-9');
  assert.equal(titelStufe(10), '10-14');
  assert.equal(titelStufe(14), '10-14');
  assert.equal(titelStufe(15), '15+');
  assert.equal(titelStufe(99), '15+');
});

test('aggregatRegion: nur zweistellige Grossbuchstaben, sonst XX', () => {
  assert.equal(aggregatRegion('DE'), 'DE');
  assert.equal(aggregatRegion('de'), 'XX');
  assert.equal(aggregatRegion(''), 'XX');
  assert.equal(aggregatRegion(null), 'XX');
  assert.equal(aggregatRegion('DEU'), 'XX');
});

test('aggregatZaehlen: eine Abfrage, Dubletten zusammengefasst', async () => {
  const gesehen = [];
  const client = { query: (sql, werte) => { gesehen.push({ sql, werte }); return { rows: [] }; } };
  await aggregatZaehlen(client, 'genre', ['Action', 'Drama', 'Action'], 'DE');
  assert.equal(gesehen.length, 1);
  assert.deepEqual(gesehen[0].werte, ['genre', ['Action', 'Drama'], 'DE']);
});

test('aggregatZaehlen: ohne Antworten passiert nichts', async () => {
  const client = { query: () => { throw new Error('haette nicht abfragen duerfen'); } };
  await aggregatZaehlen(client, 'genre', [], 'DE');
  await aggregatZaehlen(client, 'genre', undefined, 'DE');
});
