// Sitemap fuer die SEO-Seiten. Dynamisch generiert (Titel-/Bewertungsdaten
// aendern sich taeglich), prozessintern gecacht -- dieselbe Kosten-Ueberlegung
// wie bestenlisteCache in seoData.js: die zugrundeliegenden Abfragen sind zu
// teuer fuer jeden Crawl-Treffer einzeln.
import { pool } from '../db/pool.js';
import { slugify } from './slug.js';
import { SITE } from './seoRender.js';
import { SEO_LOCALES } from './seoLocale.js';
import { ladePersonSeite } from './seoData.js';

export const BEREICHE = ['titel', 'genre', 'anbieter', 'bestenliste', 'kino_stadt', 'hub', 'person'];

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

// Personen haben kein seo_content (siehe personen.js) -- indexierbar richtet
// sich nach ladePersonSeite() selbst (Biografie + Filmografie vorhanden).
// Nur bereits gecachte Personen (personen_cache) koennen ueberhaupt gelistet
// werden -- ohne vorherigen Seitenaufruf/Backfill ist eine Person hier noch
// nicht bekannt (derselbe verzoegerte Abruf wie bei der Einzelseite).
async function personenUrls(locale) {
  const { rows } = await pool.query(`SELECT tmdb_person_id FROM personen_cache`);
  const urls = [];
  for (const r of rows) {
    for (const rolle of ['regisseur', 'schauspieler']) {
      const daten = await ladePersonSeite(rolle, r.tmdb_person_id, locale);
      if (daten && daten.indexierbar) {
        urls.push({ loc: `${SITE}/${locale}/${rolle}/${daten.slug}-${r.tmdb_person_id}`, lastmod: null });
      }
    }
  }
  return urls;
}

// Nur URLs, deren seo_content-Zeile existiert -- dieselbe Regel wie das
// `meta robots`-Tag der Einzelseite (seoData.js: indexierbar = !!text). Damit
// zieht der Content-Fortschritt die Sitemap automatisch nach.
async function urlsFuerBereich(locale, bereich) {
  if (bereich === 'person') return personenUrls(locale);

  const { rows } = await pool.query(
    `SELECT schluessel, aktualisiert_am FROM seo_content WHERE bereich = $1 AND locale = $2`,
    [bereich, locale]
  );
  if (!rows.length) return [];

  if (bereich === 'titel') {
    // schluessel ist 'movie:<tmdb_id>' oder 'series:<tmdb_id>' -- Slug kommt
    // aus der aktuellen titles-Zeile, nicht aus dem Schluessel selbst.
    const paare = rows.map((r) => {
      const [type, tmdbId] = r.schluessel.split(':');
      return { type, tmdbId: Number(tmdbId), aktualisiert_am: r.aktualisiert_am };
    }).filter((p) => (p.type === 'movie' || p.type === 'series') && Number.isInteger(p.tmdbId));
    if (!paare.length) return [];
    const { rows: titelRows } = await pool.query(
      `SELECT t.type, COALESCE(t.tmdb_id, r.tmdb_id) AS tmdb_id, t.title
         FROM titles t LEFT JOIN title_tmdb_resolution r ON r.title_id = t.id
        WHERE (t.type, COALESCE(t.tmdb_id, r.tmdb_id)) IN (
          ${paare.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',')}
        )`,
      paare.flatMap((p) => [p.type, p.tmdbId])
    );
    const byKey = new Map(titelRows.map((t) => [`${t.type}:${t.tmdb_id}`, t.title]));
    return paare
      .filter((p) => byKey.has(`${p.type}:${p.tmdbId}`))
      .map((p) => ({
        loc: `${SITE}/${SEO_LOCALES[0]}/${p.type === 'series' ? 'serie' : 'film'}/${slugify(byKey.get(`${p.type}:${p.tmdbId}`))}-${p.tmdbId}`,
        lastmod: p.aktualisiert_am.toISOString().slice(0, 10),
      }));
  }

  if (bereich === 'genre') {
    // schluessel ist '<genreSlug>:<type>'
    return rows.map((r) => {
      const [slug, type] = r.schluessel.split(':');
      return { loc: `${SITE}/${locale}/${type === 'series' ? 'serien' : 'filme'}/${slug}`, lastmod: r.aktualisiert_am.toISOString().slice(0, 10) };
    });
  }

  if (bereich === 'anbieter') {
    return rows.map((r) => ({ loc: `${SITE}/${locale}/streaming/${r.schluessel}`, lastmod: r.aktualisiert_am.toISOString().slice(0, 10) }));
  }

  if (bereich === 'bestenliste') {
    // schluessel ist 'jahr:<jahr>:<type>' oder 'genre:<slug>:<type>'
    return rows.map((r) => {
      const [modus, wert, type] = r.schluessel.split(':');
      return { loc: `${SITE}/${locale}/beste-${type === 'series' ? 'serien' : 'filme'}/${modus}/${wert}`, lastmod: r.aktualisiert_am.toISOString().slice(0, 10) };
    });
  }

  if (bereich === 'kino_stadt') {
    return rows.map((r) => ({ loc: `${SITE}/${locale}/kino/${r.schluessel}`, lastmod: r.aktualisiert_am.toISOString().slice(0, 10) }));
  }

  if (bereich === 'hub') {
    // schluessel ist direkt das URL-Segment ('filme'|'serien'|'kino'|
    // 'streaming'|'beste-filme'|'beste-serien').
    return rows.map((r) => ({ loc: `${SITE}/${locale}/${r.schluessel}`, lastmod: r.aktualisiert_am.toISOString().slice(0, 10) }));
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
