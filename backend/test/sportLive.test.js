/* Tests fuer den Live-Ticker (lib/sportLive.js): Aus welchem
 * OpenLigaDB-Spielobjekt wird welcher Stand -- und wann ehrlicherweise
 * KEINER (leere Tore-Liste heisst "0:0 oder ungepflegt"). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standAusOlbSpiel } from '../lib/sportLive.js';

test('laufendes Spiel: Stand vom letzten Tor', () => {
  const stand = standAusOlbSpiel({
    matchIsFinished: false,
    goals: [
      { scoreTeam1: 1, scoreTeam2: 0, matchMinute: 12 },
      { scoreTeam1: 1, scoreTeam2: 1, matchMinute: 55 },
    ],
  });
  assert.deepEqual(stand, { heim: 1, gast: 1, beendet: false });
});

test('laufendes Spiel ohne gemeldete Tore: kein Stand', () => {
  assert.equal(standAusOlbSpiel({ matchIsFinished: false, goals: [] }), null);
  assert.equal(standAusOlbSpiel({ matchIsFinished: false }), null);
  assert.equal(standAusOlbSpiel(null), null);
});

test('beendetes Spiel: Endergebnis (resultTypeID 2) schlaegt Halbzeitstand', () => {
  const stand = standAusOlbSpiel({
    matchIsFinished: true,
    goals: [{ scoreTeam1: 1, scoreTeam2: 0, matchMinute: 12 }],
    matchResults: [
      { resultTypeID: 1, pointsTeam1: 1, pointsTeam2: 0 },
      { resultTypeID: 2, pointsTeam1: 2, pointsTeam2: 1 },
    ],
  });
  assert.deepEqual(stand, { heim: 2, gast: 1, beendet: true });
});

test('beendet gemeldet, aber noch ohne Ergebnis: kein Stand', () => {
  assert.equal(standAusOlbSpiel({ matchIsFinished: true, matchResults: [] }), null);
});
