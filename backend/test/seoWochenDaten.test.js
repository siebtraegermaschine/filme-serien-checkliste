/* Wochen-Seiten gegen die Datenbank aus DATABASE_URL (Muster wie seoData.test.js).
 * Testdaten tragen tmdb_id ab TMDB_TEST_BASIS und Anbieter mit Praefix seotest-. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';
import { ladeNeuAufUebersicht, ladeNeuAufAnbieter, ladeKinoNeustarts, wochenSeitenFuerSitemap } from '../lib/seoData.js';

const BASIS = 910_000_001;

async function aufraeumen() {
  await pool.query(`DELETE FROM streaming_cache WHERE provider_id LIKE 'seotest-w%'`);
  await pool.query(`DELETE FROM cinema_cache WHERE tmdb_id >= $1`, [BASIS]);
}

async function streamZeilen(anbieter, anzahl, startId, tageZurueck) {
  for (let i = 0; i < anzahl; i++) {
    await pool.query(
      `INSERT INTO streaming_cache (provider_id, provider_name, type, tmdb_id, region, title, year, first_seen_at)
       VALUES ($1, $2, $3, $4, 'DE', $5, 2026, now() - make_interval(days => $6::int))`,
      [anbieter, anbieter.toUpperCase(), i % 2 ? 'series' : 'movie', startId + i, `SEOTEST ${anbieter} ${i}`, tageZurueck]
    );
  }
}

// Kino-Zeilen vor dem ersten Aufruf: die Wochen-Seiten cachen 1 h im Prozess.
test.before(async () => {
  await aufraeumen();
  for (const [i, tage] of [[0, -1], [1, -3], [2, -5], [3, 2], [4, 20]]) {
    await pool.query(
      `INSERT INTO cinema_cache (tmdb_id, title, year, category, region, release_date)
       VALUES ($1, $2, 2026, 'now', 'DE', (now() AT TIME ZONE 'Europe/Berlin')::date + $3::int)`,
      [BASIS + i, `SEOTEST Kino ${i}`, tage]
    );
  }
});
test.after(async () => { await aufraeumen(); await pool.end(); });

test('Streaming: Schwelle, 14-Tage-Erweiterung, Importtag-Ausschluss', async () => {
  await streamZeilen('seotest-w-gut', 6, BASIS, 2);            // 6 in 7 Tagen
  await streamZeilen('seotest-w-spaet', 5, BASIS + 100, 10);   // erst im 14-Tage-Fenster
  await streamZeilen('seotest-w-klein', 2, BASIS + 200, 1);    // unter der Schwelle
  await streamZeilen('seotest-w-import', 80, BASIS + 300, 1);  // 100 % an einem Tag = Erstimport

  const gut = await ladeNeuAufAnbieter('seotest-w-gut', 'de-de');
  assert.equal(gut.tage, 7);
  assert.equal(gut.indexierbar, true);
  assert.equal(gut.filme.length + gut.serien.length, 6);

  const spaet = await ladeNeuAufAnbieter('seotest-w-spaet', 'de-de');
  assert.equal(spaet.tage, 14);
  assert.equal(spaet.indexierbar, true);

  const klein = await ladeNeuAufAnbieter('seotest-w-klein', 'de-de');
  assert.equal(klein.indexierbar, false);

  const imp = await ladeNeuAufAnbieter('seotest-w-import', 'de-de');
  assert.equal(imp.filme.length + imp.serien.length, 0);
  assert.equal(imp.indexierbar, false);

  assert.equal(await ladeNeuAufAnbieter('gibt-es-nicht', 'de-de'), null);

  const u = await ladeNeuAufUebersicht('de-de');
  const slugs = u.anbieter.map((a) => a.slug);
  assert.ok(slugs.includes('seotest-w-gut') && slugs.includes('seotest-w-spaet'));
  assert.ok(!slugs.includes('seotest-w-klein') && !slugs.includes('seotest-w-import'));

  const sm = await wochenSeitenFuerSitemap('de-de');
  assert.ok(sm.anbieter.includes('seotest-w-gut') && !sm.anbieter.includes('seotest-w-klein'));
});

test('Kino: gestartet und naechste Woche aus cinema_cache', async () => {
  const k = await ladeKinoNeustarts('de-de');
  const titel = (l) => l.map((t) => t.title);
  assert.ok(titel(k.gestartet).includes('SEOTEST Kino 0'));
  assert.ok(titel(k.naechste).includes('SEOTEST Kino 3'));
  assert.ok(![...titel(k.gestartet), ...titel(k.naechste)].includes('SEOTEST Kino 4'));
  assert.equal(k.indexierbar, true);
});
