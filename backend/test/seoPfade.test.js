import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lokalisierePfade, pfadAnalysieren, lokalWort, deutschWort } from '../lib/seoPfade.js';

test('lokalisierePfade: Links, canonical und Sitemap-URLs je Sprache, de-de unveraendert', () => {
  const t = '<a href="/en-gb/film/x-1">https://movietaste.de/fr-fr/beste-filme/genre/drama /de-de/film/a /it-it/filme/horror /en-gb/streaming /en-gb/filmografie';
  assert.equal(lokalisierePfade(t),
    '<a href="/en-gb/movie/x-1">https://movietaste.de/fr-fr/meilleurs-films/genre/drama /de-de/film/a /it-it/i-film/horror /en-gb/streaming /en-gb/filmografie');
});

test('pfadAnalysieren: lokale Woerter intern deutsch, deutsche Woerter in Nicht-de leiten um', () => {
  assert.deepEqual(pfadAnalysieren('/en-gb/movies/drama'), { pfad: '/en-gb/filme/drama' });
  assert.deepEqual(pfadAnalysieren('/en-gb/filme/drama'), { pfad: '/en-gb/filme/drama', umleiten: '/en-gb/movies/drama' });
  assert.deepEqual(pfadAnalysieren('/fr-fr/film/a-1'), { pfad: '/fr-fr/film/a-1' });
  assert.deepEqual(pfadAnalysieren('/de-de/filme'), { pfad: '/de-de/filme' });
  assert.deepEqual(pfadAnalysieren('/en-gb'), { pfad: '/en-gb' });
});

test('Woerter sind je Sprache eindeutig und umkehrbar', () => {
  for (const locale of ['en-gb', 'fr-fr', 'es-es', 'it-it', 'nl-nl', 'pt-pt']) {
    const lokal = ['film', 'serie', 'filme', 'serien', 'streaming', 'bestenlisten', 'beste-filme', 'beste-serien',
      'kino', 'neu-auf', 'reihen', 'regisseur', 'schauspieler'].map((w) => lokalWort(locale, w));
    assert.equal(new Set(lokal).size, lokal.length, locale);
    lokal.forEach((w) => assert.ok(deutschWort(locale, w), `${locale}:${w}`));
  }
});

test('kino/neustarts: lokales Unterwort, Rundreise und 301', () => {
  const aus = lokalisierePfade('/en-gb/kino/neustarts /fr-fr/kino/neustarts" /de-de/kino/neustarts /en-gb/kino/berlin /en-gb/neu-auf/neustarts');
  assert.equal(aus, '/en-gb/cinema/new-releases /fr-fr/cinema/nouveautes" /de-de/kino/neustarts /en-gb/cinema/berlin /en-gb/new-on/neustarts');
  assert.deepEqual(pfadAnalysieren('/en-gb/cinema/new-releases'), { pfad: '/en-gb/kino/neustarts' });
  assert.deepEqual(pfadAnalysieren('/pt-pt/cinema/estreias'), { pfad: '/pt-pt/kino/neustarts' });
  assert.deepEqual(pfadAnalysieren('/en-gb/cinema/neustarts'), { pfad: '/en-gb/cinema/neustarts', umleiten: '/en-gb/cinema/new-releases' });
  assert.deepEqual(pfadAnalysieren('/en-gb/kino/neustarts'), { pfad: '/en-gb/kino/neustarts', umleiten: '/en-gb/cinema/new-releases' });
  assert.deepEqual(pfadAnalysieren('/de-de/kino/neustarts'), { pfad: '/de-de/kino/neustarts' });
  assert.deepEqual(pfadAnalysieren('/en-gb/cinema/berlin'), { pfad: '/en-gb/kino/berlin' });
});
