import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listeAusPfad, listeZuPfad, schluesselZuPfad, analyticsTypFuerListe, listeTitel,
} from '../lib/seoBestenlisten.js';
import { seoAufrufTyp } from '../routes/seo.js';

test('listeAusPfad: alle Seitenarten, Unsinn ergibt null', () => {
  assert.deepEqual(listeAusPfad('jahr', '1999'), { modus: 'jahr', wert: '1999' });
  assert.deepEqual(listeAusPfad('anbieter', 'netflix'), { modus: 'anbieter', wert: 'netflix' });
  assert.deepEqual(listeAusPfad('jahrzehnt', '1990'), { modus: 'jahrzehnt', wert: '1990' });
  assert.deepEqual(listeAusPfad('thema', 'weihnachten'), { modus: 'thema', wert: 'weihnachten' });
  assert.deepEqual(listeAusPfad('im-kino'), { modus: 'kino', wert: 'aktuell' });
  assert.deepEqual(listeAusPfad('neu'), { modus: 'neu', wert: 'aktuell' });
  assert.deepEqual(listeAusPfad('genre', 'action', 'jahrzehnt', '1990'), { modus: 'genre-jahrzehnt', wert: 'action+1990' });
  assert.deepEqual(listeAusPfad('genre', 'action', 'anbieter', 'netflix'), { modus: 'genre-anbieter', wert: 'action+netflix' });
  assert.equal(listeAusPfad('jahrzehnt', '1995'), null);
  assert.equal(listeAusPfad('thema', 'unbekannt'), null);
  assert.equal(listeAusPfad('im-kino', 'x'), null);
  assert.equal(listeAusPfad('genre', 'action', 'jahr', '1990'), null);
});

test('Schluessel <-> Pfad sind umkehrbar', () => {
  assert.equal(schluesselZuPfad('jahr:1999:movie', 'de-de'), '/de-de/beste-filme/jahr/1999');
  assert.equal(schluesselZuPfad('genre-jahrzehnt:action+1990:series', 'de-de'), '/de-de/beste-serien/genre/action/jahrzehnt/1990');
  assert.equal(schluesselZuPfad('kino:aktuell:movie', 'de-de'), '/de-de/beste-filme/im-kino');
  assert.equal(schluesselZuPfad('neu:aktuell:series', 'de-de'), '/de-de/beste-serien/neu');
  assert.equal(schluesselZuPfad('kaputt', 'de-de'), null);
  assert.equal(listeZuPfad('genre-anbieter', 'action+netflix'), 'genre/action/anbieter/netflix');
});

test('Analytics-Typ: neue Arten getrennt, Hub/Jahr/Genre bleiben beste-filme', () => {
  assert.equal(seoAufrufTyp('/de-de/beste-filme/anbieter/netflix'), 'beste-anbieter');
  assert.equal(seoAufrufTyp('/de-de/beste-serien/jahrzehnt/1990'), 'beste-jahrzehnt');
  assert.equal(seoAufrufTyp('/de-de/beste-filme/thema/weihnachten'), 'beste-thema');
  assert.equal(seoAufrufTyp('/de-de/beste-filme/genre/action/jahrzehnt/1990'), 'beste-genre-jahrzehnt');
  assert.equal(seoAufrufTyp('/de-de/beste-filme/genre/action/anbieter/netflix'), 'beste-genre-anbieter');
  assert.equal(seoAufrufTyp('/de-de/beste-filme/im-kino'), 'beste-kino');
  assert.equal(seoAufrufTyp('/de-de/beste-filme/neu'), 'beste-neu');
  assert.equal(seoAufrufTyp('/de-de/beste-filme'), 'beste-filme');
  assert.equal(seoAufrufTyp('/de-de/beste-filme/genre/action'), 'beste-filme');
  assert.equal(seoAufrufTyp('/de-de/beste-serien/jahr/2024'), 'beste-serien');
  assert.equal(analyticsTypFuerListe(['beste-filme']), null);
});

