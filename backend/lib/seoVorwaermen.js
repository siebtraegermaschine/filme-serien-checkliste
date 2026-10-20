// Baut die SEO-Caches (seoData.js, Sitemaps) vorab, damit weder Crawler noch
// Besucher einen kalten Hub abwarten (streaming_cache-Abfrage ~6 s). Sequenziell
// je Region, um die DB nicht zu fluten; Fehler einzelner Schritte stoppen nichts.
import { SEO_LOCALES, regionFuerLocale } from './seoLocale.js';
import {
  bestenlistenKatalog, streamingWochen, kinoNeustartsBasis, reihenKatalog, staedteListe, personenRangliste, ladeStreamingHub,
} from './seoData.js';
import { sitemapIndex, gzipTeile, BEREICHE, bereichFuerLocale } from './seoSitemap.js';

const INTERVALL_MS = 50 * 60 * 1000;

async function schritt(name, fn) {
  try { await fn(); } catch (err) { console.error(`SEO-Vorwaermen ${name}:`, err.message); }
}

export async function seoVorwaermen() {
  const start = Date.now();
  await schritt('sitemap-index', () => sitemapIndex()); // zuerst: Crawler holen ihn als Erstes
  const proRegion = new Map();
  for (const l of SEO_LOCALES) if (!proRegion.has(regionFuerLocale(l))) proRegion.set(regionFuerLocale(l), l);
  for (const [region, locale] of proRegion) {
    await schritt(`katalog ${region}`, () => bestenlistenKatalog('movie', locale));
    await schritt(`katalog serien ${region}`, () => bestenlistenKatalog('series', locale));
    await schritt(`streaming ${region}`, () => streamingWochen(region));
    await schritt(`streaming-hub ${region}`, () => ladeStreamingHub(locale));
    await schritt(`kino ${region}`, () => kinoNeustartsBasis(locale));
  }
  await schritt('reihen', () => reihenKatalog());
  await schritt('staedte', () => staedteListe());
  for (const rolle of ['schauspieler', 'regisseur']) {
    for (const l of ['de-de', 'en-gb', 'fr-fr']) await schritt(`personen ${rolle} ${l}`, () => personenRangliste(rolle, l));
  }
  for (const l of SEO_LOCALES) {
    for (const b of BEREICHE) {
      if (bereichFuerLocale(l, b)) await schritt(`sitemap ${l}/${b}`, () => gzipTeile(l, b));
    }
  }
  console.log(`SEO-Caches vorgewaermt in ${Math.round((Date.now() - start) / 1000)} s`);
}

export function starteSeoVorwaermen() {
  seoVorwaermen();
  setInterval(seoVorwaermen, INTERVALL_MS).unref();
}
