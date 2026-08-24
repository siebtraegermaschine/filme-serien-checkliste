/* Tests fuer die waehlbaren Erinnerungs-Zeitpunkte (lib/sportPush.js):
 * Wann ist welche Stufe faellig -- und was steht dann in der Mitteilung. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zielZeitpunkt, istFaellig, erinnerungsText, ARTEN } from '../lib/sportPush.js';

// Anstoss 20:30 Uhr Berliner Zeit (Sommerzeit: 18:30 UTC).
const ANSTOSS = new Date('2026-08-28T18:30:00Z');

test('zielZeitpunkt: Vorlaufstufen rechnen schlicht zurueck', () => {
  assert.equal(zielZeitpunkt('vor120', ANSTOSS).toISOString(), '2026-08-28T16:30:00.000Z');
  assert.equal(zielZeitpunkt('vor60', ANSTOSS).toISOString(), '2026-08-28T17:30:00.000Z');
  assert.equal(zielZeitpunkt('vor30', ANSTOSS).toISOString(), '2026-08-28T18:00:00.000Z');
  assert.equal(zielZeitpunkt('vor5', ANSTOSS).toISOString(), '2026-08-28T18:25:00.000Z');
  assert.equal(zielZeitpunkt('anstoss', ANSTOSS).toISOString(), ANSTOSS.toISOString());
});

test('zielZeitpunkt: morgens8 trifft 8 Uhr Berliner Zeit am Spieltag', () => {
  // Sommerzeit: 8:00 Berlin = 06:00 UTC.
  assert.equal(zielZeitpunkt('morgens8', ANSTOSS).toISOString(), '2026-08-28T06:00:00.000Z');
  // Winterzeit (Januar): 8:00 Berlin = 07:00 UTC -- nicht stur 14,5 Stunden
  // vor Anstoss, sondern aus der oertlichen Uhrzeit gerechnet.
  const winter = new Date('2027-01-30T14:30:00Z');   // 15:30 Berlin
  assert.equal(zielZeitpunkt('morgens8', winter).toISOString(), '2027-01-30T07:00:00.000Z');
});

test('zielZeitpunkt: Anstoss vor 8 Uhr kennt keine Morgenmeldung', () => {
  const frueh = new Date('2026-06-13T04:00:00Z');    // 6:00 Berlin
  assert.equal(zielZeitpunkt('morgens8', frueh), null);
});

test('zielZeitpunkt: unbekannte Stufe liefert null statt zu raten', () => {
  assert.equal(zielZeitpunkt('vor42', ANSTOSS), null);
  assert.equal(zielZeitpunkt('toralarm', ANSTOSS), null);
});

test('istFaellig: nur im Kulanzfenster nach dem Zielzeitpunkt', () => {
  // vor30 ist um 18:00 UTC faellig.
  assert.equal(istFaellig('vor30', ANSTOSS, new Date('2026-08-28T17:59:00Z')), false);  // zu frueh
  assert.equal(istFaellig('vor30', ANSTOSS, new Date('2026-08-28T18:00:00Z')), true);   // Punkt
  assert.equal(istFaellig('vor30', ANSTOSS, new Date('2026-08-28T18:09:00Z')), true);   // Kulanz
  assert.equal(istFaellig('vor30', ANSTOSS, new Date('2026-08-28T18:11:00Z')), false);  // zu spaet
});

test('istFaellig: spaet eingerichtetes Abo bekommt keine Nachzuegler', () => {
  // Kurz vor Anpfiff abonniert: die 2-Stunden-Stufe ist laengst durch und
  // wird uebersprungen, die 5-Minuten-Stufe greift noch.
  const kurzVorher = new Date('2026-08-28T18:26:00Z');
  assert.equal(istFaellig('vor120', ANSTOSS, kurzVorher), false);
  assert.equal(istFaellig('vor5', ANSTOSS, kurzVorher), true);
});

test('istFaellig: zum Anstoss, aber nicht mehr in der zweiten Halbzeit', () => {
  assert.equal(istFaellig('anstoss', ANSTOSS, new Date('2026-08-28T18:30:00Z')), true);
  assert.equal(istFaellig('anstoss', ANSTOSS, new Date('2026-08-28T19:20:00Z')), false);
});

const SENDER = { sky: { name: 'Sky/WOW', frei: false }, ard: { name: 'ARD', frei: true } };
const WETTBEWERBE = { dfb: { name: 'DFB-Pokal' } };
const SPIEL = {
  heim: 'Hallescher FC', gast: 'FC Schalke 04', wettbewerb: 'dfb',
  anstoss: new Date('2026-08-24T18:45:00Z'),
  tv: [{ s: 'sky', kanal: 'Sky Sport 3' }, { s: 'ard' }],
};

test('erinnerungsText: Vorlauf steht vorn, danach Wettbewerb und Sender', () => {
  assert.equal(erinnerungsText(SPIEL, 'vor30', SENDER, WETTBEWERBE).text,
    'In 30 Minuten (20:45 Uhr) · DFB-Pokal · läuft bei Sky/WOW und ARD · Free-TV');
  assert.equal(erinnerungsText(SPIEL, 'vor120', SENDER, WETTBEWERBE).text.slice(0, 14), 'In 2 Stunden (');
  assert.equal(erinnerungsText(SPIEL, 'morgens8', SENDER, WETTBEWERBE).text.slice(0, 16), 'Heute 20:45 Uhr ');
  assert.equal(erinnerungsText(SPIEL, 'anstoss', SENDER, WETTBEWERBE).text.slice(0, 8), 'Anpfiff!');
  assert.equal(erinnerungsText(SPIEL, 'vor30', SENDER, WETTBEWERBE).titel,
    '⚽ Hallescher FC – FC Schalke 04');
});

test('erinnerungsText: ohne Sender-Zuordnung ehrlich statt erfunden', () => {
  const n = erinnerungsText({ ...SPIEL, tv: [] }, 'vor60', {}, {});
  assert.equal(n.text, 'In 1 Stunde (20:45 Uhr) · dfb · Sender noch offen');
});

test('erinnerungsText: doppelte Sendernamen nur einmal', () => {
  const n = erinnerungsText({ ...SPIEL, tv: [{ s: 'sky' }, { s: 'sky', typ: 'konferenz' }] },
    'vor5', SENDER, WETTBEWERBE);
  assert.equal(n.text.indexOf('Sky/WOW und Sky/WOW'), -1);
});

test('ARTEN: Katalog vollstaendig und in Anzeige-Reihenfolge', () => {
  assert.deepEqual(ARTEN, ['morgens8', 'vor120', 'vor60', 'vor30', 'vor5', 'anstoss']);
  // Jede Stufe muss einen Zielzeitpunkt kennen (sonst schickt sie nie).
  for (const a of ARTEN) assert.ok(zielZeitpunkt(a, ANSTOSS), `${a} ohne Zielzeitpunkt`);
});
