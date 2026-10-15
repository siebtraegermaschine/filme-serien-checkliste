/* Golden-Test der Seitenart-Funktionen (Locale/Pfad-Matrix). Haelt das Verhalten fest,
 * waehrend das Routen-Verzeichnis (lib/seoSeitenarten.js) eingefuehrt wird. DB-frei.
 * Neu schreiben nur bewusst: GOLDEN_SCHREIBEN=1 node --test test/seoSeitenarten.golden.test.js */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { LOCALE_KONFIG, SEO_LOCALES, hatSeitenart, clusterAlternates, gegenstueck, seitenartFuerPfad } from '../lib/seoLocale.js';
import { pfadAnalysieren, lokalisierePfade } from '../lib/seoPfade.js';
import { bereichFuerLocale, BEREICHE } from '../lib/seoSitemap.js';
import { seoAufrufTyp } from '../routes/seo.js';

const DATEI = new URL('./golden/seo-funktionen.json', import.meta.url);
const LOCALES = Object.keys(LOCALE_KONFIG);
const PFADE = [
  '', 'film/x-1', 'serie/x-2', 'movie/x-1', 'tv-show/x-2', 'film', 'film/', 'film/x-1?seite=2',
  'filme', 'serien', 'movies', 'tv-shows', 'i-film', 'le-serie-tv', 'peliculas', 'films',
  'filme/drama', 'serien/krimi', 'movies/drama', 'filme/drama?seite=2', 'filme/drama/x',
  'schauspieler', 'regisseur', 'actors', 'directors', 'acteurs', 'schauspieler/x-1', 'regisseur/x-2', 'actors/x-1', 'directors/x-2',
  'streaming', 'streaming/netflix', 'streaming/netflix/x',
  'bestenlisten', 'rankings', 'classements', 'beste-filme', 'beste-serien', 'best-movies', 'melhores-series',
  'beste-filme/netflix', 'beste-filme/genre/drama', 'beste-serien/jahr/2020/x', 'best-movies/a/b/c/d', 'beste-filme/kino/x',
  'reihen', 'collections', 'sagas', 'reihen/matrix', 'collections/matrix',
  'kino', 'cinema', 'kino/neustarts', 'cinema/new-releases', 'cinema/neustarts', 'kino/new-releases', 'cinema/nouveautes',
  'kino/berlin', 'cinema/berlin', 'bioscoop/nieuwe-films', 'cine/estrenos', 'kino/neustarts/x',
  'neu-auf', 'neu-auf/netflix', 'new-on', 'new-on/netflix', 'nouveautes-sur', 'neu-auf/netflix/x',
  'international', 'unbekannt', 'unbekannt/x', 'film-x/1', 'sitemap-index.xml',
];
const NAMEN = ['start', 'titel', 'hub', 'genre', 'anbieter', 'reihe', 'person', 'schauspieler', 'regisseur', 'filme', 'serien',
  'streaming', 'bestenlisten', 'beste-filme', 'beste-serien', 'kino', 'neu-auf', 'reihen', 'kino_stadt', 'bestenliste', 'film', 'xyz'];
const BEREICHE_PLUS = [...BEREICHE, 'unbekannt'];

function berechnen() {
  const aus = {};
  for (const l of LOCALES) {
    aus[`hatSeitenart|${l}`] = NAMEN.map((n) => hatSeitenart(l, n));
    aus[`bereich|${l}`] = BEREICHE_PLUS.map((b) => bereichFuerLocale(l, b));
    for (const p of PFADE) {
      const pfad = `/${l}${p ? '/' + p : ''}`;
      const alt = clusterAlternates(l, pfad);
      aus[`pfad|${pfad}`] = {
        analysieren: pfadAnalysieren(pfad),
        lokalisiert: lokalisierePfade(pfad),
        seitenart: seitenartFuerPfad(pfad),
        aufrufTyp: seoAufrufTyp(pfad),
        cluster: alt,
        gegenstueck: SEO_LOCALES.map((z) => gegenstueck(z, l, pfad, alt)),
      };
    }
  }
  return JSON.parse(JSON.stringify(aus));
}

test('Seitenart-Funktionen entsprechen dem Golden', () => {
  const ist = berechnen();
  if (process.env.GOLDEN_SCHREIBEN) { writeFileSync(DATEI, '{\n' + Object.keys(ist).map((k) => JSON.stringify(k) + ': ' + JSON.stringify(ist[k])).join(',\n') + '\n}\n'); return; }
  const soll = JSON.parse(readFileSync(DATEI, 'utf8'));
  assert.deepEqual(Object.keys(ist), Object.keys(soll));
  for (const k of Object.keys(soll)) assert.deepEqual(ist[k], soll[k], k);
});
