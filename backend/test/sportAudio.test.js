/* Tests fuer die Zuordnung der ARD-Radioreportagen zu unseren Spielen
 * (lib/sportAudio.js). Die Namen schreiben sich bei ARD und OpenLigaDB
 * unterschiedlich -- hier haengt alles am Wortvergleich. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { woerter, gleichesTeam, titelTeams, passt } from '../lib/sportAudio.js';

test('woerter: Rechtsformen und Zahlen fallen weg', () => {
  assert.deepEqual([...woerter('FC Schalke 04')], ['schalke']);
  assert.deepEqual([...woerter('1. FSV Mainz 05')], ['mainz']);
  assert.deepEqual([...woerter('SpVgg Greuther Fürth')], ['greuther', 'fürth']);
});

test('woerter: Vereine, die NUR aus Fuellwoertern bestehen, behalten sie', () => {
  // "Hertha BSC" schrumpfte sonst auf nichts und passte zu keinem Spiel.
  assert.deepEqual([...woerter('Hertha BSC')], ['hertha', 'bsc']);
  assert.ok(woerter('Werder Bremen').size > 0);
});

test('gleichesTeam: unterschiedliche Schreibweisen derselben Mannschaft', () => {
  assert.equal(gleichesTeam('Bayern München', 'FC Bayern München'), true);
  assert.equal(gleichesTeam('HEBC Hamburg', 'Hamburg Eimsbütteler BC'), true);
  assert.equal(gleichesTeam('VSG Altglienicke', 'VSG Altglienicke Berlin'), true);
  assert.equal(gleichesTeam('Hertha BSC', 'Hertha BSC'), true);
});

test('gleichesTeam: Vereine mit gleichem Namensbestandteil bleiben getrennt', () => {
  assert.equal(gleichesTeam('Borussia Dortmund', 'Borussia Mönchengladbach'), false);
  assert.equal(gleichesTeam('Eintracht Frankfurt', 'Eintracht Braunschweig'), false);
  assert.equal(gleichesTeam('FC Bayern München', 'Bayer 04 Leverkusen'), false);
  assert.equal(gleichesTeam('Hertha BSC', 'Eintracht Braunschweig'), false);
});

test('titelTeams: "A gegen B" wird zerlegt, alles andere abgelehnt', () => {
  assert.deepEqual(titelTeams('VfL Osnabrück gegen Bayern München'),
    ['VfL Osnabrück', 'Bayern München']);
  // Highlight-Folgen tragen keinen Paarungstitel -- die duerfen nicht greifen.
  assert.equal(titelTeams('Die Audio-Highlights des Spieltags'), null);
});

const EINTRAG = {
  titel: 'Hallescher FC gegen FC Schalke 04',
  teams: ['Hallescher FC', 'FC Schalke 04'],
  start: new Date('2026-08-24T18:30:00Z'),
  dauer: 12300,
  url: 'https://www.ardsounds.de/episode/urn:ard:event-livestream:abc/',
};

test('passt: richtige Paarung im Zeitfenster', () => {
  assert.equal(passt(EINTRAG, {
    heim: 'Hallescher FC', gast: 'FC Schalke 04', anstoss: new Date('2026-08-24T18:45:00Z'),
  }), true);
  // Auch mit vertauschten Seiten (Heim/Gast in der ARD-Liste andersherum).
  assert.equal(passt(EINTRAG, {
    heim: 'FC Schalke 04', gast: 'Hallescher FC', anstoss: new Date('2026-08-24T18:45:00Z'),
  }), true);
});

test('passt: gleiche Zeit, andere Mannschaften -> nein', () => {
  assert.equal(passt(EINTRAG, {
    heim: 'SC Verl', gast: 'Hamburger SV', anstoss: new Date('2026-08-24T18:45:00Z'),
  }), false);
});

test('passt: gleiche Mannschaften, anderer Tag -> nein', () => {
  assert.equal(passt(EINTRAG, {
    heim: 'Hallescher FC', gast: 'FC Schalke 04', anstoss: new Date('2026-09-24T18:45:00Z'),
  }), false);
  // Sendeplaetze werden am selben Tag mehrfach belegt -- zwei Stunden
  // Abstand duerfen deshalb nicht mehr greifen.
  assert.equal(passt(EINTRAG, {
    heim: 'Hallescher FC', gast: 'FC Schalke 04', anstoss: new Date('2026-08-24T21:00:00Z'),
  }), false);
});

test('passt: Reportage beginnt vor dem Anpfiff, nicht danach', () => {
  // 20 Minuten Vorlauf ist der Normalfall.
  assert.equal(passt(EINTRAG, {
    heim: 'Hallescher FC', gast: 'FC Schalke 04', anstoss: new Date('2026-08-24T18:50:00Z'),
  }), true);
});
