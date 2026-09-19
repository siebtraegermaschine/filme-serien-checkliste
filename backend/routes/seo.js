// SEO-Seiten: eigenstaendige, von der App getrennte Dokumente unter
// /<locale>/... (PLAN-SEO.md, Plan "SEO-Seiten: technische Umsetzung").
// Registrierung in server.js VOR express.static.
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { mengenGrenze } from '../middleware/rateLimit.js';
import { SEO_LOCALES, localeGueltig } from '../lib/seoLocale.js';
import {
  ladeTitelSeite, ladeGenreSeite, ladeAnbieterSeite, ladeBestenliste, ladeKinoStadt,
  ladeFilmeHub, ladeSerienHub, ladeKinoHub, ladeStreamingHub, ladeBestenlisteHub, ladePersonSeite,
  ladeStartHub, ladeSchauspielerHub,
} from '../lib/seoData.js';
import {
  seiteTitelDetail, seiteGenre, seiteAnbieter, seiteBestenliste, seiteKinoStadt, seite404, SITE,
  seiteFilmeSerienHub, seiteKinoHub, seiteStreamingHub, seiteBestenlisteHub, seitePerson, seiteStart, seiteSchauspielerHub,
} from '../lib/seoRender.js';
import { sitemapIndex, sitemapBereich, BEREICHE } from '../lib/seoSitemap.js';
import { track } from '../lib/track.js';
import { tageskennung } from '../lib/tageskennung.js';
import { herkunftKategorie, geraetTyp, istBot } from '../lib/herkunft.js';

const router = createAsyncRouter();

/* Aufrufzaehler der SEO-Seiten (16.09.2026, fuer die Analytics-Ansicht des
   Betreibers, nach dem Vorbild von CouchUltras): serverseitig und OHNE
   Geraetekennung. Gespeichert werden der Seitentyp (zweites Pfadsegment,
   'start' fuer /<locale>), der Pfad (nur wenn er aus Kleinbuchstaben, Ziffern,
   Bindestrich und Schraegstrich besteht -- eingetippter Unsinn landet nie in
   der Datenbank), ob der Aufrufer nach seinem User-Agent ein Crawler ist,
   der Geraetetyp und die Herkunfts-Kategorie aus dem Referer (nie dessen
   Adresse, lib/herkunft.js), dazu die cookielose Tageskennung fuer "Geraete
   je Tag" (lib/tageskennung.js). Gezaehlt wird erst beim Abschluss der
   Antwort und nur bei 200 + HTML, also keine 404-Seiten und keine Sitemaps.
   Der Pfad muss mit einem gueltigen Locale beginnen -- so bleiben index.html
   und alles, was express.static hinter diesem Router ausliefert, aussen vor.
   Fire-and-forget wie track() selbst: Zaehlen darf die Auslieferung nie
   bremsen. */
export const EIGENE_HOSTS = ['movietaste.de', 'moviematch.app'];
const PFAD_RE = /^[a-z0-9\/-]{1,160}$/;
export function seoAufrufTyp(pfad) {
  const teile = String(pfad || '').split('/').filter(Boolean);
  if (!localeGueltig(teile[0])) return null;
  return teile[1] || 'start';
}
export function seoAufrufPfad(pfad) {
  const p = String(pfad || '').replace(/\/+$/, '') || '/';
  return PFAD_RE.test(p) ? p : null;
}
router.use((req, res, next) => {
  const typ = seoAufrufTyp(req.path);
  if (typ) {
    res.on('finish', () => {
      if (res.statusCode !== 200) return;
      if (!/text\/html/.test(String(res.get('content-type') || ''))) return;
      const ua = req.get('user-agent') || '';
      const props = {
        typ, pfad: seoAufrufPfad(req.path), bot: istBot(ua), geraet: geraetTyp(ua),
        herkunft: herkunftKategorie(req.get('referer'), [...EIGENE_HOSTS, req.hostname]),
      };
      tageskennung(req).then((tagesId) => track('seo_aufruf', { props, tagesId }));
    });
  }
  next();
});

// Grosszuegig wie /t/ (server.js) -- trifft nur Haemmern ueber viele Slugs,
// nicht normale Crawler-/Besucher-Last.
const GRENZE = mengenGrenze({ name: 'seo-seite', anzahl: 120, minuten: 1 });

function nichtGefunden(res, locale) {
  res.status(404).type('html').send(seite404(localeGueltig(locale) ? locale : 'de-de'));
}

// Slug ist reine Kosmetik in der URL -- die tmdbId entscheidet, welcher
// Titel gemeint ist (wie beim bestehenden /t/movie/<tmdbId>). Ein falscher/
// fehlender Slug liefert trotzdem die Seite aus (canonical zeigt auf die
// richtige URL), ein 404 waere hier zu hart fuer einen Tippfehler im Slug.
router.get('/:locale/film/:slugId', GRENZE, async (req, res) => {
  await titelSeite(req, res, 'film');
});
router.get('/:locale/serie/:slugId', GRENZE, async (req, res) => {
  await titelSeite(req, res, 'serie');
});

async function titelSeite(req, res, art) {
  const { locale, slugId } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  const treffer = /-(\d+)$/.exec(slugId);
  if (!treffer) return nichtGefunden(res, locale);
  const tmdbId = Number(treffer[1]);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return nichtGefunden(res, locale);

  const titel = await ladeTitelSeite(art, tmdbId, locale);
  if (!titel) return nichtGefunden(res, locale);

  res.type('html').send(seiteTitelDetail(titel, locale));
}

