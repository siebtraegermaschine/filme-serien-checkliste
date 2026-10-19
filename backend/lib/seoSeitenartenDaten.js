// Datenseite des Verzeichnisses (seoSeitenarten.js): ordnet den Schluesseln `indexierbar` und
// `sitemap.bereich` die Funktionen zu, die Datenbank/Renderer brauchen. Getrennt vom Verzeichnis,
// damit dieses rein bleibt (seoLocale.js importiert es).
import { slugifyName } from './slug.js';
import { SITE } from './seoRender.js';
import { hatSeitenart, regionFuerLocale } from './seoLocale.js';
import { hubPfade, wochenArten } from './seoSeitenarten.js';
import {
  personenFuerSitemap, titelFuerSitemap, genresFuerSitemap, anbieterFuerSitemap,
  staedteFuerSitemap, alleBestenlisten, reihenFuerSitemap, wochenSeitenFuerSitemap,
  ladeStartHub, ladePersonenHub, reihenKatalog, streamingHubIndexierbar, kinoHubIndexierbar,
} from './seoData.js';
import { schluesselZuPfad } from './seoBestenlisten.js';

// Je Hub dieselbe Regel wie `indexierbar` der lade*-Funktion (Argument: { locale, region, name }).
// 'immer' (und alles ohne Eintrag) heisst: steht in der Sitemap, sobald es das Locale kennt.
export const INDEXIERBAR = {
  start: async ({ locale }) => (await ladeStartHub(locale)).indexierbar,
  streamingHub: ({ region }) => streamingHubIndexierbar(region),
  kinoHub: ({ region }) => kinoHubIndexierbar(region),
  reihen: async () => (await reihenKatalog()).liste.length > 0,
  personenHub: async ({ name, locale }) => (await ladePersonenHub(name, locale)).indexierbar,
};

const RECHTSTEXTE = ['impressum.html', 'datenschutz.html', 'nutzungsbedingungen.html'];

// Sitemap-URLs je Bereich: (locale, stand) -> [{ loc, lastmod }]; `stand` = letzte Textaenderung je Schluessel.
export const SITEMAP_URLS = {
  async person(locale) {
    const urls = [];
    for (const rolle of ['regisseur', 'schauspieler']) {
      for (const p of await personenFuerSitemap(rolle, locale)) {
        urls.push({ loc: `${SITE}/${locale}/${rolle}/${p.slug}-${p.tmdbPersonId}`, lastmod: null });
      }
    }
    return urls;
  },

  // Nur Titel mit Text in dieser Sprache (Thin-Content-Schutz, gilt auch fuer die reinen SEO-Titel aus streaming_cache).
  async titel(locale, stand) {
    const alle = await titelFuerSitemap();
    return alle.filter((t) => stand.has(`${t.type}:${t.tmdb_id}`)).map((t) => ({
      loc: `${SITE}/${locale}/${t.type === 'series' ? 'serie' : 'film'}/${slugifyName(t.title)}-${t.tmdb_id}`,
      lastmod: stand.get(`${t.type}:${t.tmdb_id}`) || null,
    }));
  },

  async genre(locale, stand) {
    return (await genresFuerSitemap()).map((g) => ({
      loc: `${SITE}/${locale}/${g.type === 'series' ? 'serien' : 'filme'}/${g.slug}`,
      lastmod: stand.get(`${g.slug}:${g.type}`) || null,
    }));
  },

  async anbieter(locale, stand) {
    return (await anbieterFuerSitemap(locale)).map((slug) => ({
      loc: `${SITE}/${locale}/streaming/${slug}`, lastmod: stand.get(slug) || null,
    }));
  },

  async bestenliste(locale, stand) {
    return (await alleBestenlisten(locale)).flatMap(([art, modus, wert]) => {
      const schluessel = `${modus}:${wert}:${art === 'serien' ? 'series' : 'movie'}`;
      const pfad = schluesselZuPfad(schluessel, locale);
      return pfad ? [{ loc: SITE + pfad, lastmod: stand.get(schluessel) || null }] : [];
    });
  },

  async reihe(locale, stand) {
    return (await reihenFuerSitemap()).map((slug) => ({
      loc: `${SITE}/${locale}/reihen/${slug}`, lastmod: stand.get(slug) || null,
    }));
  },

  async kino_stadt(locale, stand) {
    return (await staedteFuerSitemap()).map((slug) => ({
      loc: `${SITE}/${locale}/kino/${slug}`, lastmod: stand.get(slug) || null,
    }));
  },

  // Seitenarten, die das Locale nicht kennt (404), fehlen. Wochenseiten (vor den Hubs): nur wenn
  // index,follow, lastmod = heute. Zuletzt die deutschen Rechtstexte.
  async hub(locale, stand) {
    const region = regionFuerLocale(locale);
    const w = await wochenSeitenFuerSitemap(locale);
    const wochen = wochenArten().flatMap((a) => {
      if (!hatSeitenart(locale, a.name)) return [];
      if (a.liste) return w[a.liste].map((s) => `${a.pfad}${s}`);
      return w[a.schluessel] ? [a.pfad] : [];
    }).map((h) => ({ loc: `${SITE}/${locale}/${h}`, lastmod: w.stand }));
    const hubs = [];
    for (const h of hubPfade()) {
      if (!hatSeitenart(locale, h.name)) continue;
      const regel = INDEXIERBAR[h.indexierbar];
      if (regel && !(await regel({ locale, region, name: h.name }))) continue;
      hubs.push({ loc: h.pfad === 'start' ? `${SITE}/${locale}/` : `${SITE}/${locale}/${h.pfad}`, lastmod: stand.get(h.pfad) || null });
    }
    const recht = locale === 'de-de'
      ? [`${SITE}/international`, ...RECHTSTEXTE.map((d) => `${SITE}/${d}`)].map((loc) => ({ loc, lastmod: null })) : [];
    return [...wochen, ...hubs, ...recht];
  },
};
