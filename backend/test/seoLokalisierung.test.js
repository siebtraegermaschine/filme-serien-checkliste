// Mehrsprachige SEO-Seiten: Chrome-Texte, noindex ohne lokalisierten Text,
// hreflang und Routenbegrenzung. Ohne Datenbank, ausser wo vermerkt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seiteTitelDetail, seiteStart, seite404 } from '../lib/seoRender.js';
import { SEO_TEXTE, ABSCHNITTE, seoTexte } from '../lib/seoTexte.js';
import { LOCALE_KONFIG, hatSeitenart, seitenartFuerPfad } from '../lib/seoLocale.js';
import { bereichFuerLocale, BEREICHE } from '../lib/seoSitemap.js';

const meta = (html, name) => (html.match(new RegExp(`<meta name="${name}" content="([^"]*)">`)) || [])[1];
const titel = (text, extra = {}) => ({
  type: 'movie', tmdbId: 7, slug: 'beispiel', title: 'Beispiel', year: 2020, rating: 7.5, voteCount: 1234,
  genres: ['Komödie', 'Krimi'], director: 'Ana Test', regisseurPersonId: 5, castNames: [], besetzungRollen: [],
  certification: '12', laufzeitMinuten: 100, budget: 1500000,
  streaming: { flatrate: [{ name: 'Netflix', anbieterSlug: 'netflix' }], rent: [], buy: [] },
  regisseurFilme: [{ tmdbId: 8, slug: 'anderer', title: 'Anderer', year: 2019 }], aehnlicheTitel: [],
  reihe: { slug: 'r', name: 'Reihe', anzahl: 3 },
  text, indexierbar: true, ...extra,
});

test('jede Sprache hat alle Schluessel der deutschen Referenz', () => {
  const ref = Object.keys(SEO_TEXTE.de);
  for (const [sprache, T] of Object.entries(SEO_TEXTE)) {
    assert.deepEqual(Object.keys(T).sort(), [...ref].sort(), `Schluessel in ${sprache}`);
    assert.deepEqual(Object.keys(T.bereiche).sort(), Object.keys(SEO_TEXTE.de.bereiche).sort());
  }
});

test('Abschnittsueberschriften stimmen mit dem Batch-Skript ueberein', async () => {
  const quelle = fs.readFileSync(new URL('../scripts/seo-batch.mjs', import.meta.url), 'utf8');
  const sprachen = { 'en-us': 'en', 'es-es': 'es', 'fr-fr': 'fr', 'it-it': 'it', 'nl-nl': 'nl', 'pt-pt': 'pt', 'de-de': 'de' };
  for (const [code, kurz] of Object.entries(sprachen)) {
    const zeile = quelle.split('\n').find((l) => l.includes(`'${code}': {`));
    assert.ok(zeile, code);
    for (const h of ABSCHNITTE[kurz]) assert.ok(zeile.includes(`'${h}'`), `${code}: ${h}`);
  }
});

test('Titelseite en-gb: englisch, lang=en, ohne deutsche Chrome-Texte', () => {
  const html = seiteTitelDetail(titel(null), 'en-gb');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Add to watchlist/);
  assert.match(html, /Runtime/);
  assert.match(html, /Comedy, Crime/);
  assert.doesNotMatch(html, /Kurzüberblick|Zur Watchlist|Verfügbar|Laufzeit|Komödie/);
});

test('Nicht-de-Titelseite verlinkt keine nicht lokalisierten Seitenarten', () => {
  const html = seiteTitelDetail(titel('Text'), 'es-es');
  for (const pfad of ['/es-es/filme', '/es-es/regisseur/', '/es-es/streaming/', '/es-es/reihen/']) {
    assert.ok(!html.includes(`href="${pfad}`), pfad);
  }
  assert.doesNotMatch(html, /impressum\.html/);
  assert.match(html, /imprint\.html/);
});

test('Nicht-de bleibt noindex, auch mit Text, solange die Locale nicht freigegeben ist', () => {
  for (const locale of ['en-gb', 'es-es', 'fr-fr', 'it-it', 'nl-nl', 'pt-pt']) {
    assert.equal(meta(seiteTitelDetail(titel('Ein Text.'), locale), 'robots'), 'noindex,follow', locale);
    assert.equal(meta(seiteTitelDetail(titel(null), locale), 'robots'), 'noindex,follow', locale);
  }
});

