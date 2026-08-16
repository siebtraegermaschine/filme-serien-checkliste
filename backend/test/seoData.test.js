/* Tests fuer seoData.js gegen die Datenbank aus DATABASE_URL (lokal: docker
 * compose, Dienst "postgres" -- siehe kpi.test.js fuer dasselbe Muster).
 * Test-Titel tragen tmdb_id ab TMDB_TEST_BASIS und einen erkennbaren Titel-
 * Praefix, damit sich alles rueckstandsfrei loeschen laesst (titles hat kein
 * props-Feld wie analytics_events). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';
import {
  ladeTitelSeite, ladeGenreSeite, ladeAnbieterSeite, ladeKinoStadt,
  ladeFilmeHub, ladeStreamingHub, ladeKinoHub, ladeBestenlisteHub,
} from '../lib/seoData.js';
import { MINDESTZAHL_BEWERTUNGEN } from '../lib/bewertungsstatistik.js';

const TMDB_TEST_BASIS = 900_000_001;
const TITEL_PRAEFIX = 'SEOTEST ';
const EMAIL_PRAEFIX = 'seodata-test-';
const GENRE_TEST = 'SEOTEST-Genre';
const PROVIDER_TEST = 'seotest-anbieter';
const STADT_TEST = 'SEOTEST-Stadt';

async function aufraeumen() {
  await pool.query(`DELETE FROM titles WHERE title LIKE $1`, [TITEL_PRAEFIX + '%']);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [EMAIL_PRAEFIX + '%']);
  await pool.query(`DELETE FROM genre_alias WHERE name_de = $1`, [GENRE_TEST]);
  await pool.query(`DELETE FROM watch_providers_cache WHERE tmdb_id >= $1`, [TMDB_TEST_BASIS]);
  await pool.query(`DELETE FROM streaming_cache WHERE provider_id = $1`, [PROVIDER_TEST]);
  await pool.query(
    `DELETE FROM seo_content WHERE schluessel LIKE $1 OR schluessel = $2 OR schluessel = $3 OR schluessel LIKE $4
       OR (bereich = 'hub' AND schluessel = 'filme')`,
    [`%${TMDB_TEST_BASIS}%`, PROVIDER_TEST, 'seotest-stadt', 'seotest-genre%']
  );
  await pool.query(`DELETE FROM kinos WHERE quelle = 'seotest-hub'`);
  await pool.query(`DELETE FROM kinos WHERE ort = $1`, [STADT_TEST]);
}

test('ladeTitelSeite: indexierbar nur mit seo_content, Community-Bewertung erst ab Mindestzahl', async (t) => {
  await aufraeumen();
  t.after(aufraeumen);

  const { rows: [titel] } = await pool.query(
    `INSERT INTO titles (tmdb_id, type, title, year, genres, director, cast_names, rating)
     VALUES ($1, 'movie', $2, 2020, ARRAY['Drama'], 'Test-Regie', ARRAY['Test-Person'], 7.0)
     RETURNING id`,
    [TMDB_TEST_BASIS, TITEL_PRAEFIX + 'Ohne Text']
  );

  // Ohne seo_content: Seite existiert (Daten kommen zurueck), aber nicht indexierbar.
  const ohneText = await ladeTitelSeite('film', TMDB_TEST_BASIS, 'de-de');
  assert.ok(ohneText);
  assert.equal(ohneText.indexierbar, false);
  assert.equal(ohneText.communityBewertung, null);

  // Genau MINDESTZAHL_BEWERTUNGEN - 1 Bewertungen: noch keine Community-Bewertung.
  for (let i = 0; i < MINDESTZAHL_BEWERTUNGEN - 1; i++) {
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
      [`${EMAIL_PRAEFIX}${i}@example.invalid`]
    );
    await pool.query(`INSERT INTO user_progress (user_id, title_id, rating) VALUES ($1, $2, 8)`, [u.id, titel.id]);
  }
  const unterSchwelle = await ladeTitelSeite('film', TMDB_TEST_BASIS, 'de-de');
  assert.equal(unterSchwelle.communityBewertung, null);

  // Eine weitere Bewertung erreicht die Mindestzahl.
  const { rows: [letzter] } = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, 'x') RETURNING id`,
    [`${EMAIL_PRAEFIX}letzter@example.invalid`]
  );
  await pool.query(`INSERT INTO user_progress (user_id, title_id, rating) VALUES ($1, $2, 8)`, [letzter.id, titel.id]);
  const aufSchwelle = await ladeTitelSeite('film', TMDB_TEST_BASIS, 'de-de');
  assert.ok(aufSchwelle.communityBewertung);
  assert.equal(aufSchwelle.communityBewertung.gesamt, MINDESTZAHL_BEWERTUNGEN);
  assert.equal(aufSchwelle.communityBewertung.durchschnitt, 8);

  // Mit seo_content wird die Seite indexierbar.
  await pool.query(
    `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('titel', $1, 'de-de', 'Ein Testtext.')`,
    [`movie:${TMDB_TEST_BASIS}`]
  );
  const mitText = await ladeTitelSeite('film', TMDB_TEST_BASIS, 'de-de');
  assert.equal(mitText.indexierbar, true);
  assert.equal(mitText.text, 'Ein Testtext.');
});

test('ladeTitelSeite: unbekannte tmdbId liefert null (kein Absturz)', async () => {
  const ergebnis = await ladeTitelSeite('film', 999_999_999, 'de-de');
  assert.equal(ergebnis, null);
});

test('ladeGenreSeite: Genre-Aufloesung ueber Slug, Paginierung, indexierbar erst mit Text', async (t) => {
  await aufraeumen();
  t.after(aufraeumen);

  await pool.query(
    `INSERT INTO genre_alias (tmdb_genre_id, art, name_de, name_en) VALUES (999999, 'movie', $1, 'SEOTEST-Genre-EN')`,
    [GENRE_TEST]
  );
  for (let i = 0; i < 3; i++) {
    await pool.query(
      `INSERT INTO titles (tmdb_id, type, title, year, genres, vote_count)
       VALUES ($1, 'movie', $2, 2020, ARRAY[$3::text], $4)`,
      [TMDB_TEST_BASIS + i, `${TITEL_PRAEFIX}Genre ${i}`, GENRE_TEST, 100 + i]
    );
  }

  const ohneText = await ladeGenreSeite('filme', 'seotest-genre', 1, 'de-de');
  assert.equal(ohneText.gesamt, 3);
  assert.equal(ohneText.indexierbar, false);

  await pool.query(
    `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('genre', 'seotest-genre:movie', 'de-de', 'Genre-Text.')`
  );
  const mitText = await ladeGenreSeite('filme', 'seotest-genre', 1, 'de-de');
  assert.equal(mitText.indexierbar, true);
  assert.equal(mitText.titel.length, 3);

  const unbekannt = await ladeGenreSeite('filme', 'gibt-es-nicht', 1, 'de-de');
  assert.equal(unbekannt, null);
});

test('ladeAnbieterSeite: unbekannter Anbieter liefert null, bekannter gruppiert Filme/Serien', async (t) => {
  await aufraeumen();
  t.after(aufraeumen);

  assert.equal(await ladeAnbieterSeite('gibt-es-nicht', 'de-de'), null);

  await pool.query(
    `INSERT INTO streaming_cache (provider_id, provider_name, type, tmdb_id, region, title, year)
     VALUES ($1, 'SEOTEST Anbieter', 'movie', $2, 'DE', $3, 2020)`,
    [PROVIDER_TEST, TMDB_TEST_BASIS, TITEL_PRAEFIX + 'Anbieter-Film']
  );
  const daten = await ladeAnbieterSeite(PROVIDER_TEST, 'de-de');
  assert.equal(daten.name, 'SEOTEST Anbieter');
  assert.equal(daten.filme.length, 1);
  assert.equal(daten.serien.length, 0);
});

test('ladeKinoStadt: Staedte unter der Mindestzahl liefern null', async (t) => {
  await aufraeumen();
  t.after(aufraeumen);

  // Nur 2 Kinos -- unter MIN_KINOS_STADT (3).
  await pool.query(
    `INSERT INTO kinos (quelle, quelle_id, name, ort, lat, lon) VALUES
       ('seotest', '1', 'Kino Eins', $1, 50, 10),
       ('seotest', '2', 'Kino Zwei', $1, 50, 10)`,
    [STADT_TEST]
  );
  const zuWenig = await ladeKinoStadt('seotest-stadt', 'de-de');
  assert.equal(zuWenig, null);
});

test('Hub-Seiten: indexierbar nur mit seo_content, Anbieter-/Stadt-Listen korrekt', async (t) => {
  await aufraeumen();
  t.after(aufraeumen);

  const ohneText = await ladeFilmeHub('de-de');
  assert.equal(ohneText.indexierbar, false);
  assert.equal(ohneText.type, 'movie');

  await pool.query(`INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('hub', 'filme', 'de-de', 'Filme-Hub-Text.')`);
  const mitText = await ladeFilmeHub('de-de');
  assert.equal(mitText.indexierbar, true);

  // Streaming-Hub listet den Test-Anbieter mit korrektem Slug.
  await pool.query(
    `INSERT INTO streaming_cache (provider_id, provider_name, type, tmdb_id, region, title, year)
     VALUES ($1, 'SEOTEST Anbieter', 'movie', $2, 'DE', $3, 2020)`,
    [PROVIDER_TEST, TMDB_TEST_BASIS, TITEL_PRAEFIX + 'Hub-Film']
  );
  const streamingHub = await ladeStreamingHub('de-de');
  assert.ok(streamingHub.anbieter.some((a) => a.slug === PROVIDER_TEST && a.name === 'SEOTEST Anbieter'));

  // Kino-Hub: nur Staedte ab MIN_KINOS_STADT tauchen in der Liste auf.
  await pool.query(
    `INSERT INTO kinos (quelle, quelle_id, name, ort, lat, lon) VALUES
       ('seotest-hub', '1', 'Kino Eins', $1, 50, 10),
       ('seotest-hub', '2', 'Kino Zwei', $1, 50, 10)`,
    [STADT_TEST]
  );
  const kinoHub = await ladeKinoHub('de-de');
  assert.equal(kinoHub.staedte.some((s) => s.ort === STADT_TEST), false); // nur 2, unter der Mindestzahl

  // Bestenlisten-Hub liefert Jahre und Genres fuer den angefragten Typ.
  const bestenlisteHub = await ladeBestenlisteHub('filme', 'de-de');
  assert.equal(bestenlisteHub.type, 'movie');
  assert.ok(Array.isArray(bestenlisteHub.jahre));
  assert.ok(Array.isArray(bestenlisteHub.genres));
});

test.after(async () => { await pool.end(); });
