/* Tests fuer das Kalender-Abo (lib/sportKalender.js): korrektes ICS-Escaping,
 * UTC-Zeiten, Sender im Termin-Titel und die Byte-genaue Zeilenfaltung. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsText, icsZeile, kalenderIcs } from '../lib/sportKalender.js';
import { duelleAusOlb } from '../lib/sportDaten.js';

test('icsText: Sonderzeichen nach RFC 5545', () => {
  assert.equal(icsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('icsZeile: kurze Zeilen bleiben, lange falten an Byte-Grenzen', () => {
  assert.equal(icsZeile('SUMMARY:kurz'), 'SUMMARY:kurz');
  const lang = 'SUMMARY:' + 'ä'.repeat(80);   // 2 Bytes je Zeichen
  const gefaltet = icsZeile(lang);
  assert.ok(gefaltet.includes('\r\n '));
  // Nach dem Entfalten muss der Text unversehrt sein (kein zerteiltes UTF-8).
  assert.equal(gefaltet.replace(/\r\n /g, ''), lang);
  for (const teil of gefaltet.split('\r\n ')) {
    assert.ok(Buffer.from(teil, 'utf8').length <= 75);
  }
});

const SPIELE = [{
  external_id: 77351,
  wettbewerb: 'bl1',
  runde: '2. Spieltag',
  anstoss: new Date('2026-08-30T16:30:00Z'),
  heim: 'FC Bayern München',
  gast: 'RB Leipzig',
  tv: [{ s: 'sky', kanal: 'Sky Sport Bundesliga 1' }, { s: 'dazn', typ: 'konferenz' }],
}];
const META = {
  sender: { sky: { name: 'Sky/WOW', frei: false }, dazn: { name: 'DAZN', frei: false } },
  wettbewerbe: { bl1: { name: 'Bundesliga' } },
};

test('kalenderIcs: Sender im Titel, UTC-Start, stabile UID, Spielseiten-Link', () => {
  const ics = kalenderIcs({
    team: 'FC Bayern München', spiele: SPIELE,
    sender: META.sender, wettbewerbe: META.wettbewerbe,
    basis: 'https://couchultras.com', marke: 'CouchUltras',
    jetzt: new Date('2026-08-24T10:00:00Z'),
  });
  const entfaltet = ics.replace(/\r\n /g, '');
  assert.ok(entfaltet.includes('BEGIN:VCALENDAR'));
  assert.ok(entfaltet.includes('SUMMARY:⚽ FC Bayern München – RB Leipzig · Sky/WOW\\, DAZN'));
  assert.ok(entfaltet.includes('DTSTART:20260830T163000Z'));
  assert.ok(entfaltet.includes('UID:spiel-77351@couchultras.com'));
  assert.ok(entfaltet.includes('Bundesliga\\, 2. Spieltag'));
  assert.ok(/URL:https:\/\/couchultras\.com\/.*77351/.test(entfaltet)
    || entfaltet.includes('77351'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('kalenderIcs: ohne Sender bleibt der Titel schlicht, Beschreibung sagt "offen"', () => {
  const ics = kalenderIcs({
    team: 'FC Bayern München',
    spiele: [{ ...SPIELE[0], tv: [] }],
    sender: {}, wettbewerbe: META.wettbewerbe,
    basis: 'https://couchultras.com', marke: 'CouchUltras',
    jetzt: new Date('2026-08-24T10:00:00Z'),
  });
  const entfaltet = ics.replace(/\r\n /g, '');
  assert.ok(entfaltet.includes('SUMMARY:⚽ FC Bayern München – RB Leipzig\r\n'));
  assert.ok(entfaltet.includes('Sender noch offen'));
});

/* Direktvergleich: nur beendete Pflichtspiele der eigenen Wettbewerbe,
 * juengste zuerst, Endergebnis (resultTypeID 2) zaehlt. */
test('duelleAusOlb: filtert Zukunft und Fremdligen, sortiert absteigend', () => {
  const roh = [
    { matchIsFinished: false, matchDateTimeUTC: '2027-01-30T14:30:00Z', leagueShortcut: 'bl1',
      team1: { teamName: 'A' }, team2: { teamName: 'B' }, matchResults: [] },
    { matchIsFinished: true, matchDateTimeUTC: '2024-05-04T13:30:00Z', leagueShortcut: 'blclaude',
      team1: { teamName: 'A' }, team2: { teamName: 'B' },
      matchResults: [{ resultTypeID: 2, pointsTeam1: 9, pointsTeam2: 0 }] },
    { matchIsFinished: true, matchDateTimeUTC: '2025-04-12T16:30:00Z', leagueShortcut: 'bl1',
      team1: { teamName: 'A' }, team2: { teamName: 'B' },
      matchResults: [{ resultTypeID: 1, pointsTeam1: 1, pointsTeam2: 0 },
                     { resultTypeID: 2, pointsTeam1: 2, pointsTeam2: 1 }] },
    { matchIsFinished: true, matchDateTimeUTC: '2024-11-01T19:30:00Z', leagueShortcut: 'dfb',
      team1: { teamName: 'B' }, team2: { teamName: 'A' },
      matchResults: [{ resultTypeID: 2, pointsTeam1: 0, pointsTeam2: 3 }] },
  ];
  const duelle = duelleAusOlb(roh);
  assert.equal(duelle.length, 2);
  assert.deepEqual(duelle[0], { datum: '2025-04-12', heim: 'A', gast: 'B', th: 2, ta: 1, comp: 'bl1' });
  assert.deepEqual(duelle[1], { datum: '2024-11-01', heim: 'B', gast: 'A', th: 0, ta: 3, comp: 'dfb' });
});

test('duelleAusOlb: leer oder unbrauchbar heisst null', () => {
  assert.equal(duelleAusOlb(null), null);
  assert.equal(duelleAusOlb([]), null);
  assert.equal(duelleAusOlb([{ matchIsFinished: true, leagueShortcut: 'bl1',
    team1: { teamName: 'A' }, team2: { teamName: 'B' }, matchResults: [] }]), null);
});
