/* Tests fuer den Erinnerungstext der Spielbeginn-Pushes (lib/sportPush.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erinnerungsText } from '../lib/sportPush.js';

const SENDER = {
  sky: { name: 'Sky/WOW', frei: false },
  ard: { name: 'ARD', frei: true },
};
const WETTBEWERBE = { dfb: { name: 'DFB-Pokal' } };

test('Erinnerung: Paarung im Titel, Zeit/Wettbewerb/Sender im Text', () => {
  const n = erinnerungsText({
    heim: 'Hallescher FC', gast: 'FC Schalke 04', wettbewerb: 'dfb',
    anstoss: new Date('2026-08-24T18:45:00Z'),
    tv: [{ s: 'sky', kanal: 'Sky Sport 3' }, { s: 'ard' }],
  }, SENDER, WETTBEWERBE);
  assert.equal(n.titel, '⚽ Hallescher FC – FC Schalke 04');
  assert.equal(n.text, 'Anstoß 20:45 Uhr (DFB-Pokal) · läuft bei Sky/WOW und ARD · Free-TV');
  assert.equal(n.url, '/sport');
});

test('Erinnerung ohne Sender-Zuordnung sagt das ehrlich', () => {
  const n = erinnerungsText({
    heim: 'A', gast: 'B', wettbewerb: 'xy',
    anstoss: new Date('2026-08-24T13:00:00Z'), tv: [],
  }, {}, {});
  assert.equal(n.text, 'Anstoß 15:00 Uhr (xy) · Sender noch offen');
});

test('doppelte Sendernamen (Einzelspiel + Konferenz) erscheinen nur einmal', () => {
  const n = erinnerungsText({
    heim: 'A', gast: 'B', wettbewerb: 'dfb',
    anstoss: new Date('2026-08-24T13:00:00Z'),
    tv: [{ s: 'sky' }, { s: 'sky', typ: 'konferenz' }],
  }, SENDER, WETTBEWERBE);
  assert.equal(n.text.indexOf('Sky/WOW und Sky/WOW'), -1);
  assert.ok(n.text.indexOf('Sky/WOW') !== -1);
});