router.get('/:locale/filme', GRENZE, async (req, res) => {
  const { locale } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  res.type('html').send(seiteFilmeSerienHub(await ladeFilmeHub(locale), locale, 'filme'));
});
router.get('/:locale/serien', GRENZE, async (req, res) => {
  const { locale } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  res.type('html').send(seiteFilmeSerienHub(await ladeSerienHub(locale), locale, 'serien'));
});

router.get('/:locale/schauspieler', GRENZE, async (req, res) => {
  const { locale } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  res.type('html').send(seiteSchauspielerHub(await ladeSchauspielerHub(locale), locale));
});

router.get('/:locale/filme/:genreSlug', GRENZE, (req, res) => genreSeite(req, res, 'filme'));
router.get('/:locale/serien/:genreSlug', GRENZE, (req, res) => genreSeite(req, res, 'serien'));

async function genreSeite(req, res, art) {
  const { locale, genreSlug } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  const seite = Math.max(1, Number(req.query.seite) || 1);
  const daten = await ladeGenreSeite(art, genreSlug, seite, locale);
  if (!daten) return nichtGefunden(res, locale);
  res.type('html').send(seiteGenre(daten, locale));
}

router.get('/:locale/streaming', GRENZE, async (req, res) => {
  const { locale } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  res.type('html').send(seiteStreamingHub(await ladeStreamingHub(locale), locale));
});

router.get('/:locale/streaming/:anbieterSlug', GRENZE, async (req, res) => {
  const { locale, anbieterSlug } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  const daten = await ladeAnbieterSeite(anbieterSlug, locale);
  if (!daten) return nichtGefunden(res, locale);
  res.type('html').send(seiteAnbieter(daten, locale));
});

router.get('/:locale/beste-filme', GRENZE, async (req, res) => {
  const { locale } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  const daten = await ladeBestenlisteHub('filme', locale);
  res.type('html').send(seiteBestenlisteHub(daten, locale));
});
router.get('/:locale/beste-serien', GRENZE, async (req, res) => {
  const { locale } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  const daten = await ladeBestenlisteHub('serien', locale);
  res.type('html').send(seiteBestenlisteHub(daten, locale));
});

router.get('/:locale/beste-filme/:modus/:wert', GRENZE, (req, res) => bestenlisteSeite(req, res, 'filme'));
router.get('/:locale/beste-serien/:modus/:wert', GRENZE, (req, res) => bestenlisteSeite(req, res, 'serien'));

async function bestenlisteSeite(req, res, art) {
  const { locale, modus, wert } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  const daten = await ladeBestenliste(art, modus, wert, locale);
  if (!daten) return nichtGefunden(res, locale);
  res.type('html').send(seiteBestenliste(daten, locale));
}

router.get('/:locale/kino', GRENZE, async (req, res) => {
  const { locale } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  res.type('html').send(seiteKinoHub(await ladeKinoHub(locale), locale));
});

router.get('/:locale/kino/:stadtSlug', GRENZE, async (req, res) => {
  const { locale, stadtSlug } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  const daten = await ladeKinoStadt(stadtSlug, locale);
  if (!daten) return nichtGefunden(res, locale);
  res.type('html').send(seiteKinoStadt(daten, locale));
});

router.get('/:locale/schauspieler/:slugId', GRENZE, (req, res) => personSeite(req, res, 'schauspieler'));
router.get('/:locale/regisseur/:slugId', GRENZE, (req, res) => personSeite(req, res, 'regisseur'));

async function personSeite(req, res, rolle) {
  const { locale, slugId } = req.params;
  if (!localeGueltig(locale)) return nichtGefunden(res, locale);
  const treffer = /-(\d+)$/.exec(slugId);
  if (!treffer) return nichtGefunden(res, locale);
  const personId = Number(treffer[1]);
  if (!Number.isInteger(personId) || personId <= 0) return nichtGefunden(res, locale);
  const daten = await ladePersonSeite(rolle, personId, locale);
  if (!daten) return nichtGefunden(res, locale);
  res.type('html').send(seitePerson(daten, locale));
}

// Sitemap: dynamisch, prozessintern gecacht (siehe seoSitemap.js). Route
// selbst nicht locale-praefigiert, die Dateinamen tragen das Locale.
router.get('/sitemap-index.xml', GRENZE, async (req, res) => {
  res.type('application/xml').send(await sitemapIndex());
});
router.get('/sitemap-:locale-:bereich.xml', GRENZE, async (req, res) => {
  const { locale, bereich } = req.params;
  if (!SEO_LOCALES.includes(locale) || !BEREICHE.includes(bereich)) return res.status(404).end();
  res.type('application/xml').send(await sitemapBereich(locale, bereich));
});

// Einstiegsseite /<locale>/ -- ZULETZT registriert, denn '/:locale' passt auf
// JEDEN einsegmentigen Pfad. Zwei Regeln daraus:
//  1. Sie muss hinter allen spezifischeren Routen stehen (auch hinter der
//     Sitemap, sonst schluckt sie /sitemap-index.xml).
//  2. Bei ungueltigem Locale MUSS next() folgen, kein 404: Sonst faengt sie
//     /seo.css, /robots.txt, /impressum.html und jede andere statische Datei
//     ab, bevor express.static sie ausliefern kann.
// Hintergrund: robots.txt gibt /de-de/ ausdruecklich frei, der Pfad lief aber
// bis 16.08.2026 in einen 404 -- Crawler landeten auf einer Fehlerseite.
router.get('/:locale', GRENZE, async (req, res, next) => {
  const { locale } = req.params;
  if (!localeGueltig(locale)) return next();
  res.type('html').send(seiteStart(await ladeStartHub(locale), locale));
});

export default router;
