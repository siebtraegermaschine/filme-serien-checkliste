// Smoke-Test gegen die Live-Seite (nur GET, keine Anmeldung, <= ~1,4 Req/s).
// Aufruf: node --test tests/smoke/    (Basis ueberschreibbar: SMOKE_BASE=...)
// Reines fetch + Regex statt Playwright: die SEO-Seiten sind serverseitig
// erzeugt, ein Browser brachte hier nur Installationsaufwand in der CI.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { hole, parseSeite, drossel, locs, istIndexierbar } from '../../backend/scripts/lib/seo-crawl.mjs';

const BASIS = (process.env.SMOKE_BASE || 'https://movietaste.de').replace(/\/$/, '');
const L = 'de-de';
const warten = drossel(700);
const abruf = (pfad, opt) => hole(pfad.startsWith('http') ? pfad : BASIS + pfad, { warten, ...opt });

const sitemap = {};
const proben = {};

before(async () => {
  const idx = await abruf('/sitemap-index.xml');
  assert.equal(idx.status, 200, 'Sitemap-Index erreichbar');
  sitemap.index = locs(idx.body);
  // Titel-Sitemap ist in Teile (titel, titel-2, ...) gesplittet; Serien stehen erst in Teil 2.
  sitemap.titel = [];
  for (const u of sitemap.index.filter((x) => /\/sitemap-de-de-titel(-\d+)?\.xml$/.test(x))) {
    const r = await abruf(u);
    assert.equal(r.status, 200, `Sitemap ${u} erreichbar`);
    sitemap.titel.push(...locs(r.body));
  }
  for (const bereich of ['genre', 'anbieter', 'bestenliste', 'reihe', 'hub', 'kino_stadt']) {
    const r = await abruf(`/sitemap-${L}-${bereich}.xml`);
    assert.equal(r.status, 200, `Sitemap ${bereich} erreichbar`);
    sitemap[bereich] = locs(r.body);
  }
  const pfad = (u) => new URL(u).pathname;
  proben.film = pfad(sitemap.titel.find((u) => u.includes('/film/')));
  proben.serie = pfad(sitemap.titel.find((u) => u.includes('/serie/')));
  proben.genre = pfad(sitemap.genre[0]);
  proben.anbieter = pfad(sitemap.anbieter[0]);
  proben.bestenliste = pfad(sitemap.bestenliste[0]);
  proben.reihe = pfad(sitemap.reihe[0]);
  proben.neuAnbieter = sitemap.hub.map(pfad).find((p) => /\/neu-auf\/[^/]+$/.test(p));
  proben.stadt = sitemap.kino_stadt[0] ? pfad(sitemap.kino_stadt[0]) : null;
});

// Seiten, die in der Sitemap stehen: 200, indexierbar, Canonical = eigene URL.
async function pruefeSeite(pfad, { index = true } = {}) {
  const r = await abruf(pfad);
  assert.equal(r.status, 200, `${pfad}: Status ${r.status}`);
  assert.equal(r.kette.length, 0, `${pfad}: unerwartete Weiterleitung`);
  const p = parseSeite(r.body);
  assert.ok(p.title && p.title.length > 3, `${pfad}: <title> fehlt`);
  assert.ok(p.h1.length >= 1, `${pfad}: <h1> fehlt`);
  assert.ok(p.canonical, `${pfad}: canonical fehlt`);
  assert.equal(p.canonical, 'https://movietaste.de' + pfad,`${pfad}: canonical`);
  assert.ok(p.robots, `${pfad}: robots-Meta fehlt`);
  assert.equal(istIndexierbar(p.robots), index, `${pfad}: robots="${p.robots}"`);
  return p;
}

