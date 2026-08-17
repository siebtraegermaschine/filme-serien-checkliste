// Sichert die dauerhafte Indexierungsregel ab (Christian, 17.08.2026):
// Eine Seite traegt genau dann "index", wenn sie eigenen Inhalt hat.
// Angelegte URLs ohne Inhalt bleiben erreichbar, tragen aber "noindex" --
// und kippen automatisch auf "index", sobald ein Text vorliegt.
//
// Diese Tests laufen ohne Datenbank: sie fuettern die Render-Funktionen
// direkt mit `indexierbar: true/false`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { seiteTitelDetail, seiteGenre, seite404, dokument } from '../lib/seoRender.js';

const robotsVon = (html) => {
  const treffer = html.match(/<meta name="robots" content="([^"]+)">/);
  return treffer ? treffer[1] : null;
};

const titelBasis = (indexierbar) => ({
  type: 'movie',
  tmdbId: 1,
  slug: 'beispielfilm',
  title: 'Beispielfilm',
  year: 2020,
  genres: [],
  besetzung: [],
  streaming: { flatrate: [], rent: [], buy: [] },
  kinos: [],
  regisseurFilme: [],
  aehnlicheTitel: [],
  bewertungen: [],
  text: indexierbar ? 'Ein eigener Text.' : null,
  indexierbar,
});

const genreBasis = (indexierbar) => ({
  genre: 'Drama',
  genreSlug: 'drama',
  type: 'movie',
  titel: [],
  seite: 1,
  seiten: 1,
  gesamt: indexierbar ? 1 : 0,
  text: indexierbar ? 'Ein eigener Text.' : null,
  indexierbar,
});

test('Titelseite mit eigenem Inhalt ist indexierbar', () => {
  assert.equal(robotsVon(seiteTitelDetail(titelBasis(true), 'de-de')), 'index,follow');
});

test('Titelseite ohne eigenen Inhalt bleibt erreichbar, aber noindex', () => {
  const robots = robotsVon(seiteTitelDetail(titelBasis(false), 'de-de'));
  assert.equal(robots, 'noindex,follow');
  // "follow" muss stehen bleiben: der Crawler soll den Links weiter folgen
  // duerfen und die Seite ueberhaupt abrufen koennen, um das noindex zu lesen.
  assert.match(robots, /follow$/);
});

test('Listenseite folgt derselben Regel', () => {
  assert.equal(robotsVon(seiteGenre(genreBasis(false), 'de-de')), 'noindex,follow');
  assert.equal(robotsVon(seiteGenre(genreBasis(true), 'de-de')), 'index,follow');
});

test('Folgeseiten einer Liste bleiben noindex, auch mit Inhalt', () => {
  const seite2 = { ...genreBasis(true), seite: 2, seiten: 3 };
  assert.equal(robotsVon(seiteGenre(seite2, 'de-de')), 'noindex,follow');
});

test('404-Seite ist niemals indexierbar', () => {
  assert.equal(robotsVon(seite404('de-de')), 'noindex,follow');
});

test('dokument() setzt robots ausschliesslich nach indexierbar', () => {
  const bauen = (indexierbar) => dokument({
    locale: 'de-de',
    pfad: '/de-de/test',
    titelZeile: 'Test',
    beschreibung: 'Test',
    indexierbar,
    jsonLd: {},
    bodyHtml: '<p>x</p>',
  });
  assert.equal(robotsVon(bauen(true)), 'index,follow');
  assert.equal(robotsVon(bauen(false)), 'noindex,follow');
});
