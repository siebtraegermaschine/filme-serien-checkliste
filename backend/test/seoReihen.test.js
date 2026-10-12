// Reihen/Franchises: reine Funktionen (ohne DB), Analytics-Typ und Datenbank-Pfad
// (Schwelle, Reihenfolge, 404). Der DB-Teil nutzt Test-IDs ab 900_000_101.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';
import {
  reihenName, reihenSlugs, inErscheinungsreihenfolge, reihenFakten, bauReihenText, MIN_TITEL_REIHE,
} from '../lib/seoReihen.js';
import { ladeReihe, ladeReihenUebersicht, reihenFuerSitemap, reihenCacheLeeren } from '../lib/seoData.js';
import { seiteReihe, seiteReihenUebersicht } from '../lib/seoRender.js';
import { seoAufrufTyp } from '../routes/seo.js';

test('reihenName entfernt Filmreihe/Collection, behaelt sonst den Namen', () => {
  assert.equal(reihenName('Harry Potter Filmreihe'), 'Harry Potter');
  assert.equal(reihenName('James Bond Collection'), 'James Bond');
  assert.equal(reihenName('Der Herr der Ringe - Filmreihe'), 'Der Herr der Ringe');
  assert.equal(reihenName('Collection'), 'Collection');
  assert.equal(reihenName('  Matrix  '), 'Matrix');
});

test('reihenSlugs: Umlaute normalisiert, Kollision haengt die collection_id an', () => {
  const m = reihenSlugs([
    { id: 20, name: 'Männer Filmreihe' },
    { id: 10, name: 'Männer Collection' },
    { id: 30, name: '!!!' },
  ]);
  assert.equal(m.get(10), 'maenner');
  assert.equal(m.get(20), 'maenner-20');
  assert.equal(m.get(30), 'reihe-30');
});

test('inErscheinungsreihenfolge: Datum vor Jahr, dann TMDB-ID', () => {
  const l = inErscheinungsreihenfolge([
    { tmdbId: 3, year: 2005, erschienenAm: null },
    { tmdbId: 1, year: 2005, erschienenAm: '2005-06-01' },
    { tmdbId: 2, year: 1999, erschienenAm: '1999-03-31' },
    { tmdbId: 4, year: null, erschienenAm: null },
  ]);
  assert.deepEqual(l.map((t) => t.tmdbId), [2, 1, 3, 4]);
});

test('bauReihenText: nur Katalogfakten, Hinweis auf Erscheinungsreihenfolge', () => {
  const titel = [
    { title: 'A', year: 2001, rating: 7, note: 7, genres: ['Action'] },
    { title: 'B', year: 2003, rating: 8, note: 8, genres: ['Action', 'Drama'] },
    { title: 'C', year: 2005, rating: 6, note: 6, genres: ['Action'] },
  ];
  const text = bauReihenText('Testreihe', reihenFakten(titel));
  assert.match(text, /3 Filme, erschienen zwischen 2001 und 2005/);
  assert.match(text, /„B“ mit 8/);
  assert.match(text, /Action/);
  assert.match(text, /nicht die Reihenfolge der erzählten Handlung/);
});

test('seoAufrufTyp: Reihen-Uebersicht und Einzelreihe', () => {
  assert.equal(seoAufrufTyp('/de-de/reihen'), 'reihen');
  assert.equal(seoAufrufTyp('/de-de/reihen/harry-potter'), 'reihe');
});

const BASIS = 900_000_101;
const PRAEFIX = 'SEOREIHE ';
const CID = 990_001;

async function aufraeumen() {
  await pool.query(`DELETE FROM titles WHERE title LIKE $1`, [PRAEFIX + '%']);
  reihenCacheLeeren();
}

test('ladeReihe: Schwelle, Reihenfolge, Sitemap, Rendering', async (t) => {
  await aufraeumen();
  t.after(async () => { await aufraeumen(); });

  // Drei Filme (Schwelle erreicht), absichtlich in falscher Einfuegereihenfolge.
  const filme = [['Dritter', 2010, '2010-05-01'], ['Erster', 2000, '2000-01-15'], ['Zweiter', 2005, '2005-03-03']];
  for (const [i, [name, jahr, datum]] of filme.entries()) {
    await pool.query(
      `INSERT INTO titles (tmdb_id, type, title, year, genres, rating, vote_count, collection_id, collection_name, erschienen_am, collection_geprueft)
       VALUES ($1, 'movie', $2, $3, ARRAY['Drama'], 7.0, 5000, $4, 'SEOREIHE Testsaga Filmreihe', $5, true)`,
      [BASIS + i, PRAEFIX + name, jahr, CID, datum]
    );
  }
  // Eine zweite Reihe mit nur 2 Titeln bleibt unter der Schwelle.
  for (let i = 0; i < MIN_TITEL_REIHE - 1; i++) {
    await pool.query(
      `INSERT INTO titles (tmdb_id, type, title, year, genres, rating, vote_count, collection_id, collection_name, collection_geprueft)
       VALUES ($1, 'movie', $2, 2000, ARRAY['Drama'], 7.0, 5000, $3, 'SEOREIHE Klein Filmreihe', true)`,
      [BASIS + 10 + i, PRAEFIX + 'Klein ' + i, CID + 1]
    );
  }
  reihenCacheLeeren();

  const daten = await ladeReihe('seoreihe-testsaga', 'de-de');
  assert.ok(daten, 'Reihe ab 3 Titeln existiert');
  assert.deepEqual(daten.titel.map((x) => x.title.replace(PRAEFIX, '')), ['Erster', 'Zweiter', 'Dritter']);
  assert.equal(await ladeReihe('seoreihe-klein', 'de-de'), null, 'unter der Schwelle: kein Eintrag');
  assert.ok((await reihenFuerSitemap()).includes('seoreihe-testsaga'));
  assert.ok(!(await reihenFuerSitemap()).includes('seoreihe-klein'));

  const html = seiteReihe(daten, 'de-de');
  assert.match(html, /Filme in Erscheinungsreihenfolge/);
  assert.match(html, /rel="canonical" href="[^"]*\/de-de\/reihen\/seoreihe-testsaga"/);
  assert.match(html, /CollectionPage/);
  assert.match(html, /ItemList/);
  assert.ok(html.indexOf('Erster') < html.indexOf('Dritter'));

  const uebersicht = await ladeReihenUebersicht('de-de');
  assert.ok(uebersicht.reihen.some((r) => r.slug === 'seoreihe-testsaga'));
  assert.match(seiteReihenUebersicht(uebersicht, 'de-de'), /seoreihe-testsaga/);
});
