/* Tests fuer die SEO-Spielseiten (lib/seoSport.js): Zeitstufen-Logik und
 * Render-Rauchtest ohne Datenbank -- seiteSpiel bekommt ein fertiges
 * daten-Objekt, wie es ladeSpielSeite liefern wuerde. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zeitstufe, spielSlugId, seiteSpiel, seiteSpiele } from '../lib/seoSport.js';

const H = 3_600_000;

test('zeitstufe: alle Stufen in der richtigen Reihenfolge', () => {
  const jetzt = new Date('2026-08-20T10:00:00Z');
  const um = (stunden) => new Date(jetzt.getTime() + stunden * H).toISOString();
  assert.equal(zeitstufe(um(24 * 7), false, jetzt), 'fern');
  assert.equal(zeitstufe(um(60), false, jetzt), 'nah');        // uebermorgen
  assert.equal(zeitstufe(um(26), false, jetzt), 'morgen');
  assert.equal(zeitstufe(um(10), false, jetzt), 'heute');
  assert.equal(zeitstufe(um(5), false, jetzt), 'bald');
  assert.equal(zeitstufe(um(0.5), false, jetzt), 'gleich');
  assert.equal(zeitstufe(um(-1), false, jetzt), 'live');
  assert.equal(zeitstufe(um(-4), false, jetzt), 'beendet');    // >160 min vorbei
  assert.equal(zeitstufe(um(-1), true, jetzt), 'beendet');     // Flag schlaegt Zeit
});

function beispielDaten(stufe, extra = {}) {
  return {
    match: {
      external_id: 83156, wettbewerb: 'bl1', saison: '2026', runde: '1. Spieltag',
      anstoss: new Date('2026-08-28T18:30:00Z'),
      heim: 'FC Bayern München', gast: 'VfB Stuttgart',
      beendet: stufe === 'beendet', tore_heim: stufe === 'beendet' ? 3 : null,
      tore_gast: stufe === 'beendet' ? 1 : null,
      tv: [{ s: 'sky', kanal: 'Sky Sport Bundesliga 1' }, { s: 'sat1' }],
      fetched_at: new Date('2026-08-20T08:00:00Z'),
      ...extra,
    },
    sender: {
      sky: { name: 'Sky/WOW', frei: false, kanal: 'Sky Sport', link: 'https://www.wowtv.de/live-sport' },
      sat1: { name: 'Sat.1', frei: true, kanal: 'Sat.1', link: 'https://www.joyn.de/live-tv/sat1' },
    },
    wettbewerbe: { bl1: { name: 'Bundesliga' } },
    tabelle: null, formHeim: null, formGast: null, weitere: [],
    stufe,
  };
}

test('seiteSpiel: Antwort oben, Sender, FAQ und JSON-LD vorhanden', () => {
  const html = seiteSpiel(beispielDaten('fern'));
  assert.match(html, /Wer zeigt FC Bayern München – VfB Stuttgart\?/);
  assert.match(html, /spiel-antwort/);
  assert.match(html, /Sky\/WOW/);
  assert.match(html, /frei empfangbar/);
  assert.match(html, /FAQPage/);
  assert.match(html, /SportsEvent/);
  assert.match(html, /BroadcastEvent/);
  assert.match(html, /Häufige Fragen/);
  // Feste Blockreihenfolge: Übertragung vor Steckbrief vor FAQ.
  assert.ok(html.indexOf('Übertragung im Überblick') < html.indexOf('Das Spiel im Steckbrief'));
  assert.ok(html.indexOf('Das Spiel im Steckbrief') < html.indexOf('Häufige Fragen'));
  // Indexierbar (eigener Inhalt) und kanonische URL mit ID.
  assert.match(html, /index,follow/);
  assert.match(html, /de-de\/spiel\/fc-bayern-muenchen-vfb-stuttgart-83156/);
});

test('seiteSpiel: nach dem Abpfiff Vergangenheitsform und Endstand', () => {
  const html = seiteSpiel(beispielDaten('beendet'));
  assert.match(html, /Wer zeigte FC Bayern München – VfB Stuttgart\?/);
  assert.match(html, /3:1/);
  assert.match(html, /Endstand/);
});

test('seiteSpiel: ohne Senderzuordnung ehrlicher Hinweis statt leerer Tabelle', () => {
  const html = seiteSpiel(beispielDaten('fern', { tv: [] }));
  assert.match(html, /steht f(ue|ü)r diese Partie noch nicht fest/);
});

test('spielSlugId: Umlaute und ID sauber im Slug', () => {
  assert.equal(
    spielSlugId({ heim: 'FC Bayern München', gast: '1. FC Köln', external_id: 42 }),
    'fc-bayern-muenchen-1-fc-koeln-42');
});

test('seiteSpiel: Vorbericht und Aufstellung erscheinen nur mit Inhalt', () => {
  const ohne = seiteSpiel(beispielDaten('fern'));
  assert.doesNotMatch(ohne, /Vorbericht<\/h2>/);
  assert.doesNotMatch(ohne, /Voraussichtliche Aufstellungen/);
  const mit = seiteSpiel({ ...beispielDaten('fern'),
    inhalte: { vorbericht: 'Absatz eins.\n\nAbsatz zwei.', aufstellung: 'Team A: ...', stand: '2026-08-21' } });
  assert.match(mit, /<h2>Vorbericht<\/h2>/);
  assert.match(mit, /Absatz eins\./);
  assert.match(mit, /Voraussichtliche Aufstellungen/);
  assert.match(mit, /Stand: 2026-08-21/);
  // Nach Abpfiff bleiben beide stehen (21.08.2026: nichts entfernen) --
  // nur der Rahmen wechselt in die Vergangenheitsform.
  const vorbei = seiteSpiel({ ...beispielDaten('beendet'),
    inhalte: { vorbericht: 'X', aufstellung: 'Y', stand: '2026-08-21' } });
  assert.match(vorbei, /Die Ausgangslage vor dem Spiel/);
  assert.match(vorbei, /Verfasst vor dem Anstoß\./);
  assert.match(vorbei, /Voraussichtliche Aufstellungen/);
  assert.match(vorbei, /veröffentlichten die Vereine kurz vor dem Spiel/);
});

test('Sport-Domain aktiv: eigene Basis, kurze Pfade, eigene Marke', () => {
  process.env.SPORT_DOMAIN = 'sport-test.de';
  process.env.SPORT_BRAND = 'Testmarke';
  try {
    const html = seiteSpiel(beispielDaten('fern'));
    assert.match(html, /https:\/\/sport-test\.de\/spiel\/fc-bayern-muenchen-vfb-stuttgart-83156/);
    assert.match(html, /Testmarke/);
    assert.doesNotMatch(html, /de-de\/spiel\//);           // keine movietaste-Pfade mehr
    assert.doesNotMatch(html, /\| MovieMatch<\/title>/);   // Titel traegt die eigene Marke
  } finally {
    delete process.env.SPORT_DOMAIN;
    delete process.env.SPORT_BRAND;
  }
});

test('seiteSpiele: Uebersicht gruppiert und verlinkt', () => {
  const html = seiteSpiele({
    spiele: [{ external_id: 1, wettbewerb: 'bl1', runde: '1. Spieltag',
      anstoss: new Date('2026-08-28T18:30:00Z'), heim: 'A', gast: 'B', tv: [{ s: 'sat1' }] }],
    sender: { sat1: { name: 'Sat.1', frei: true } },
    wettbewerbe: { bl1: { name: 'Bundesliga' } },
  });
  assert.match(html, /de-de\/spiel\/a-b-1/);
  assert.match(html, /Free-TV/);
  assert.match(html, /index,follow/);
});
