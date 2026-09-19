import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kurzfassung } from '../lib/seoRender.js';

const VIER_ABSCHNITTE = `### Worum es geht
Die Erde erstickt: Eine Pflanzenkrankheit hat den Weizen ausgeloescht.

### Entstehungsgeschichte
Das Projekt begann nicht bei Christopher Nolan.

### Hinter den Kulissen
Gedreht wurde auf 35-mm-Anamorph und IMAX.

### Einordnung & Wirkung
Der Film gewann den Oscar fuer die besten visuellen Effekte.`;

test('kurzfassung: Abschnittsmarker landen nicht in der Meta-Description', () => {
  const k = kurzfassung(VIER_ABSCHNITTE);
  assert.ok(!k.includes('###'), 'Marker im Snippet');
  assert.ok(!k.includes('Worum es geht'), 'Gliederungsueberschrift im Snippet');
  assert.ok(k.startsWith('Die Erde erstickt'), `unerwarteter Start: ${k}`);
});

test('kurzfassung: keine Zeilenumbrueche im Snippet', () => {
  assert.ok(!kurzfassung(VIER_ABSCHNITTE).includes('\n'));
  assert.ok(!kurzfassung('Erster Absatz.\n\nZweiter Absatz.').includes('\n'));
});

test('kurzfassung: kuerzt an der Wortgrenze und haengt Auslassungszeichen an', () => {
  const k = kurzfassung(VIER_ABSCHNITTE, 40);
  assert.ok(k.length <= 41, `zu lang: ${k.length}`);
  assert.ok(k.endsWith('…'));
  assert.ok(!k.includes('  '));
});

test('kurzfassung: Altformat ohne Marker bleibt unveraendert', () => {
  assert.equal(kurzfassung('Ein kurzer Redaktionstext.'), 'Ein kurzer Redaktionstext.');
});

test('kurzfassung: leer/undefined ergibt leeren String', () => {
  assert.equal(kurzfassung(''), '');
  assert.equal(kurzfassung(undefined), '');
});

test('seitePersonenHub: Karten verlinken, ohne Text noindex', async () => {
  const { seitePersonenHub } = await import('../lib/seoRender.js');
  const personen = [{ tmdbPersonId: 7, name: 'Ada Beispiel', slug: 'ada-beispiel', fotoPfad: '/x.jpg', anzahl: 12 }];
  const ohne = seitePersonenHub({ rolle: 'schauspieler', personen, text: null, indexierbar: false }, 'de-de');
  assert.match(ohne, /href="\/de-de\/schauspieler\/ada-beispiel-7"/);
  assert.match(ohne, /noindex/);
  const mit = seitePersonenHub({ rolle: 'schauspieler', personen, text: 'Einleitung.', indexierbar: true }, 'de-de');
  assert.doesNotMatch(mit, /noindex/);
});

test('seiteTitelDetail: nur Namen mit Schauspieler-Seite werden verlinkt', async () => {
  const { seiteTitelDetail } = await import('../lib/seoRender.js');
  const titel = {
    type: 'movie', title: 'Testfilm', slug: 'testfilm', tmdbId: 1, genres: [], streaming: {},
    regisseurFilme: [], aehnlicheTitel: [], bilder: [], castNames: [],
    besetzungRollen: [{ name: 'Ada Beispiel', rolle: 'Hero' }, { name: 'Bob Ohneseite', rolle: null }],
    schauspielerIds: new Map([['Ada Beispiel', 7]]),
  };
  const html = seiteTitelDetail(titel, 'de-de');
  assert.match(html, /<a href="\/de-de\/schauspieler\/ada-beispiel-7">Ada Beispiel<\/a>/);
  assert.doesNotMatch(html, /Bob Ohneseite<\/a>/);
});

test('seitePerson: Kurzprofil aus Katalogdaten, Brotkrumen ueber die Uebersicht', async () => {
  const { seitePerson } = await import('../lib/seoRender.js');
  const daten = {
    tmdbPersonId: 5, rolle: 'regisseur', name: 'Rita Regie', slug: 'rita-regie', biografie: null, fotoPfad: null,
    geburtstag: null, text: null, indexierbar: true,
    filmografie: [{ title: 'Alpha', year: 2001, tmdbId: 1, type: 'movie', slug: 'alpha' }, { title: 'Beta', year: 1999, tmdbId: 2, type: 'movie', slug: 'beta' }],
  };
  const html = seitePerson(daten, 'de-de');
  assert.match(html, /Rita Regie ist Regisseur\. Im MovieMatch-Katalog zählen zu den am besten bewerteten Titeln Alpha \(2001\) und Beta \(1999\)/);
  assert.match(html, /\/de-de\/regisseur"/);
  assert.doesNotMatch(html, /noindex/);
});

test('Footer: SEO-Seiten und App-Footer (index.html) verlinken dieselben Uebersichten', async () => {
  const { FOOTER_BEREICHE, seite404 } = await import('../lib/seoRender.js');
  const { readFileSync } = await import('node:fs');
  const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const nav = index.match(/<nav class="footer-seo"[\s\S]*?<\/nav>/)[0];
  const appLinks = [...nav.matchAll(/href="\/de-de\/([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(appLinks, FOOTER_BEREICHE.map(([pfad]) => pfad));
  const html = seite404('de-de');
  for (const [pfad] of FOOTER_BEREICHE) assert.match(html, new RegExp(`<footer>[\\s\\S]*href="/de-de/${pfad}"`));
});
