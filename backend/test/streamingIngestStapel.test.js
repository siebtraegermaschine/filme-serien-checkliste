/* Sichert den gestapelten Streaming-Ingest ab (20.08.2026).
 *
 * Anlass: Der Ingest bekam eine ganze Region in EINEM Request. Der spanische
 * Lauf kam am 19.08.2026 auf 64 MB gegen das 60-MB-Limit und brach nach drei
 * Stunden mit PayloadTooLargeError ab. Seither schickt stream-fetch.mjs die
 * Region in Stapeln.
 *
 * Die Route ist die heikelste im Projekt -- am 02.08.2026 hat sie schon einmal
 * still 20.369 Zeilen geloescht und Erfolg gemeldet. Der Stapelbetrieb
 * vervielfacht die Fallen, weil drei Dinge ueber Requests hinweg gleich bleiben
 * muessen: die Startzeit (sonst raeumt der Abschluss die frueheren Stapel weg),
 * die Anbieterliste von VOR dem Lauf (sonst gelten Titel faelschlich als
 * Neuzugang und loesen Benachrichtigungen aus) und die Titelzahl (sonst
 * schlaegt die Plausibilitaetspruefung bei jedem Stapel an).
 *
 * Braucht die Datenbank aus DATABASE_URL. Alles laeuft in einer Testregion und
 * mit einem eigenen Anbieter-Praefix, damit nichts Echtes beruehrt wird.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { pool } from '../db/pool.js';

process.env.STREAMING_INGEST_SECRET = process.env.STREAMING_INGEST_SECRET || 'test-geheimnis';
const GEHEIMNIS = process.env.STREAMING_INGEST_SECRET;
const { default: streamingRouter } = await import('../routes/streaming.js');

const REGION = 'DE';              // regionWahl() laesst nur echte Regionen durch
const NACHBARREGION = 'AT';
const PRAEFIX = 'stapeltest-';
const TMDB_BASIS = 950_000_001;

async function aufraeumen() {
  await pool.query('DELETE FROM streaming_cache WHERE provider_id LIKE $1', [PRAEFIX + '%']);
  await pool.query('DELETE FROM streaming_ingest_run WHERE region IN ($1,$2)', [REGION, NACHBARREGION]);
}

function titel(n, extras = {}) {
  return {
    id: String(TMDB_BASIS + n), t: `Stapeltest ${n}`, y: 2020, g: ['Drama'],
    d: 'Regie Test', c: ['Wer Test'], p: null, r: 7.5, vc: 1000,
    ov: `Inhalt ${n}`, ...extras,
  };
}

function anbieter(id, filme) {
  return { id: PRAEFIX + id, name: `Stapeltest ${id}`, tmdbId: 9999, f: filme, s: [] };
}

async function starteServer() {
  const app = express();
  app.use(express.json({ limit: '60mb' }));
  app.use(streamingRouter);
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
}

async function sende(port, koerper) {
  const res = await fetch(`http://127.0.0.1:${port}/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GEHEIMNIS}` },
    body: JSON.stringify(koerper),
  });
  const text = await res.text();
  return { status: res.status, koerper: text ? JSON.parse(text) : null };
}

// Schickt providers in Stapeln, so wie stream-fetch.mjs es tut.
async function sendeGestapelt(port, region, stapel) {
  let lauf = null;
  const antworten = [];
  for (let i = 0; i < stapel.length; i++) {
    const letzter = i === stapel.length - 1;
    const a = await sende(port, {
      region, providers: stapel[i], abschluss: letzter, ...(lauf ? { lauf } : {}),
    });
    antworten.push(a);
    if (!letzter && a.koerper && a.koerper.lauf) lauf = a.koerper.lauf;
  }
  return { antworten, lauf };
}

const zeilen = (region = REGION) => pool.query(
  'SELECT provider_id, tmdb_id, title, first_seen_at, fetched_at, enriched_at FROM streaming_cache WHERE region = $1 AND provider_id LIKE $2 ORDER BY provider_id, tmdb_id',
  [region, PRAEFIX + '%']).then((r) => r.rows);

test('gestapelter Lauf schreibt alle Stapel und raeumt erst am Ende auf', async (t) => {
  await aufraeumen();
  const server = await starteServer();
  const { port } = server.address();
  t.after(async () => { server.close(); await aufraeumen(); });

  // Vorbestand, den der Lauf NICHT mehr liefert -- er muss am Ende weg sein.
  await sende(port, { region: REGION, providers: [anbieter('a', [titel(1), titel(99)])] });
  assert.equal((await zeilen()).length, 2, 'Vorbestand angelegt');

  const { antworten } = await sendeGestapelt(port, REGION, [
    [anbieter('a', [titel(1), titel(2)])],
    [anbieter('a', [titel(3)])],
    [anbieter('b', [titel(4)])],
  ]);
  assert.equal(antworten[0].status, 202, 'Zwischenstapel melden 202');
  assert.equal(antworten[1].status, 202);
  assert.equal(antworten[2].status, 204, 'Abschluss meldet 204');

  const r = await zeilen();
  assert.deepEqual(r.map((x) => x.tmdb_id).sort((a, b) => a - b),
    [TMDB_BASIS + 1, TMDB_BASIS + 2, TMDB_BASIS + 3, TMDB_BASIS + 4],
    'alle vier Titel aus drei Stapeln stehen drin');
  assert.ok(!r.some((x) => x.tmdb_id === TMDB_BASIS + 99), 'nicht mehr gelieferter Titel ist weg');

  const { rows: laeufe } = await pool.query('SELECT * FROM streaming_ingest_run WHERE region = $1', [REGION]);
  assert.equal(laeufe.length, 0, 'Lauf-Zeile wird am Ende aufgeraeumt');
});

test('Startzeit gilt fuer den LAUF -- Stapel 1 ueberlebt den Abschluss', async (t) => {
  await aufraeumen();
  const server = await starteServer();
  const { port } = server.address();
  t.after(async () => { server.close(); await aufraeumen(); });

  // Der eigentliche Regressionsschutz: Bildete der Abschluss seine eigene
  // Startzeit, loeschte sein DELETE alles aus frueheren Stapeln.
  await sendeGestapelt(port, REGION, [
    [anbieter('a', [titel(1), titel(2), titel(3)])],
    [anbieter('a', [titel(4)])],
  ]);
  const r = await zeilen();
  assert.equal(r.length, 4, 'alle vier Titel ueberleben, nicht nur der letzte Stapel');
});

test('neuer Anbieter wird ueber Stapelgrenzen hinweg als neu erkannt', async (t) => {
  await aufraeumen();
  const server = await starteServer();
  const { port } = server.address();
  t.after(async () => { server.close(); await aufraeumen(); });

  // Anbieter 'a' ist der Region bekannt, 'b' nicht. Beide kommen in
  // VERSCHIEDENEN Stapeln. Ohne die gespeicherte Anbieterliste haette Stapel 2
  // den in Stapel 1 neu eingefuegten 'b' bereits als bekannt gesehen.
  await sende(port, { region: REGION, providers: [anbieter('a', [titel(1)])] });
  // 'a' war beim Anlegen selbst neu und wurde dabei zurueckdatiert. Fuer diesen
  // Test soll er ein laengst etablierter Anbieter sein.
  await pool.query(
    'UPDATE streaming_cache SET first_seen_at = now() WHERE provider_id = $1', [PRAEFIX + 'a']);

  await sendeGestapelt(port, REGION, [
    [anbieter('b', [titel(10)])],
    [anbieter('b', [titel(11)])],
    [anbieter('a', [titel(1)])],
  ]);

  const r = await zeilen();
  const neu = r.filter((x) => x.provider_id === PRAEFIX + 'b');
  assert.equal(neu.length, 2, 'beide Titel des neuen Anbieters stehen drin');
  for (const z of neu) {
    const alter = Date.now() - new Date(z.first_seen_at).getTime();
    assert.ok(alter > 300 * 24 * 3600 * 1000,
      `first_seen_at von ${z.tmdb_id} muss zurueckdatiert sein, war ${z.first_seen_at}`);
  }
  const bekannt = r.filter((x) => x.provider_id === PRAEFIX + 'a');
  const alterBekannt = Date.now() - new Date(bekannt[0].first_seen_at).getTime();
  assert.ok(alterBekannt < 300 * 24 * 3600 * 1000, 'bekannter Anbieter wird nicht zurueckdatiert');
});

test('Plausibilitaetspruefung urteilt ueber den Lauf, nicht je Stapel', async (t) => {
  await aufraeumen();
  const server = await starteServer();
  const { port } = server.address();
  t.after(async () => { server.close(); await aufraeumen(); });

  const viele = Array.from({ length: 10 }, (_, i) => titel(i + 1));
  await sende(port, { region: REGION, providers: [anbieter('a', viele)] });
  assert.equal((await zeilen()).length, 10);

  // Zehn Titel, auf fuenf Stapel zu zwei Stueck verteilt: je Stapel weit unter
  // der 70-Prozent-Schwelle, in Summe genau der Bestand. Muss durchgehen.
  const stapel = [];
  for (let i = 0; i < 10; i += 2) stapel.push([anbieter('a', viele.slice(i, i + 2))]);
  const { antworten } = await sendeGestapelt(port, REGION, stapel);
  assert.equal(antworten.at(-1).status, 204, 'Lauf in Summe plausibel -- muss angenommen werden');
  assert.equal((await zeilen()).length, 10);
});

test('zu kleiner Lauf wird abgelehnt und raeumt NICHT auf', async (t) => {
  await aufraeumen();
  const server = await starteServer();
  const { port } = server.address();
  t.after(async () => { server.close(); await aufraeumen(); });

  const viele = Array.from({ length: 10 }, (_, i) => titel(i + 1));
  await sende(port, { region: REGION, providers: [anbieter('a', viele)] });

  // Nur zwei von zehn Titeln -- unter der Schwelle.
  const { antworten } = await sendeGestapelt(port, REGION, [
    [anbieter('a', [titel(1)])],
    [anbieter('a', [titel(2)])],
  ]);
  assert.equal(antworten.at(-1).status, 409, 'unplausibler Lauf wird abgelehnt');
  assert.equal((await zeilen()).length, 10, 'Bestand bleibt vollstaendig stehen -- kein Kahlschlag');

  const { rows: laeufe } = await pool.query('SELECT * FROM streaming_ingest_run WHERE region = $1', [REGION]);
  assert.equal(laeufe.length, 0, 'auch der abgelehnte Lauf hinterlaesst keine Zeile');
});

test('ein Lauf fasst nur seine eigene Region an', async (t) => {
  await aufraeumen();
  const server = await starteServer();
  const { port } = server.address();
  t.after(async () => { server.close(); await aufraeumen(); });

  await sende(port, { region: NACHBARREGION, providers: [anbieter('a', [titel(1), titel(2)])] });
  await sendeGestapelt(port, REGION, [
    [anbieter('a', [titel(5)])],
    [anbieter('a', [titel(6)])],
  ]);
  assert.equal((await zeilen(NACHBARREGION)).length, 2, 'Nachbarregion bleibt unangetastet');
  assert.equal((await zeilen(REGION)).length, 2);
});

test('fremde oder unbekannte Lauf-Kennung wird abgewiesen', async (t) => {
  await aufraeumen();
  const server = await starteServer();
  const { port } = server.address();
  t.after(async () => { server.close(); await aufraeumen(); });

  const unbekannt = await sende(port, {
    region: REGION, providers: [anbieter('a', [titel(1)])],
    abschluss: false, lauf: '00000000-0000-0000-0000-000000000000',
  });
  assert.equal(unbekannt.status, 410, 'unbekannte Lauf-Kennung wird abgewiesen');

  const ersterStapel = await sende(port, {
    region: REGION, providers: [anbieter('a', [titel(1)])], abschluss: false,
  });
  const fremd = await sende(port, {
    region: NACHBARREGION, providers: [anbieter('a', [titel(2)])],
    abschluss: true, lauf: ersterStapel.koerper.lauf,
  });
  assert.equal(fremd.status, 409, 'Lauf einer anderen Region wird abgewiesen');
});

test('Einzelrequest ohne abschluss-Feld arbeitet wie bisher', async (t) => {
  await aufraeumen();
  const server = await starteServer();
  const { port } = server.address();
  t.after(async () => { server.close(); await aufraeumen(); });

  // Aeltere stream-fetch-Fassungen schicken kein abschluss-Feld. Die Action
  // checkt das Repo unabhaengig vom Backend-Deploy aus, beide koennen also
  // auseinanderlaufen -- der alte Weg muss weiter funktionieren.
  const a = await sende(port, {
    region: REGION,
    providers: [anbieter('a', [1, 2, 3, 4, 5].map((n) => titel(n)))],
  });
  assert.equal(a.status, 204);
  assert.equal((await zeilen()).length, 5);

  // Fuenf Titel, zwei davon neu: bleibt ueber der 70-Prozent-Schwelle, die der
  // Bestand NACH dem Einfuegen setzt (7 Zeilen * 0,7 = 4,9).
  const b = await sende(port, {
    region: REGION,
    providers: [anbieter('a', [3, 4, 5, 6, 7].map((n) => titel(n)))],
  });
  assert.equal(b.status, 204);
  const r = await zeilen();
  assert.equal(r.length, 5, 'Einzelrequest raeumt weiterhin sofort auf');
  assert.ok(!r.some((x) => x.tmdb_id === TMDB_BASIS + 1), 'nicht mehr gelieferte Titel sind weg');
  assert.ok(r.some((x) => x.tmdb_id === TMDB_BASIS + 7), 'neue Titel sind da');

  const { rows: laeufe } = await pool.query('SELECT * FROM streaming_ingest_run');
  assert.equal(laeufe.length, 0, 'Einzelrequest legt keine Lauf-Zeile an');
});

// --- Client-Seite: das Schneiden selbst ------------------------------------
// stapelBilden() ist reine Rechnung und braucht keine Datenbank. Wichtig ist
// nur zweierlei: Es darf kein Titel verlorengehen, und kein Stapel darf die
// Grenze reissen -- sonst ist die Stapelung fuer genau den Fall wirkungslos,
// fuer den sie gebaut wurde.
process.env.TMDB_API_KEY = process.env.TMDB_API_KEY || 'nur-fuer-den-test';
const { stapelBilden } = await import('../../stream-fetch.mjs');

const summe = (st) => st.flat().reduce((n, x) => n + x.f.length + x.s.length, 0);
const groesster = (st) => Math.max(...st.map((b) => b.reduce((n, x) => n + x.f.length + x.s.length, 0)));
const mache = (nf, ns) => [{
  id: 'a', name: 'A', tmdbId: 1,
  f: Array.from({ length: nf }, (_, i) => ({ id: 'm' + i })),
  s: Array.from({ length: ns }, (_, i) => ({ id: 's' + i })),
}];

test('stapelBilden verliert keinen Titel und haelt die Grenze ein', () => {
  for (const [nf, ns] of [[2500, 300], [1999, 2001], [10, 0], [51649, 0], [0, 7]]) {
    const st = stapelBilden(mache(nf, ns));
    assert.equal(summe(st), nf + ns, `f=${nf} s=${ns}: kein Titel darf verlorengehen`);
    assert.ok(groesster(st) <= 2000, `f=${nf} s=${ns}: Stapel ${groesster(st)} ueber der Grenze`);
    const ids = new Set(st.flat().flatMap((x) => [...x.f, ...x.s].map((t) => t.id)));
    assert.equal(ids.size, nf + ns, `f=${nf} s=${ns}: kein Titel darf doppelt auftauchen`);
    assert.ok(st.flat().every((x) => x.id && x.name && x.tmdbId),
      'Anbieter-Metadaten muessen in jeder Scheibe stehen');
  }
});

test('stapelBilden schickt auch einen leeren Lauf als einen Stapel', () => {
  // Nur der Abschluss raeumt auf und nur er prueft die Plausibilitaet. Ein
  // leerer Lauf muss das Backend also erreichen und dort abgelehnt werden,
  // statt stillschweigend auszufallen.
  assert.deepEqual(stapelBilden([]), [[]]);
  assert.deepEqual(stapelBilden([{ id: 'a', name: 'A', tmdbId: 1, f: [], s: [] }]), [[]]);
});

test.after(async () => { await pool.end(); });
