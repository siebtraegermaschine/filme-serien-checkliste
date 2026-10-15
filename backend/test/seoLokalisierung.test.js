// Mehrsprachige SEO-Seiten: Chrome-Texte, noindex ohne lokalisierten Text,
// hreflang und Routenbegrenzung. Ohne Datenbank, ausser wo vermerkt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seiteStreamingHub, seitePerson, seitePersonenHub, seiteTitelDetail, seiteStart, seite404, seiteFilmeSerienHub, seiteBestenlistenUebersicht } from '../lib/seoRender.js';
import { SEO_TEXTE, ABSCHNITTE, seoTexte } from '../lib/seoTexte.js';
import { LOCALE_KONFIG, hatSeitenart, seitenartFuerPfad, titelTextReicht } from '../lib/seoLocale.js';
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

test('Nicht-de-Titelseite verlinkt keine Personen-Seiten (noch nicht lokalisiert)', () => {
  const html = seiteTitelDetail(titel('Text'), 'es-es');
  for (const pfad of ['/es-es/regisseur/', '/es-es/schauspieler/']) {
    assert.ok(!html.includes(`href="${pfad}`), pfad);
  }
  assert.doesNotMatch(html, /impressum\.html/);
  assert.match(html, /imprint\.html/);
});

test('Nicht-de: index ab 250 Zeichen Text, darunter und ohne Text noindex', () => {
  const lang = 'Ein ausreichend langer Text. '.repeat(10);
  for (const locale of ['es-es', 'it-it', 'nl-nl', 'pt-pt']) {
    assert.equal(meta(seiteTitelDetail(titel(lang), locale), 'robots'), 'index,follow', locale);
    // Laengen-Schwelle entscheidet seoData (daten.indexierbar), der Renderer folgt dem Flag.
    assert.equal(titelTextReicht(locale, 'Ein Text.'), false, locale);
    assert.equal(meta(seiteTitelDetail(titel('Ein Text.', { indexierbar: false }), locale), 'robots'), 'noindex,follow', locale);
    assert.equal(meta(seiteTitelDetail(titel(null, { indexierbar: false }), locale), 'robots'), 'noindex,follow', locale);
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

test('hreflang: x-default zeigt auf de-de, Cluster nur aus Locales mit Text', () => {
  const html = seiteTitelDetail(titel('Text', { textLocales: ['de-de', 'en-gb', 'es-es'] }), 'es-es');
  assert.match(html, /hreflang="de-DE" href="https:\/\/movietaste\.de\/de-de\/film\/beispiel-7"/);
  assert.match(html, /hreflang="x-default" href="https:\/\/movietaste\.de\/de-de\/film\/beispiel-7"/);
  assert.match(html, /hreflang="en-GB"/);
  assert.match(html, /hreflang="es-ES" href="https:\/\/movietaste\.de\/es-es\/film\/beispiel-7"/);
  assert.doesNotMatch(html, /hreflang="it-IT"/); // kein Text in it-it
});

test('Startseite und 404 sind lokalisiert; Start ohne Text ist noindex', () => {
  const start = seiteStart({ text: null, indexierbar: false }, 'fr-fr');
  assert.match(start, /<html lang="fr">/);
  assert.match(start, /Films et séries en un coup d’œil/);
  assert.equal(meta(start, 'robots'), 'noindex,follow');
  assert.doesNotMatch(start, /class="einleitung"/); // ohne Text kein Absatz
  assert.doesNotMatch(start, /"hasPart":\[\]/); // leeres Array waere JSON-LD-Fehler
  assert.match(seite404('nl-nl'), /Pagina niet gevonden/);
});

test('Seitenarten: Nicht-de kennt Personen nur in en-gb/fr-fr; Sitemap-Bereiche', () => {
  assert.equal(seitenartFuerPfad('/en-gb/film/x-1'), 'titel');
  assert.equal(seitenartFuerPfad('/en-gb'), 'start');
  assert.equal(seitenartFuerPfad('/en-gb/filme/drama'), 'filme');
  assert.equal(seitenartFuerPfad('/en-gb/schauspieler/x-1'), 'schauspieler');
  assert.ok(hatSeitenart('de-de', 'person'));
  assert.ok(hatSeitenart('en-gb', 'titel') && hatSeitenart('en-gb', 'start'));
  assert.ok(hatSeitenart('en-gb', 'filme') && hatSeitenart('en-gb', 'bestenlisten') && hatSeitenart('en-gb', 'person') && !hatSeitenart('es-es', 'person'));
  assert.deepEqual(BEREICHE.filter((b) => bereichFuerLocale('en-gb', b)), ['titel', 'genre', 'anbieter', 'bestenliste', 'hub', 'person', 'reihe']);
  assert.deepEqual(BEREICHE.filter((b) => bereichFuerLocale('de-de', b)), BEREICHE);
});

test('Nicht-EWR-Locales sind inaktiv und nicht indexierbar', () => {
  for (const l of ['pt-br']) assert.deepEqual([LOCALE_KONFIG[l].aktiv, LOCALE_KONFIG[l].indexierbar], [false, false]);
  assert.ok(seoTexte('pt-br').start);
});

test('Route: Personen-Seiten in Nicht-de liefern 404 (ohne DB), inaktive Locales gehen durch', async () => {
  const { default: express } = await import('express');
  const { default: router } = await import('../routes/seo.js');
  const app = express();
  app.use(router);
  app.use((req, res) => res.status(200).send('DURCHGEREICHT'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const { port } = server.address();
  try {
    for (const pfad of ['/es-es/regisseur/x-1', '/es-es/schauspieler/x-1', '/it-it/schauspieler/x-1', '/fr-fr/personen']) {
      const a = await fetch(`http://127.0.0.1:${port}${pfad}`);
      assert.equal(a.status, 404, pfad);
      assert.match(await a.text(), /<html lang="/);
    }
    const a = await fetch(`http://127.0.0.1:${port}/pt-br`);
    assert.equal(await a.text(), 'DURCHGEREICHT');
  } finally {
    server.close();
  }
});

test('Nicht-de-Hubs: index, hreflang-Cluster, ohne Text kein Einleitungsabsatz, lokale Links, de-de behaelt Absatz', () => {
  const daten = { text: null, indexierbar: true, type: 'movie', genres: [], titel: [] };
  const html = seiteFilmeSerienHub(daten, 'es-es', 'filme');
  assert.equal(meta(html, 'robots'), 'index,follow');
  assert.match(html, /hreflang="de-DE" href="https:\/\/movietaste\.de\/de-de\/filme"/);
  assert.match(html, /hreflang="es-ES" href="https:\/\/movietaste\.de\/es-es\/filme"/);
  assert.doesNotMatch(html, /class="einleitung"/);
  assert.match(html, /href="\/es-es\/(bestenlisten|streaming)/);
  const mit = seiteFilmeSerienHub({ ...daten, text: 'Texte.' }, 'es-es', 'filme');
  assert.match(mit, /class="einleitung"/);
  assert.match(seiteFilmeSerienHub(daten, 'de-de', 'filme'), /class="einleitung"/);
});

test('Nicht-de-Bestenlisten-Uebersicht und Reihen-Uebersicht liefern 200-taugliches HTML in der Sprache', () => {
  const b = seiteBestenlistenUebersicht({ text: null, indexierbar: true, katalog: null }, 'it-it');
  assert.match(b, /<html lang="it">/);
  assert.equal(meta(b, 'robots'), 'index,follow');
  assert.doesNotMatch(b, /Bestenlisten/);
});

test('Personenseite en-gb/fr-fr: uebersetzte Ueberschriften, index (Locale indexierbar), deutsch unveraendert', () => {
  const basis = { tmdbPersonId: 7, rolle: 'regisseur', name: 'Ana Test', slug: 'ana-test', biografie: 'Deutsche Bio', fotoPfad: null,
    geburtstag: '1974-02-12', filmografie: [{ id: '1', tmdbId: 1, type: 'movie', slug: 'x', title: 'X', year: 2000 }], indexierbar: true };
  const en = seitePerson({ ...basis, text: '### Career\n\nShe directed films.\n\n### Filmography in our catalogue\n\nOne title.\n\n### Assessment\n\nGood.' }, 'en-gb');
  assert.match(en, /<h2>Career<\/h2>/);
  assert.match(en, /<h2>Filmography<\/h2>|<h2>Filmography \(as director\)<\/h2>/);
  assert.match(en, /Director · born 1974-02-12/);
  assert.equal(meta(en, 'robots'), 'index,follow');
  assert.doesNotMatch(en, /Deutsche Bio/);
  const fr = seitePerson({ ...basis, text: '### Parcours\n\nElle réalise.\n\n### Filmographie chez nous\n\nUn titre.\n\n### Analyse\n\nBien.' }, 'fr-fr');
  assert.match(fr, /<h2>Parcours<\/h2>/);
  const de = seitePerson({ ...basis, text: '### Werdegang\n\nText.\n\n### Filmografie bei uns\n\nEin Titel.\n\n### Einordnung\n\nGut.' }, 'de-de');
  assert.match(de, /<h2>Werdegang<\/h2>/);
  assert.match(de, /hreflang="de-DE"/);
  const hub = seitePersonenHub({ rolle: 'regisseur', personen: [{ name: 'Ana', slug: 'ana', tmdbPersonId: 7, fotoPfad: null, anzahl: 2 }], text: null, indexierbar: true }, 'en-gb');
  assert.match(hub, /<h1>Directors<\/h1>/);
  assert.match(hub, /2 titles/);
});

test('Laender-Locales: de-at deutsch mit deutschem Chrome, en-ca englisch, beide index mit eigenem Canonical', () => {
  const at = seiteTitelDetail(titel('Ein deutscher Text. '.repeat(20), { textLocales: ['de-de', 'de-at', 'de-ch'] }), 'de-at');
  assert.match(at, /<html lang="de">/);
  assert.equal(meta(at, 'robots'), 'index,follow');
  assert.match(at, /href="\/de-at\/filme"/);
  assert.match(at, /impressum\.html/);
  assert.match(at, /rel="canonical" href="https:\/\/movietaste\.de\/de-at\/film\/beispiel-7"/); // eigener Canonical je Landesversion
  assert.match(at, /hreflang="de-AT" href="https:\/\/movietaste\.de\/de-at\/film\/beispiel-7"/);
  assert.match(at, /hreflang="de-CH"/);
  const ca = seiteTitelDetail(titel('An English text. '.repeat(20), { textLocales: ['en-gb', 'en-ca', 'en-us'] }), 'en-ca');
  assert.match(ca, /<html lang="en">/);
  assert.equal(meta(ca, 'robots'), 'index,follow');
  assert.match(ca, /imprint\.html/);
});

test('Region-Seiten: Streaming-Hub nur Self-hreflang, kein x-default; Start-Links locale-eigen', () => {
  const html = seiteStreamingHub({ text: null, anbieter: [], indexierbar: true }, 'en-gb');
  assert.equal((html.match(/rel="alternate" hreflang=/g) || []).length, 1);
  assert.match(html, /hreflang="en-GB" href="https:\/\/movietaste\.de\/en-gb\/streaming"/);
  assert.doesNotMatch(html, /x-default/);
  assert.match(html, /class="marke" href="https:\/\/movietaste\.de\/en-gb\/"/);
  assert.doesNotMatch(html, /href="https:\/\/movietaste\.de\/"/);
});

test('Titel-hreflang: Slug je Locale aus dem Rohtitel (Akzente)', () => {
  const html = seiteTitelDetail(titel('Text', { title: 'Amélie', slug: 'amelie', slugBasis: 'Amélie', textLocales: ['de-de', 'en-gb'] }), 'en-gb');
  const de = html.match(/hreflang="de-DE" href="([^"]*)"/)[1];
  const en = html.match(/hreflang="en-GB" href="([^"]*)"/)[1];
  assert.match(de, /\/de-de\/film\/am-lie-7$|\/de-de\/film\/amelie-7$/);
  assert.match(en, /\/en-gb\/film\/amelie-7$/);
  assert.match(html, /hreflang="x-default" href="[^"]*\/de-de\/film\//);
});

test('gegenstueck: Partner, gleiche Uebersicht, sonst Start des Ziellandes', async () => {
  const { gegenstueck } = await import('../lib/seoLocale.js');
  const alt = [{ locale: 'de-de', pfad: '/de-de/film/a-1' }, { locale: 'en-gb', pfad: '/en-gb/film/a-1' }];
  assert.equal(gegenstueck('en-gb', 'de-de', '/de-de/film/a-1', alt), '/en-gb/film/a-1');
  assert.equal(gegenstueck('fr-fr', 'de-de', '/de-de/film/a-1', alt), '/fr-fr/');
  assert.equal(gegenstueck('en-gb', 'de-de', '/de-de/streaming', undefined), '/en-gb/streaming');
  assert.equal(gegenstueck('de-at', 'de-de', '/de-de/filme/drama', undefined), '/de-at/filme/drama');
  assert.equal(gegenstueck('en-gb', 'de-de', '/de-de/streaming/netflix', undefined), '/en-gb/');
  assert.equal(gegenstueck('en-gb', 'de-de', '/de-de/kino/berlin', undefined), '/en-gb/');
  assert.equal(gegenstueck('en-gb', 'de-de', '/de-de/bestenlisten?seite=2', undefined), '/en-gb/');
  assert.equal(gegenstueck('es-es', 'de-de', '/de-de/schauspieler', undefined), '/es-es/');
});

test('Kopf- und Fusszeile: locale zur App, Flaggen fuehren zum Gegenstueck', () => {
  const html = seiteStreamingHub({ anbieter: [], text: null, indexierbar: true }, 'en-gb');
  assert.match(html, /href="https:\/\/movietaste\.de\/\?von=app&amp;locale=en-gb"/);
  const flaggen = html.match(/<nav class="footer-laender"[\s\S]*?<\/nav>/)[0];
  assert.match(flaggen, /href="\/de-de\/streaming" data-locale="de-de"/);
  assert.match(flaggen, /href="\/fr-fr\/streaming" data-locale="fr-fr"/);
  const titelHtml = seiteTitelDetail(titel('x'.repeat(300)), 'en-gb');
  assert.match(titelHtml, /\/t\/movie\/7\?von=titel&amp;locale=en-gb/);
});
