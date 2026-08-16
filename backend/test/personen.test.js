/* Tests fuer personen.js/ladePersonSeite gegen die Datenbank aus DATABASE_URL
 * (siehe kpi.test.js fuer dasselbe Muster). Getestet wird nur der DB-Pfad:
 * personen_cache/personen_resolution werden hier direkt vorbefuellt, so wie
 * es nach einem echten (verzoegerten) TMDB-Abruf aussehen wuerde -- der
 * eigentliche TMDB-Netzwerkaufruf selbst hat wie bei ergaenzeBackdrop()
 * (share.js) keinen eigenen Test, siehe dortiges Fehlen jeglicher Tests fuer
 * Live-TMDB-Pfade im gesamten Projekt. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';
import { resolvePersonIdCachedOnly } from '../lib/personen.js';
import { ladePersonSeite } from '../lib/seoData.js';

const PERSON_TEST_ID = 900_000_501;
const NAME_TEST = 'SEOTEST Regie Person';
const TITEL_PRAEFIX = 'SEOTEST-PERSON ';

async function aufraeumen() {
  await pool.query(`DELETE FROM titles WHERE title LIKE $1`, [TITEL_PRAEFIX + '%']);
  await pool.query(`DELETE FROM personen_cache WHERE tmdb_person_id = $1`, [PERSON_TEST_ID]);
  await pool.query(`DELETE FROM personen_resolution WHERE name = $1`, [NAME_TEST]);
}

test('resolvePersonIdCachedOnly: null ohne vorherige Aufloesung, Wert danach', async (t) => {
  await aufraeumen();
  t.after(aufraeumen);

  assert.equal(await resolvePersonIdCachedOnly(NAME_TEST), null);

  await pool.query(
    `INSERT INTO personen_resolution (name, tmdb_person_id) VALUES ($1, $2)`,
    [NAME_TEST, PERSON_TEST_ID]
  );
  assert.equal(await resolvePersonIdCachedOnly(NAME_TEST), PERSON_TEST_ID);
});

test('ladePersonSeite: indexierbar erst mit Biografie UND Filmografie im eigenen Katalog', async (t) => {
  await aufraeumen();
  t.after(aufraeumen);

  // Person im Cache, aber (noch) kein Titel in unserem Katalog mit dieser Regie.
  await pool.query(
    `INSERT INTO personen_cache (tmdb_person_id, name, biografie, foto_pfad) VALUES ($1, $2, $3, $4)`,
    [PERSON_TEST_ID, NAME_TEST, 'Eine Testbiografie.', '/foto.jpg']
  );
  const ohneFilme = await ladePersonSeite('regisseur', PERSON_TEST_ID, 'de-de');
  assert.equal(ohneFilme.indexierbar, false);
  assert.equal(ohneFilme.filmografie.length, 0);

  await pool.query(
    `INSERT INTO titles (tmdb_id, type, title, year, director, vote_count)
     VALUES ($1, 'movie', $2, 2020, $3, 100)`,
    [PERSON_TEST_ID + 1, TITEL_PRAEFIX + 'Film', NAME_TEST]
  );
  const mitFilm = await ladePersonSeite('regisseur', PERSON_TEST_ID, 'de-de');
  assert.equal(mitFilm.indexierbar, true);
  assert.equal(mitFilm.filmografie.length, 1);
  assert.equal(mitFilm.filmografie[0].title, TITEL_PRAEFIX + 'Film');

  // Rolle 'schauspieler' sucht ueber cast_names, nicht director -- fuer
  // dieselbe Person darf das eine andere (hier leere) Filmografie ergeben.
  const alsSchauspieler = await ladePersonSeite('schauspieler', PERSON_TEST_ID, 'de-de');
  assert.equal(alsSchauspieler.filmografie.length, 0);
});

test('ladePersonSeite: unbekannte Person (kein Cache, kein Netzwerk moeglich ohne Key) liefert null', async () => {
  // Ohne TMDB_API_KEY in der Testumgebung bricht der Live-Abruf ab und
  // ladePersonDaten liefert null -- ladePersonSeite darf dabei nicht werfen.
  const ergebnis = await ladePersonSeite('regisseur', 999_999_998, 'de-de');
  assert.equal(ergebnis, null);
});

test.after(async () => { await pool.end(); });
