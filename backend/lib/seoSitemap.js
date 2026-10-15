// Sitemap fuer die SEO-Seiten. Dynamisch generiert (Titel-/Bewertungsdaten
// aendern sich taeglich), prozessintern gecacht -- dieselbe Kosten-Ueberlegung
// wie bestenlisteCache in seoData.js: die zugrundeliegenden Abfragen sind zu
// teuer fuer jeden Crawl-Treffer einzeln.
import { gzipSync, gunzipSync } from 'node:zlib';
import { pool } from '../db/pool.js';
import { swrCache } from './swrCache.js';
import { slugify } from './slug.js';
import { SITE } from './seoRender.js';
import { SEO_LOCALES, hatSeitenart, textLocale, regionFuerLocale, MIN_TITELTEXT } from './seoLocale.js';
import {
  personenFuerSitemap, titelFuerSitemap, genresFuerSitemap, anbieterFuerSitemap,
  staedteFuerSitemap, alleBestenlisten, reihenFuerSitemap, wochenSeitenFuerSitemap,
  ladeStartHub, ladePersonenHub, reihenKatalog, streamingHubIndexierbar, kinoHubIndexierbar,
} from './seoData.js';
import { schluesselZuPfad } from './seoBestenlisten.js';

export const BEREICHE = ['titel', 'genre', 'anbieter', 'bestenliste', 'kino_stadt', 'hub', 'person', 'reihe'];

// Bereich -> Seitenart (seoLocale.js). Nicht-de-Locales fuehren nur lokalisierte Arten.
const ART_JE_BEREICH = { titel: 'titel', hub: 'start', bestenliste: 'beste-filme' };
export function bereichFuerLocale(locale, bereich) {
  // Kinoorte (kinos) gibt es nur fuer Deutschland.
  if (bereich === 'kino_stadt' && regionFuerLocale(locale) !== 'DE') return false;
  return hatSeitenart(locale, ART_JE_BEREICH[bereich] || bereich);
}