const seiten = [
  ['Startseite /', () => '/'],
  ['App /app', () => '/app'],
  ['Start /de-de/', () => `/${L}/`],
  ['Film', () => proben.film],
  ['Serie', () => proben.serie],
  ['Genre', () => proben.genre],
  ['Anbieter', () => proben.anbieter],
  ['Streaming-Hub', () => `/${L}/streaming`],
  ['Bestenlisten-Uebersicht', () => `/${L}/bestenlisten`],
  ['Bestenliste (beste-filme)', () => `/${L}/beste-filme`],
  ['Bestenliste einzeln', () => proben.bestenliste],
  ['Reihen-Uebersicht', () => `/${L}/reihen`],
  ['Reihe', () => proben.reihe],
  ['Neu auf (Uebersicht)', () => `/${L}/neu-auf`],
  ['Neu auf Anbieter', () => proben.neuAnbieter],
  ['Kino-Hub', () => `/${L}/kino`],
];
for (const [name, pfadFn] of seiten) {
  test(`Seite ${name}: 200, Canonical, robots index, H1`, async () => {
    const pfad = pfadFn();
    assert.ok(pfad, 'keine Probe-URL aus der Sitemap');
    // Die Startseite "/" ist die App (index.html) und hat keine H1 in der SEO-Form.
    if (pfad === '/' || pfad === '/app') {
      const r = await abruf('/');
      assert.equal(r.status, 200);
      assert.ok(parseSeite(r.body).title);
      assert.match(r.body, /<meta name="robots" content="noindex,follow">/);
      return;
    }
    await pruefeSeite(pfad);
  });
}

test('Kino-Neustarts: 200 und robots passt zur Sitemap', async () => {
  const pfad = `/${L}/kino/neustarts`;
  const inSitemap = sitemap.hub.some((u) => u.endsWith(pfad));
  await pruefeSeite(pfad, { index: inSitemap });
});

test('Kino-Stadt (falls vorhanden)', async (t) => {
  if (!proben.stadt) return t.skip('keine Stadt in der Sitemap');
  await pruefeSeite(proben.stadt);
});

test('Sitemap-Index: alle Unter-Sitemaps erreichbar und nicht leer', async () => {
  assert.ok(sitemap.index.length >= 8, 'Index listet zu wenige Sitemaps');
  for (const u of sitemap.index) {
    const r = await abruf(u.replace('https://movietaste.de', BASIS));
    assert.equal(r.status, 200, `${u}: Status ${r.status}`);
    assert.ok(locs(r.body).length > 0, `${u}: leer`);
  }
});

test('erfundene URLs liefern 404 (nicht 200 und kein 5xx)', async () => {
  for (const pfad of [`/${L}/film/gibt-es-nicht-999999999`, `/${L}/filme/kein-genre-xyz`, `/${L}/reihen/keine-reihe-xyz`, `/${L}/neu-auf/kein-anbieter-xyz`]) {
    const r = await abruf(pfad);
    assert.equal(r.status, 404, `${pfad}: Status ${r.status}`);
    assert.ok(!istIndexierbar(parseSeite(r.body).robots), `${pfad}: 404-Seite muss noindex sein`);
  }
});

test('robots.txt: erreichbar, nennt die Sitemap', async () => {
  const r = await abruf('/robots.txt');
  assert.equal(r.status, 200);
  assert.match(r.body, /Sitemap:\s*https:\/\/movietaste\.de\/sitemap-index\.xml/);
  assert.match(r.body, /Allow:\s*\/de-de\//);
});

test('kein 5xx auf Rechtstexten und Assets', async () => {
  for (const pfad of ['/impressum.html', '/datenschutz.html', '/nutzungsbedingungen.html', '/seo.css', '/og-image.png', '/manifest.json']) {
    const r = await abruf(pfad, { text: false });
    assert.ok(r.status > 0 && r.status < 400, `${pfad}: Status ${r.status}`);
  }
});

test('Weiterleitung: Slash am Ende landet in genau einem Sprung', async () => {
  const r = await abruf(`/${L}/filme/`);
  assert.ok(r.kette.length <= 1, `Kette zu lang: ${JSON.stringify(r.kette)}`);
  assert.equal(r.status, 200);
});
