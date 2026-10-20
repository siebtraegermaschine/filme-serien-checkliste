// Sitemap fuer die SEO-Seiten. Dynamisch generiert (Titel-/Bewertungsdaten
// aendern sich taeglich), prozessintern gecacht -- dieselbe Kosten-Ueberlegung
// wie bestenlisteCache in seoData.js: die zugrundeliegenden Abfragen sind zu
// teuer fuer jeden Crawl-Treffer einzeln.
import { gzipSync, gunzipSync } from 'node:zlib';
import { pool } from '../db/pool.js';
import { swrCache } from './swrCache.js';
import { SITE } from './seoRender.js';
import { SEO_LOCALES, textLocale, MIN_TITELTEXT } from './seoLocale.js';
import { SITEMAP_BEREICHE, bereichFuerLocale } from './seoSeitenarten.js';
import { SITEMAP_URLS } from './seoSeitenartenDaten.js';

// Bereiche, Hub-Liste und Bereich -> Seitenart stehen im Verzeichnis (seoSeitenarten.js).
export const BEREICHE = SITEMAP_BEREICHE;
export { bereichFuerLocale };

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
// mehr nur die mit eigenem Text. Die Bereiche selbst: SITEMAP_URLS (seoSeitenartenDaten.js).
async function urlsFuerBereich(locale, bereich) {
  if (bereich === 'person') return SITEMAP_URLS.person(locale);
  if (!bereichFuerLocale(locale, bereich)) return [];
  const stand = await textStaende(bereich, locale);
  return SITEMAP_URLS[bereich] ? SITEMAP_URLS[bereich](locale, stand) : [];
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
  if (bereich === 'person') { // Locales ohne Personentexte: keine leere Sitemap im Index
    const { rows: [p] } = await pool.query(`SELECT count(*)::int AS n FROM seo_content WHERE bereich = 'person' AND locale = $1`, [textLocale(locale)]);
    return p.n > 0 ? 1 : 0;
  }
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