test('de-de verhaelt sich wie bisher (deutsche Texte, index)', () => {
  const html = seiteTitelDetail(titel('Ein Text.'), 'de-de');
  assert.equal(meta(html, 'robots'), 'index,follow');
  assert.match(html, /Kurzüberblick/);
  assert.match(html, /FSK 12/);
  assert.match(html, /1\.500\.000 \$/);
  assert.match(html, /href="\/de-de\/regisseur\//);
});

test('Zahlen folgen der Sprache (en: Punkt, de: Komma)', () => {
  assert.match(seiteTitelDetail(titel('x'), 'en-gb'), /7\.5 \(1,234 votes\)/);
  assert.match(seiteTitelDetail(titel('x'), 'de-de'), /7,5 \(1\.234 Stimmen\)/);
});

test('Vier-Abschnitte-Text in der Zielsprache erzeugt die lokalisierten Ueberschriften', () => {
  const text = `### ${ABSCHNITTE.es[0]}\nEs una peli.\n\n### ${ABSCHNITTE.es[3]}\nGanó premios.`;
  const html = seiteTitelDetail(titel(text), 'es-es');
  assert.match(html, new RegExp(`<h2>${ABSCHNITTE.es[0]}</h2>`));
  assert.match(html, /Ganó premios/);
});

test('hreflang: x-default zeigt auf de-de, Cluster nur aus indexierbaren Locales mit Text', () => {
  const html = seiteTitelDetail(titel('Text', { textLocales: ['de-de', 'en-gb', 'es-es'] }), 'en-gb');
  assert.match(html, /hreflang="de-DE" href="https:\/\/movietaste\.de\/de-de\/film\/beispiel-7"/);
  assert.match(html, /hreflang="x-default" href="https:\/\/movietaste\.de\/de-de\/film\/beispiel-7"/);
  assert.doesNotMatch(html, /hreflang="en-GB"/);
});

test('Startseite und 404 sind lokalisiert; Start ohne Text ist noindex', () => {
  const start = seiteStart({ text: null, indexierbar: true }, 'fr-fr');
  assert.match(start, /<html lang="fr">/);
  assert.match(start, /Films et séries en un coup d’œil/);
  assert.equal(meta(start, 'robots'), 'noindex,follow');
  assert.doesNotMatch(start, /start-bereiche/);
  assert.match(seite404('nl-nl'), /Pagina niet gevonden/);
});

test('Seitenarten: Nicht-de kennt nur Start und Titel; Sitemap folgt', () => {
  assert.equal(seitenartFuerPfad('/en-gb/film/x-1'), 'titel');
  assert.equal(seitenartFuerPfad('/en-gb'), 'start');
  assert.equal(seitenartFuerPfad('/en-gb/filme/drama'), 'filme');
  assert.ok(hatSeitenart('de-de', 'person'));
  assert.ok(hatSeitenart('en-gb', 'titel') && hatSeitenart('en-gb', 'start'));
  assert.ok(!hatSeitenart('en-gb', 'filme') && !hatSeitenart('en-gb', 'person'));
  assert.deepEqual(BEREICHE.filter((b) => bereichFuerLocale('en-gb', b)), ['titel', 'hub']);
  assert.deepEqual(BEREICHE.filter((b) => bereichFuerLocale('de-de', b)), BEREICHE);
});

test('Nicht-EWR-Locales sind inaktiv und nicht indexierbar', () => {
  for (const l of ['en-us', 'pt-br']) assert.deepEqual([LOCALE_KONFIG[l].aktiv, LOCALE_KONFIG[l].indexierbar], [false, false]);
  assert.equal(seoTexte('en-us').start, 'Home');
});

test('Route: nicht lokalisierte Arten in en-gb liefern 404 (ohne DB), inaktive Locales gehen durch', async () => {
  const { default: express } = await import('express');
  const { default: router } = await import('../routes/seo.js');
  const app = express();
  app.use(router);
  app.use((req, res) => res.status(200).send('DURCHGEREICHT'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const { port } = server.address();
  try {
    for (const pfad of ['/en-gb/filme', '/en-gb/filme/drama', '/es-es/streaming/netflix', '/fr-fr/bestenlisten', '/it-it/schauspieler/x-1']) {
      const a = await fetch(`http://127.0.0.1:${port}${pfad}`);
      assert.equal(a.status, 404, pfad);
      assert.match(await a.text(), /<html lang="/);
    }
    const a = await fetch(`http://127.0.0.1:${port}/en-us`);
    assert.equal(await a.text(), 'DURCHGEREICHT');
  } finally {
    server.close();
  }
});
