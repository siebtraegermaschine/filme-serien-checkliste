/* Tests fuer die Tagessperre der Wache (lib/wache.js).
 *
 * Hintergrund: Bis zum 17.09.2026 lag die Sperre nur im Arbeitsspeicher. Sechs
 * Deploys an einem Morgen schickten sechsmal dieselbe Mail. Geprueft wird
 * deshalb ausdruecklich der Neustart: eine FRISCHE Modul-Instanz (leerer
 * Arbeitsspeicher) darf dieselbe Stoerung am selben Tag nicht erneut melden.
 *
 * Laufen gegen die Datenbank aus DATABASE_URL; der Mailversand geht lokal auf
 * die Konsole (MAIL_PROVIDER nicht 'resend'). Die Testzeilen tragen ein
 * eigenes Praefix und werden am Ende geloescht. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';

const ART = `test-wache-${process.pid}`;

test.after(async () => {
  await pool.query(`DELETE FROM wache_meldungen WHERE art LIKE 'test-wache-%'`);
  await pool.end();
});

test('dieselbe Stoerung wird am selben Tag nur einmal gemeldet', async () => {
  const { melde } = await import('../lib/wache.js');
  assert.equal(await melde(ART, 'Test', 'erste Meldung'), true);
  assert.equal(await melde(ART, 'Test', 'zweite Meldung'), false);
});

test('auch nach einem Neustart (frische Modul-Instanz) keine zweite Mail', async () => {
  const { melde } = await import(`../lib/wache.js?neustart=${Date.now()}`);
  assert.equal(await melde(ART, 'Test', 'nach Neustart'), false);
});

test('eine andere Stoerungsart ist davon unberuehrt', async () => {
  const { melde } = await import('../lib/wache.js');
  assert.equal(await melde(`${ART}-andere`, 'Test', 'andere Art'), true);
});

test('Meldung vom Vortag sperrt heute nicht', async () => {
  await pool.query(
    `INSERT INTO wache_meldungen (art, tag) VALUES ($1, CURRENT_DATE - 1)
       ON CONFLICT (art) DO UPDATE SET tag = EXCLUDED.tag`, [`${ART}-gestern`]);
  const { melde } = await import(`../lib/wache.js?neu=${Date.now()}`);
  assert.equal(await melde(`${ART}-gestern`, 'Test', 'neuer Tag'), true);
});