test('listeTitel: Ueberschriften nennen das Genre', () => {
  assert.equal(listeTitel('movie', 'genre', 'action', { genre: 'Action' }), 'Beste Filme im Genre Action');
  assert.equal(listeTitel('series', 'anbieter', 'netflix', { anbieter: 'Netflix' }), 'Beste Serien auf Netflix');
  assert.equal(listeTitel('movie', 'genre-jahrzehnt', 'action+1990', { genre: 'Action' }), 'Beste Filme im Genre Action der 1990er');
  assert.equal(listeTitel('movie', 'thema', 'weihnachten'), 'Beste Weihnachtsfilme');
  assert.equal(listeTitel('movie', 'neu', 'aktuell'), 'Beste neue Filme');
});

test('seiteBestenliste: h1 mit Genre, Rueckverweise, Kombi-Chips, noindex ohne Text', async () => {
  const { seiteBestenliste } = await import('../lib/seoRender.js');
  const titel = [{ title: 'Alpha', slug: 'alpha', tmdbId: 1, year: 1999, rating: 7.5, communityBewertung: null }];
  const basis = {
    type: 'movie', modus: 'genre', wert: 'action', genre: 'Action', genreSlug: 'action', anbieter: null,
    ueberschrift: 'Beste Filme im Genre Action', titel, text: null, indexierbar: false,
    verwandt: [{ titel: 'Nach Jahrzehnt', links: [{ label: '1990er', modus: 'genre-jahrzehnt', wert: 'action+1990' }] }],
  };
  const html = seiteBestenliste(basis, 'de-de');
  assert.match(html, /<h1>Beste Filme im Genre Action<\/h1>/);
  assert.match(html, /href="\/de-de\/filme\/action">Alle Action-Filme/);
  assert.match(html, /href="\/de-de\/beste-filme\/genre\/action\/jahrzehnt\/1990">1990er/);
  assert.match(html, /noindex/);
  assert.match(html, /Start[\s\S]*Bestenlisten[\s\S]*Beste Filme/);
  const kombi = seiteBestenliste({ ...basis, modus: 'genre-anbieter', wert: 'action+netflix', anbieter: 'Netflix',
    ueberschrift: 'Beste Filme im Genre Action auf Netflix', verwandt: [], text: 'Text.', indexierbar: true }, 'de-de');
  assert.match(kombi, /href="\/de-de\/beste-filme\/genre\/action">Beste Filme im Genre Action/);
  assert.match(kombi, /href="\/de-de\/beste-filme\/anbieter\/netflix">Beste Filme auf Netflix/);
  assert.doesNotMatch(kombi, /noindex/);
});

test('seiteAnbieter/seiteGenre verlinken die Bestenliste', async () => {
  const { seiteAnbieter, seiteGenre } = await import('../lib/seoRender.js');
  const a = seiteAnbieter({ anbieterSlug: 'netflix', name: 'Netflix', filme: [], serien: [], text: null, indexierbar: false,
    besteListen: { filme: true, serien: false } }, 'de-de');
  assert.match(a, /href="\/de-de\/beste-filme\/anbieter\/netflix"/);
  assert.doesNotMatch(a, /beste-serien\/anbieter/);
  const g = seiteGenre({ type: 'series', genre: 'Drama', genreSlug: 'drama', seite: 1, seiten: 1, gesamt: 0, titel: [], text: null, indexierbar: false }, 'de-de');
  assert.match(g, /href="\/de-de\/beste-serien\/genre\/drama"/);
});

test('Textgenerator: Kino/Neu ohne Zahlen und Titel, Genre-Text nennt die Spitze', async () => {
  const { bauText } = await import('../scripts/seo-bestenlisten-texte.mjs');
  const titel = [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }];
  const kino = bauText({ type: 'movie', modus: 'kino', wert: 'aktuell', gesamtGefunden: 34, titel });
  assert.doesNotMatch(kino, /34|„A“/);
  const neu = bauText({ type: 'series', modus: 'neu', wert: 'aktuell', gesamtGefunden: 900, titel });
  assert.match(neu, /Die besten neuen Serien/);
  const genre = bauText({ type: 'movie', modus: 'genre', wert: 'action', genre: 'Action', gesamtGefunden: 1234, titel });
  assert.match(genre, /über 1000 Filme/);
  assert.match(genre, /„A“, „B“ und „C“/);
  assert.match(genre, /Alle Action-Filme/);
});
