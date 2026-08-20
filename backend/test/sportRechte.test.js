/* Tests fuer die Sender-Zuordnung des Sport-Bereichs (lib/sportRechte.js).
 *
 * Reine Funktionstests ohne Datenbank. Die Zeitpunkte sind UTC und bewusst im
 * Sommer gewaehlt (Berlin = UTC+2): Sa 13:30Z = 15:30 Ortszeit -- genau der
 * Slot, an dem Einzelspiel (Sky) und Konferenz (DAZN) auseinanderfallen. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { berlinTagZeit, saisonBlock, tvFuerSpiele } from '../lib/sportRechte.js';

// Gegen die ECHTE Matrix testen, nicht gegen ein Spielzeug-Exemplar: Die Tests
// sollen brechen, wenn jemand die produktiven Regeln kaputt editiert.
const RECHTE = JSON.parse(readFileSync(new URL('../../sport-rechte.json', import.meta.url), 'utf8'));

test('berlinTagZeit: UTC wird zu Berliner Ortszeit (Sommerzeit)', () => {
  assert.deepEqual(berlinTagZeit('2026-08-22T13:30:00Z'),
    { tag: 'Sat', zeit: '15:30', datum: '2026-08-22' });
});

test('berlinTagZeit: Winterzeit (UTC+1)', () => {
  // 2026-12-11 ist ein Freitag; 19:30Z = 20:30 Ortszeit.
  assert.deepEqual(berlinTagZeit('2026-12-11T19:30:00Z'),
    { tag: 'Fri', zeit: '20:30', datum: '2026-12-11' });
});

test('Bundesliga: die vier festen Slots', () => {
  const spiele = [
    { id: 'fr', anstossUtc: '2026-08-21T18:30:00Z' },  // Fr 20:30 -> Sky
    { id: 'sa1530', anstossUtc: '2026-08-22T13:30:00Z' }, // Sa 15:30 -> Sky + DAZN-Konferenz
    { id: 'sa1830', anstossUtc: '2026-08-22T16:30:00Z' }, // Sa 18:30 Topspiel -> Sky
    { id: 'so', anstossUtc: '2026-08-23T15:30:00Z' },  // So 17:30 -> DAZN
  ];
  const tv = tvFuerSpiele(RECHTE, 'bl1', '2026', spiele);
  // Nur Sender/Typ pruefen -- die Kanal-Texte (kanal) sind Anzeige-Details,
  // die sich aendern duerfen, ohne dass die Zuordnung falsch wird.
  const schlank = (id) => tv.get(id).map(({ s, typ }) => (typ ? { s, typ } : { s }));
  assert.deepEqual(schlank('fr'), [{ s: 'sky' }]);
  assert.deepEqual(schlank('sa1530'), [{ s: 'sky' }, { s: 'dazn', typ: 'konferenz' }]);
  assert.deepEqual(schlank('sa1830'), [{ s: 'sky' }]);
  assert.deepEqual(schlank('so'), [{ s: 'dazn' }]);
});

test('Champions League: Dienstag unsicher (Amazon-Pick unbekannt), Mittwoch sicher', () => {
  const tv = tvFuerSpiele(RECHTE, 'ucl', '2026', [
    { id: 'di', anstossUtc: '2026-09-15T19:00:00Z' },  // Di 21:00
    { id: 'mi', anstossUtc: '2026-09-16T19:00:00Z' },  // Mi 21:00
  ]);
  assert.deepEqual(tv.get('di'), [{ s: 'dazn', unsicher: true }]);
  assert.deepEqual(tv.get('mi'), [{ s: 'dazn' }]);
});

test('Ausnahme "ersetzen": Amazon-Pick verdraengt DAZN und macht den Rest des Tages sicher', () => {
  const rechte = structuredClone(RECHTE);
  rechte.saisons['2026'].ucl.ausnahmen = { pick: { ersetzen: [{ s: 'amazon' }] } };
  const tv = tvFuerSpiele(rechte, 'ucl', '2026', [
    { id: 'pick', anstossUtc: '2026-09-15T19:00:00Z' },   // Di, Amazons Spiel
    { id: 'rest', anstossUtc: '2026-09-15T16:45:00Z' },   // Di 18:45, gleicher Tag
    { id: 'andererDi', anstossUtc: '2026-09-29T19:00:00Z' }, // naechster Spieltag: weiter unsicher
  ]);
  assert.deepEqual(tv.get('pick'), [{ s: 'amazon' }]);
  assert.deepEqual(tv.get('rest'), [{ s: 'dazn' }]);
  assert.deepEqual(tv.get('andererDi'), [{ s: 'dazn', unsicher: true }]);
});

test('Ausnahme "zusatz": Free-TV ergaenzt den Abo-Sender, ersetzt ihn nicht', () => {
  const rechte = structuredClone(RECHTE);
  rechte.saisons['2026'].dfb.ausnahmen = { '42': { zusatz: [{ s: 'ard' }] } };
  const tv = tvFuerSpiele(rechte, 'dfb', '2026', [
    { id: '42', anstossUtc: '2026-08-22T18:45:00Z' },
  ]);
  assert.deepEqual(tv.get('42').map(({ s }) => ({ s })), [{ s: 'sky' }, { s: 'ard' }]);
});

test('saisonBlock: unbekannte Saison erbt die juengste davor', () => {
  assert.equal(saisonBlock(RECHTE, '2030'), RECHTE.saisons['2026']);
  assert.equal(saisonBlock(RECHTE, '2024'), RECHTE.saisons['2025']); // aeltester vorhandener
});

test('unbekannter Wettbewerb: leere Zuordnung statt Absturz', () => {
  const tv = tvFuerSpiele(RECHTE, 'nfl', '2026', [{ id: '1', anstossUtc: '2026-08-22T13:30:00Z' }]);
  assert.deepEqual(tv.get('1'), []);
});
