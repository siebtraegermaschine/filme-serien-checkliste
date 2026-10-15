/* Konsistenz Sitemap <-> Seite: jede Sitemap-URL liefert 200, index,follow und
 * canonical == loc; jeder Hub, der index,follow ausliefert, steht in der Sitemap.
 * Eigene Datei: die Caches (Sitemap, Hubs) leben im Prozess. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { pool } from '../db/pool.js';
import seoRouter from '../routes/seo.js';
import { bereichFuerLocale, BEREICHE } from '../lib/seoSitemap.js';
import { lokalisierePfade } from '../lib/seoPfade.js';
import { SEO_LOCALES, hatSeitenart } from '../lib/seoLocale.js';

// Startseiten-Texte aller Sprachen, damit der Start-Cluster in der leeren Testdatenbank vollstaendig ist.
const FIXTURE_LOCALES = ['en-gb', 'es-es', 'fr-fr', 'it-it', 'nl-nl', 'pt-pt'];
let eingefuegt = [];
before(async () => {
  for (const l of FIXTURE_LOCALES) {
    const { rowCount } = await pool.query(
      `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('hub', 'start', $1, 'SEOTEST Starttext')
       ON CONFLICT DO NOTHING`, [l]);
    if (rowCount) eingefuegt.push(l);
  }
});

const app = express();
app.set('trust proxy', 1); // jede Anfrage mit eigener Adresse, sonst greift das Mengenlimit
app.use(seoRouter);
const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
const BASIS = `http://127.0.0.1:${server.address().port}`;
const SITE = 'https://movietaste.de';

let zaehler = 0;
const holen = async (pfad) => {
  const ip = `10.${(++zaehler >> 16) & 255}.${(zaehler >> 8) & 255}.${zaehler & 255}`;
  const r = await fetch(BASIS + pfad, { redirect: 'manual', headers: { 'x-forwarded-for': ip } });
  return { status: r.status, html: await r.text() };
};
const robots = (html) => (html.match(/<meta name="robots" content="([^"]*)">/) || [])[1];
const canonical = (html) => (html.match(/<link rel="canonical" href="([^"]*)">/) || [])[1];
// Ueber HTTP, damit die Pfadwoerter so lokalisiert sind wie fuer Google.
const locs = async (locale, bereich) =>
  [...(await holen(`/sitemap-${locale}-${bereich}.xml`)).html.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
const stichprobe = (liste, n) => liste.filter((_, i) => i % Math.ceil(liste.length / n || 1) === 0).slice(0, n);

test('Sitemap-URLs: 200, index,follow, canonical == loc', async () => {
  for (const locale of SEO_LOCALES) {
    for (const bereich of BEREICHE) {
      if (!bereichFuerLocale(locale, bereich)) continue;
      const alle = (await locs(locale, bereich)).filter((l) => l.startsWith(`${SITE}/${locale}/`) || l === `${SITE}/${locale}`);
      const menge = ['titel', 'person'].includes(bereich) ? stichprobe(alle, 5) : alle;
      for (const loc of menge) {
        const { status, html } = await holen(loc.slice(SITE.length));
        assert.equal(status, 200, loc);
        assert.equal(robots(html), 'index,follow', loc);
        assert.equal(canonical(html), loc, loc);
      }
    }
  }
});

test('Hubs: index,follow <=> in der Sitemap', async () => {
  for (const locale of SEO_LOCALES) {
    const inSitemap = new Set(await locs(locale, 'hub'));
    const pfade = ['', 'filme', 'serien', 'kino', 'streaming', 'bestenlisten', 'reihen', 'beste-filme', 'beste-serien', 'schauspieler', 'regisseur', 'neu-auf', 'kino/neustarts'];
    for (const p of pfade) {
      if (!hatSeitenart(locale, p.split('/')[0] || 'start')) continue;
      const pfad = lokalisierePfade(`/${locale}/${p}`);
      const { status, html } = await holen(pfad);
      const index = status === 200 && robots(html) === 'index,follow';
      assert.equal(inSitemap.has(SITE + pfad), index, `${pfad}: Sitemap und Seite widersprechen sich`);
    }
  }
});

test('/international: 200, index,follow, canonical, in der de-de-Hub-Sitemap', async () => {
  const { status, html } = await holen('/international');
  assert.equal(status, 200);
  assert.equal(robots(html), 'index,follow');
  assert.equal(canonical(html), `${SITE}/international`);
  assert.ok((await locs('de-de', 'hub')).includes(`${SITE}/international`));
});

test('hreflang: Ziele sind 200, index und verlinken zurueck; x-default nur mit Cluster', async () => {
  for (const locale of SEO_LOCALES) {
    for (const p of ['', 'filme', 'streaming', 'kino']) {
      const pfad = lokalisierePfade(`/${locale}/${p}`);
      const { status, html } = await holen(pfad);
      if (status !== 200 || robots(html) !== 'index,follow') continue;
      const ziele = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => ({ code: m[1], href: m[2] }));
      const echte = ziele.filter((z) => z.code !== 'x-default');
      if (echte.length < 2) assert.equal(ziele.some((z) => z.code === 'x-default'), false, `${pfad}: x-default ohne Cluster`);
      for (const z of echte) {
        const { status: s, html: h } = await holen(z.href.slice(SITE.length));
        assert.equal(s, 200, `${pfad} -> ${z.href}`);
        assert.equal(robots(h), 'index,follow', `${pfad} -> ${z.href} noindex`);
        assert.ok(h.includes(`href="${SITE}${pfad}"`), `${z.href} verlinkt nicht zurueck auf ${pfad}`);
      }
    }
  }
});

test('de-at: keine Kinoort-Seiten in der Sitemap', async () => {
  assert.equal(bereichFuerLocale('de-at', 'kino_stadt'), false);
  assert.deepEqual((await locs('de-at', 'kino_stadt')), []);
});

test.after(async () => {
  await pool.query(`DELETE FROM seo_content WHERE bereich = 'hub' AND schluessel = 'start' AND text = 'SEOTEST Starttext'`);
  server.close(); await pool.end(); });
