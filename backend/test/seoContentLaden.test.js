// Der Ladelauf darf bestehende SEO-Texte nie still ueberschreiben (Christian, 17.09.2026):
// Die Datenbank ist maßgeblich, seo-content-daten.mjs ist nur der Eingang fuer neue Texte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';
import { ladeEintraege } from '../scripts/seo-content-laden.mjs';

const K = 'series:900000777';
const aufraeumen = () => pool.query(`DELETE FROM seo_content WHERE bereich = 'titel' AND schluessel = $1`, [K]);
const eintrag = (text) => ({ bereich: 'titel', schluessel: K, locale: 'de-de', text });
const dbText = async () => (await pool.query(`SELECT text FROM seo_content WHERE bereich = 'titel' AND schluessel = $1`, [K])).rows[0]?.text;
const still = () => {};

test('neuer Eintrag wird angelegt', async (t) => {
  await aufraeumen(); t.after(aufraeumen);
  const r = await ladeEintraege(pool, [eintrag('Dateitext')], { log: still });
  assert.equal(r.neu, 1);
  assert.equal(await dbText(), 'Dateitext');
});

test('bestehender, abweichender Text bleibt ohne ausdrueckliche Freigabe stehen', async (t) => {
  await aufraeumen(); t.after(aufraeumen);
  await pool.query(`INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('titel', $1, 'de-de', 'Live-Fassung')`, [K]);
  const r = await ladeEintraege(pool, [eintrag('alte Dateifassung')], { log: still });
  assert.deepEqual(r.abweichend, [K]);
  assert.equal(await dbText(), 'Live-Fassung');
});

test('--ueberschreiben ersetzt nur den benannten Schluessel, --dry-run gar nichts', async (t) => {
  await aufraeumen(); t.after(aufraeumen);
  await pool.query(`INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('titel', $1, 'de-de', 'Live-Fassung')`, [K]);
  await ladeEintraege(pool, [eintrag('neue Fassung')], { ueberschreiben: new Set([K]), dryRun: true, log: still });
  assert.equal(await dbText(), 'Live-Fassung');
  const r = await ladeEintraege(pool, [eintrag('neue Fassung')], { ueberschreiben: new Set([K]), log: still });
  assert.deepEqual(r.ueberschrieben, [K]);
  assert.equal(await dbText(), 'neue Fassung');
});

test.after(async () => { await pool.end(); });
