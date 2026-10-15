/* Das Verzeichnis (lib/seoSeitenarten.js) muss dieselben Listen und Antworten liefern wie die
 * bisherigen Einzel-Definitionen (seoLocale.js, seoPfade.js, seoSitemap.js). Die Listen unten
 * sind die eingefrorenen Altwerte. DB-frei. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALE_KONFIG, localeIndexierbar, localesMitText } from '../lib/seoLocale.js';
import { slugify } from '../lib/slug.js';
import { lokalWort, deutschWort, lokalisierePfade } from '../lib/seoPfade.js';
import { BEREICHE, bereichFuerLocale as altBereich } from '../lib/seoSitemap.js';
import {
  PFADWOERTER, UNTERWOERTER, SEITENARTEN, SITEMAP_BEREICHE, CLUSTER_FORM, regionHubs, namenLokalisiert,
  bereichFuerLocale, hubPfade, wochenArten, alternatesTitel, alternatesPerson,
} from '../lib/seoSeitenarten.js';

const LOCALES = [...Object.keys(LOCALE_KONFIG), 'xx-xx'];
const alsMenge = (l) => [...l].sort();

test('Listen entsprechen den alten Konstanten', () => {
  assert.deepEqual(alsMenge(namenLokalisiert()), alsMenge([
    'start', 'titel', 'hub', 'genre', 'anbieter', 'reihe',
    'filme', 'serien', 'streaming', 'bestenlisten', 'beste-filme', 'beste-serien', 'kino', 'neu-auf', 'reihen']));
  assert.deepEqual(alsMenge(CLUSTER_FORM.einsegmentig), alsMenge(['filme', 'serien', 'reihen', 'bestenlisten', 'beste-filme', 'beste-serien']));
  assert.deepEqual(CLUSTER_FORM.unterseite, { filme: 'genre', serien: 'genre', reihen: 'reihe' });
  assert.deepEqual(alsMenge(regionHubs()), alsMenge(['streaming', 'kino', 'neu-auf']));
  assert.deepEqual(SITEMAP_BEREICHE, BEREICHE);
  assert.deepEqual(hubPfade().map((h) => h.pfad),
    ['start', 'filme', 'serien', 'kino', 'streaming', 'bestenlisten', 'reihen', 'beste-filme', 'beste-serien', 'schauspieler', 'regisseur']);
  assert.deepEqual(wochenArten().map((w) => w.pfad), ['neu-auf', 'neu-auf/', 'kino/neustarts']);
});

test('Pfadwoerter entsprechen seoPfade.js (inkl. Reihenfolge der Regex-Alternativen)', () => {
  const de = ['film', 'serie', 'filme', 'serien', 'streaming', 'bestenlisten', 'beste-filme', 'beste-serien',
    'kino', 'neu-auf', 'reihen', 'regisseur', 'schauspieler'];
  assert.deepEqual(Object.keys(PFADWOERTER), de);
  for (const l of Object.keys(LOCALE_KONFIG)) {
    const sprache = LOCALE_KONFIG[l].sprache;
    for (const w of de) {
      const erwartet = sprache === 'de' ? w : PFADWOERTER[w][sprache];
      assert.equal(lokalWort(l, w), erwartet, `${l} ${w}`);
      if (sprache !== 'de' && erwartet !== w) assert.equal(deutschWort(l, erwartet) !== null, true);
    }
    if (sprache !== 'de') {
      assert.equal(lokalisierePfade(`/${l}/kino/neustarts`), `/${l}/${PFADWOERTER.kino[sprache]}/${UNTERWOERTER.kino.neustarts[sprache]}`);
    }
  }
});

test('Jede Seitenart hat Routen; Namen und ids sind eindeutig', () => {
  const ids = SEITENARTEN.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  const namen = SEITENARTEN.flatMap((s) => s.namen);
  assert.equal(new Set(namen).size, namen.length);
  for (const s of SEITENARTEN) assert.ok(s.routen.length > 0, s.id);
});

test('Sitemap-Bereiche pro Locale entsprechen seoSitemap.js', () => {
  for (const l of LOCALES) {
    for (const b of [...BEREICHE, 'unbekannt']) assert.equal(bereichFuerLocale(l, b), altBereich(l, b), `bereich ${l} ${b}`);
  }
});

test('hreflang-Listen von Titel und Person wie vor dem Verzeichnis', () => {
  const titel = { textLocales: ['de-de', 'en-gb', 'fr-fr', 'xx-xx'], slugBasis: 'Der Pate', slug: 'der-pate', tmdbId: 238 };
  const erwartetT = titel.textLocales.filter((l) => localeIndexierbar(l))
    .map((l) => ({ locale: l, pfad: `/${l}/film/${slugify(titel.slugBasis, l)}-238` }));
  assert.deepEqual(alternatesTitel(titel, 'film'), erwartetT);
  assert.equal(alternatesTitel({ textLocales: [], slug: 'x', tmdbId: 1 }, 'film'), undefined);
  assert.deepEqual(alternatesTitel({ textLocales: ['en-gb'], slug: 'x', tmdbId: 1 }, 'serie'), [{ locale: 'en-gb', pfad: '/en-gb/serie/x-1' }]);
  const person = { rolle: 'regisseur', slug: 'x', tmdbPersonId: 5, textLocales: ['en-gb', 'nl-nl'] };
  const cluster = [...new Set([...localesMitText(['de-de']), ...person.textLocales])].filter((l) => localeIndexierbar(l));
  assert.deepEqual(alternatesPerson(person), cluster.map((l) => ({ locale: l, pfad: `/${l}/regisseur/x-5` })));
});
