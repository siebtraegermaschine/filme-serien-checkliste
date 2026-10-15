/* Das Verzeichnis (lib/seoSeitenarten.js) muss dieselben Listen und Antworten liefern wie die
 * bisherigen Einzel-Definitionen (seoLocale.js, seoPfade.js, seoSitemap.js). Die Listen unten
 * sind die eingefrorenen Altwerte. DB-frei. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALE_KONFIG, SEO_LOCALES, hatSeitenart as altHat, clusterAlternates as altCluster,
  gegenstueck as altGegen, seitenartFuerPfad } from '../lib/seoLocale.js';
import { lokalWort, deutschWort, lokalisierePfade } from '../lib/seoPfade.js';
import { BEREICHE, bereichFuerLocale as altBereich } from '../lib/seoSitemap.js';
import {
  PFADWOERTER, UNTERWOERTER, SEITENARTEN, SITEMAP_BEREICHE, CLUSTER_FORM, regionHubs, namenLokalisiert,
  hatSeitenart, clusterAlternates, gegenstueck, bereichFuerLocale, seitenartFuer, hubPfade, wochenArten,
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

test('abgeleitete Funktionen liefern dasselbe wie die alten', () => {
  const namen = ['start', 'titel', 'hub', 'genre', 'anbieter', 'reihe', 'person', 'schauspieler', 'regisseur', 'filme', 'serien',
    'streaming', 'bestenlisten', 'beste-filme', 'beste-serien', 'kino', 'neu-auf', 'reihen', 'kino_stadt', 'bestenliste', 'film', 'xyz'];
  const pfade = ['', 'filme', 'serien', 'reihen', 'bestenlisten', 'beste-filme', 'beste-serien', 'streaming', 'kino', 'neu-auf',
    'filme/drama', 'serien/krimi', 'reihen/matrix', 'filme/drama/x', 'streaming/netflix', 'kino/berlin', 'kino/neustarts', 'film/x-1',
    'schauspieler', 'regisseur', 'filme/drama?seite=2', 'xyz'];
  for (const l of LOCALES) {
    for (const n of namen) assert.equal(hatSeitenart(l, n), altHat(l, n), `hat ${l} ${n}`);
    for (const b of [...BEREICHE, 'unbekannt']) assert.equal(bereichFuerLocale(l, b), altBereich(l, b), `bereich ${l} ${b}`);
    for (const p of pfade) {
      const pfad = `/${l}${p ? '/' + p : ''}`;
      assert.equal(seitenartFuer(pfad), seitenartFuerPfad(pfad), pfad);
      const alt = altCluster(l, pfad);
      assert.deepEqual(clusterAlternates(l, pfad), alt, `cluster ${pfad}`);
      for (const z of SEO_LOCALES) assert.equal(gegenstueck(z, l, pfad, alt), altGegen(z, l, pfad, alt), `gegen ${z} ${pfad}`);
    }
  }
});