// Hub-Seiten ('start' = /<locale>/ selbst) und die deutschen Rechtstexte.
const HUBS = ['start', 'filme', 'serien', 'kino', 'streaming', 'bestenlisten', 'reihen', 'beste-filme', 'beste-serien', 'schauspieler', 'regisseur'];
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
    `SELECT schluessel, aktualisiert_am FROM seo_content WHERE bereich = $1 AND locale = $2
        AND ($1 <> 'titel' OR $2 = 'de-de' OR length(text) >= $3)`,
    [bereich, textLocale(locale), MIN_TITELTEXT]
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

  if (!bereichFuerLocale(locale, bereich)) return [];
  const stand = await textStaende(bereich, locale);

  if (bereich === 'titel') {
    // Nur Titel mit Text in dieser Sprache (Thin-Content-Schutz, gilt auch fuer
    // die reinen SEO-Titel aus streaming_cache).
    const alle = await titelFuerSitemap();
    return alle.filter((t) => stand.has(`${t.type}:${t.tmdb_id}`)).map((t) => ({
      loc: `${SITE}/${locale}/${t.type === 'series' ? 'serie' : 'film'}/${slugify(t.title, locale)}-${t.tmdb_id}`,
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

  if (bereich === 'reihe') {
    return (await reihenFuerSitemap()).map((slug) => ({
      loc: `${SITE}/${locale}/reihen/${slug}`, lastmod: stand.get(slug) || null,
    }));
  }

  if (bereich === 'kino_stadt') {
    return (await staedteFuerSitemap()).map((slug) => ({
      loc: `${SITE}/${locale}/kino/${slug}`, lastmod: stand.get(slug) || null,
    }));
  }

  if (bereich === 'hub') {
    // Je Hub dieselbe Regel wie `indexierbar` der lade*-Funktion; Seitenarten, die das
    // Locale nicht kennt (404), fehlen. Wochenseiten: nur wenn index,follow, lastmod = heute.
    const region = regionFuerLocale(locale);
    const w = await wochenSeitenFuerSitemap(locale);
    const wochen = [
      ...(w.neuAuf && hatSeitenart(locale, 'neu-auf') ? [`neu-auf`] : []),
      ...(hatSeitenart(locale, 'neu-auf') ? w.anbieter.map((s) => `neu-auf/${s}`) : []),
      ...(w.kinoNeustarts && hatSeitenart(locale, 'kino') ? ['kino/neustarts'] : []),
    ].map((h) => ({ loc: `${SITE}/${locale}/${h}`, lastmod: w.stand }));
    const hubs = [];
    for (const h of HUBS) {
      if (!hatSeitenart(locale, h === 'start' ? 'start' : h)) continue;
      let ok = true;
      if (h === 'start') ok = (await ladeStartHub(locale)).indexierbar;
      else if (h === 'streaming') ok = await streamingHubIndexierbar(region);
      else if (h === 'kino') ok = await kinoHubIndexierbar(region);
      else if (h === 'reihen') ok = (await reihenKatalog()).liste.length > 0;
      else if (h === 'schauspieler' || h === 'regisseur') ok = (await ladePersonenHub(h, locale)).indexierbar;
      if (ok) hubs.push({ loc: h === 'start' ? `${SITE}/${locale}/` : `${SITE}/${locale}/${h}`, lastmod: stand.get(h) || null });
    }
    const recht = locale === 'de-de'
      ? RECHTSTEXTE.map((d) => ({ loc: `${SITE}/${d}`, lastmod: null })) : [];
    return [...wochen, ...hubs, ...recht];
  }

  return [];
}

// Eine Sitemap-Datei darf hoechstens 50.000 URLs haben; Titel-Dateien sind groesser.
// Seite 1 behaelt den alten Dateinamen (sitemap-<locale>-<bereich>.xml), weitere
// heissen ...-<bereich>-2.xml. Gecacht wird gzip-komprimiert (Speicher).
const MAX_URLS = 45000;

export function gzipTeile(locale, bereich) {
  return swrCache(cache, `${locale}:${bereich}`, TTL_MS, async () => {
    const urls = await urlsFuerBereich(locale, bereich);
    const teile = [];
    for (let i = 0; i < Math.max(urls.length, 1); i += MAX_URLS) {
      teile.push(gzipSync(urlset(urls.slice(i, i + MAX_URLS))));
    }
    return teile;
  });
}

// Gzip-Puffer der Seite (1-basiert); hinter dem Ende eine leere Liste statt Fehler.
export async function sitemapBereichGz(locale, bereich, seite = 1) {
  const teile = await gzipTeile(locale, bereich);
  return teile[seite - 1] || gzipSync(urlset([]));
}

export async function sitemapBereich(locale, bereich, seite = 1) {
  return gunzipSync(await sitemapBereichGz(locale, bereich, seite)).toString('utf8');
}

// Anzahl Dateien eines Bereichs fuer den Index. Nur Titel koennen die Grenze
// reissen; der Rest ist deutlich kleiner und bleibt bei einer Datei.
async function dateiAnzahl(locale, bereich) {
  if (bereich !== 'titel') return 1;
  const { rows: [r] } = await pool.query(
    `SELECT count(*)::int AS n FROM seo_content WHERE bereich = 'titel' AND locale = $1 AND ($1 = 'de-de' OR length(text) >= $2)`,
    [textLocale(locale), MIN_TITELTEXT]
  );
  return Math.max(1, Math.ceil(r.n / MAX_URLS));
}

export function sitemapIndex() {
  return swrCache(cache, 'index', TTL_MS, baueIndex);
}

async function baueIndex() {
  const zeilen = [];
  for (const locale of SEO_LOCALES) {
    for (const bereich of BEREICHE) {
      if (!bereichFuerLocale(locale, bereich)) continue;
      const n = await dateiAnzahl(locale, bereich);
      for (let i = 1; i <= n; i++) {
        zeilen.push(`  <sitemap><loc>${xmlEsc(`${SITE}/sitemap-${locale}-${bereich}${i > 1 ? `-${i}` : ''}.xml`)}</loc></sitemap>`);
      }
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${zeilen.join('\n')}\n</sitemapindex>`;
  return xml;
}
