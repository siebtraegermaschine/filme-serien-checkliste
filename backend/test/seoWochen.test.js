/* Reine Logik und Render der Wochen-Seiten (kein DB-Zugriff). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  istImportTag, streamingFenster, kinoFenster, tageZwischen, heuteBerlin, datumDeutsch,
  streamingEinleitung, kinoEinleitung,
} from '../lib/seoWochen.js';
import { seiteNeuAufAnbieter, seiteNeuAufUebersicht, seiteKinoNeustarts } from '../lib/seoRender.js';
import { seoAufrufTyp } from '../routes/seo.js';

const TAG = 24 * 3_600_000;
const JETZT = Date.UTC(2026, 9, 12, 10);
const vor = (tage) => ({ datum: JETZT - tage * TAG });

test('istImportTag: nur grosse Tage mit hohem Anteil', () => {
  assert.equal(istImportTag(900, 1000), true);
  assert.equal(istImportTag(50, 100), true);
  assert.equal(istImportTag(40, 60), false);      // unter 50 Zeilen
  assert.equal(istImportTag(60, 1000), false);    // normaler Spitzentag
  assert.equal(istImportTag(5, 0), false);
});

test('streamingFenster: 7 Tage, dann 14, dann nicht indexierbar', () => {
  const sieben = streamingFenster([0, 1, 2, 3, 6].map(vor), JETZT);
  assert.deepEqual([sieben.tage, sieben.indexierbar], [7, true]);
  const vierzehn = streamingFenster([0, 1, 8, 9, 13].map(vor), JETZT);
  assert.deepEqual([vierzehn.tage, vierzehn.eintraege.length, vierzehn.indexierbar], [14, 5, true]);
  const leer = streamingFenster([0, 1, 20].map(vor), JETZT);
  assert.deepEqual([leer.tage, leer.indexierbar], [14, false]);
});

test('kinoFenster: gestartet, naechste Woche, Schwelle 3', () => {
  const e = ['2026-10-12', '2026-10-09', '2026-10-06', '2026-10-13', '2026-10-19', '2026-10-20'].map((start) => ({ start }));
  const f = kinoFenster(e, '2026-10-12');
  assert.equal(f.tage, 7);
  assert.equal(f.gestartet.length, 3);
  assert.equal(f.naechste.length, 2);          // 20.10. liegt ausserhalb
  assert.equal(f.indexierbar, true);
  const duenn = kinoFenster([{ start: '2026-10-10' }, { start: '2026-10-02' }], '2026-10-12');
  assert.deepEqual([duenn.tage, duenn.gestartet.length, duenn.indexierbar], [14, 2, false]);
});

test('Datumshelfer', () => {
  assert.equal(tageZwischen('2026-10-05', '2026-10-12'), 7);
  assert.equal(datumDeutsch('2026-10-12'), '12.10.2026');
  assert.equal(heuteBerlin(Date.UTC(2026, 9, 11, 23, 30)), '2026-10-12');   // Berlin ist UTC+2
});

test('Einleitungen nennen Stand und Fenster', () => {
  const t = streamingEinleitung({ name: 'Netflix', tage: 14, filme: 1, serien: 2, stand: '2026-10-12' });
  assert.match(t, /Stand 12\.10\.2026/);
  assert.match(t, /14 Tagen/);
  assert.match(t, /1 Film und 2 Serien/);
  assert.match(kinoEinleitung({ tage: 7, gestartet: 4, naechste: 0, stand: '2026-10-12' }), /4 Filme/);
});

const karte = (n, hatSeite = true) => ({ tmdbId: n, slug: `t${n}`, title: `Titel ${n}`, year: 2026, genres: [], rating: 7, posterPath: null, hatSeite });

test('Render: Anbieter-Seite index bzw. noindex, Titel ohne Seite ohne Link', () => {
  const daten = {
    slug: 'netflix', name: 'Netflix', tage: 7, stand: '2026-10-12', indexierbar: true, andere: [{ slug: 'disney', name: 'Disney+' }],
    filme: [karte(1), karte(2, false)], serien: [karte(3)],
  };
  const html = seiteNeuAufAnbieter(daten, 'de-de');
  assert.match(html, /index,follow/);
  assert.match(html, /rel="canonical" href="[^"]*\/de-de\/neu-auf\/netflix"/);
  assert.match(html, /\/de-de\/neu-auf\/disney/);
  assert.match(html, /Titel 2/);
  assert.doesNotMatch(html, /titel-2-2|t2-2/);
  const klein = seiteNeuAufAnbieter({ ...daten, indexierbar: false, filme: [], serien: [] }, 'de-de');
  assert.match(klein, /noindex,follow/);
});

test('Render: Uebersicht und Kino-Neustarts', () => {
  const uebersicht = seiteNeuAufUebersicht({ stand: '2026-10-12', indexierbar: true, anbieter: [{ slug: 'netflix', name: 'Netflix', tage: 7, filme: [karte(1)], serien: [] }] }, 'de-de');
  assert.match(uebersicht, /\/de-de\/neu-auf\/netflix/);
  assert.match(uebersicht, /index,follow/);
  const kino = seiteKinoNeustarts({ stand: '2026-10-12', tage: 7, gestartet: [karte(1)], naechste: [karte(2)], staedte: [{ ort: 'Berlin', slug: 'berlin' }], indexierbar: false }, 'de-de');
  assert.match(kino, /noindex,follow/);
  assert.match(kino, /Nächste Woche/);
  assert.match(kino, /\/de-de\/kino\/berlin/);
});

test('seoAufrufTyp: Wochen-Seiten haben eigene Typen, Unbekanntes faellt auf das erste Segment', () => {
  assert.equal(seoAufrufTyp('/de-de/neu-auf'), 'neu-auf');
  assert.equal(seoAufrufTyp('/de-de/neu-auf/netflix'), 'neu-anbieter');
  assert.equal(seoAufrufTyp('/de-de/kino/neustarts'), 'kino-neustarts');
  assert.equal(seoAufrufTyp('/de-de/kino/berlin'), 'kino');
  assert.equal(seoAufrufTyp('/de-de/irgendwas'), 'irgendwas');
});
