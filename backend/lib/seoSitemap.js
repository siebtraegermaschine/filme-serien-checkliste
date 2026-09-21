// Sitemap fuer die SEO-Seiten. Dynamisch generiert (Titel-/Bewertungsdaten
// aendern sich taeglich), prozessintern gecacht -- dieselbe Kosten-Ueberlegung
// wie bestenlisteCache in seoData.js: die zugrundeliegenden Abfragen sind zu
// teuer fuer jeden Crawl-Treffer einzeln.
import { pool } from '../db/pool.js';
import { slugify } from './slug.js';
import { SITE } from './seoRender.js';
import { SEO_LOCALES } from './seoLocale.js';
import {
  personenFuerSitemap, titelFuerSitemap, genresFuerSitemap, anbieterFuerSitemap,
  staedteFuerSitemap, alleBestenlisten,
} from './seoData.js';
import { schluesselZuPfad } from './seoBestenlisten.js';

export const BEREICHE = ['titel', 'genre', 'anbieter', 'bestenliste', 'kino_stadt', 'hub', 'person'];

// Hub-Seiten ('start' = /<locale>/ selbst) und die deutschen Rechtstexte.
const HUBS = ['start', 'filme', 'serien', 'kino', 'streaming', 'bestenlisten', 'beste-filme', 'beste-serien', 'schauspieler', 'regisseur'];
const RECHTSTEXTE = ['impressum.html', 'datenschutz.html', 'nutzungsbedingungen.html'];

const TTL_MS = 60 * 60 * 1000;
const cache = new Map();

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function urlset(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') +
    `\n</urlset>`;
}

// Letzte Textaenderung je Schluessel -- als lastmod, wo es schon einen Text gibt.
async function textStaende(bereich, locale) {
  const { rows } = await pool.query(
    `SELECT schluessel, aktualisiert_am FROM seo_content WHERE bereich = $1 AND locale = $2`,
    [bereich, locale]
  );
  return new Map(rows.map((r) => [r.schluessel, r.aktualisiert_am.toISOString().slice(0, 10)]));
}

// Alle Seiten, die es gibt (Regeln wie `indexierbar` in seoData.js) -- nicht
// mehr nur die mit eigenem Text.
async function urlsFuerBereich(locale, bereich) {
  if (bereich === 'person') {
    const urls = [];
    for (const rolle of ['regisseur', 'schauspieler']) {
      for (const p of await personenFuerSitemap(rolle, locale)) {
        urls.push({ loc: `${SITE}/${locale}/${rolle}/${p.slug}-${p.tmdbPersonId}`, lastmod: null });
      }
    }
    return urls;
  }

  const stand = await textStaende(bereich, locale);

  if (bereich === 'titel') {
    return (await titelFuerSitemap()).map((t) => ({
      loc: `${SITE}/${locale}/${t.type === 'series' ? 'serie' : 'film'}/${slugify(t.title)}-${t.tmdb_id}`,
      lastmod: stand.get(`${t.type}:${t.tmdb_id}`) || null,
    }));
  }

  if (bereich === 'genre') {
    return (await genresFuerSitemap()).map((g) => ({
      loc: `${SITE}/${locale}/${g.type === 'series' ? 'serien' : 'filme'}/${g.slug}`,
      lastmod: stand.get(`${g.slug}:${g.type}`) || null,
    }));
  }

  if (bereich === 'anbieter') {
    return (await anbieterFuerSitemap(locale)).map((slug) => ({
      loc: `${SITE}/${locale}/streaming/${slug}`, lastmod: stand.get(slug) || null,
    }));
  }

  if (bereich === 'bestenliste') {
    return (await alleBestenlisten(locale)).flatMap(([art, modus, wert]) => {
      const schluessel = `${modus}:${wert}:${art === 'serien' ? 'series' : 'movie'}`;
      const pfad = schluesselZuPfad(schluessel, locale);
      return pfad ? [{ loc: SITE + pfad, lastmod: stand.get(schluessel) || null }] : [];
    });
  }

  if (bereich === 'kino_stadt') {
    return (await staedteFuerSitemap()).map((slug) => ({
      loc: `${SITE}/${locale}/kino/${slug}`, lastmod: stand.get(slug) || null,
    }));
  }

  if (bereich === 'hub') {
    return [
      ...HUBS.map((h) => ({
        loc: h === 'start' ? `${SITE}/${locale}/` : `${SITE}/${locale}/${h}`,
        lastmod: stand.get(h) || null,
      })),
      ...RECHTSTEXTE.map((d) => ({ loc: `${SITE}/${d}`, lastmod: null })),
    ];
  }

  return [];
}

export async function sitemapBereich(locale, bereich) {
  const key = `${locale}:${bereich}`;
  const jetzt = Date.now();
  const gecacht = cache.get(key);
  if (gecacht && jetzt - gecacht.at < TTL_MS) return gecacht.xml;
  const urls = await urlsFuerBereich(locale, bereich);
  const xml = urlset(urls);
  cache.set(key, { at: jetzt, xml });
  return xml;
}

export async function sitemapIndex() {
  const key = 'index';
  const jetzt = Date.now();
  const gecacht = cache.get(key);
  if (gecacht && jetzt - gecacht.at < TTL_MS) return gecacht.xml;
  const zeilen = [];
  for (const locale of SEO_LOCALES) {
    for (const bereich of BEREICHE) {
      zeilen.push(`  <sitemap><loc>${xmlEsc(`${SITE}/sitemap-${locale}-${bereich}.xml`)}</loc></sitemap>`);
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${zeilen.join('\n')}\n</sitemapindex>`;
  cache.set(key, { at: jetzt, xml });
  return xml;
}
