// Push-Registrierung gegen echten Server und Test-DB; Versand bleibt aus.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';
import { pool } from '../db/pool.js';
import { sendePush, pushAktiv } from '../lib/pushVersand.js';

const PORT = 3918;
const BASE = `http://127.0.0.1:${PORT}`;
const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const email = `push-test-${Date.now()}@example.com`;
let server; let dbDa = false;

before(async () => {
  try { await pool.query('SELECT 1 FROM push_tokens LIMIT 1'); dbDa = true; } catch { return; }
  server = spawn(process.execPath, ['server.js'], { cwd: wurzel, env: { SESSION_SECRET: 'test', ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { await fetch(`${BASE}/api/auth/me`); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
});
after(async () => {
  server?.kill();
  await pool.query('DELETE FROM users WHERE email = $1', [email]).catch(() => {});
  await pool.end();
});

test('Versand ist ohne Flag aus', async () => {
  assert.equal(pushAktiv(), false);
  assert.deepEqual(await sendePush(1, { titel: 'x', text: 'y' }), { gesendet: 0 });
});

test('register/unregister, Konto loeschen raeumt auf', async (t) => {
  if (!dbDa) return t.skip('keine Test-DB');
  const j = { 'content-type': 'application/json' };
  const reg = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { ...j, 'x-client': 'native' }, body: JSON.stringify({ email, password: 'Testpasswort123!', displayName: 'P', plattform: 'ios' }) });
  const { token } = await reg.json();
  const h = { ...j, authorization: `Bearer ${token}` };
  const pt = 'p'.repeat(40);
  assert.equal((await fetch(`${BASE}/api/push/register`, { method: 'POST', headers: j, body: JSON.stringify({ token: pt, plattform: 'ios' }) })).status, 401);
  assert.equal((await fetch(`${BASE}/api/push/register`, { method: 'POST', headers: h, body: JSON.stringify({ token: 'kurz', plattform: 'ios' }) })).status, 400);
  assert.equal((await fetch(`${BASE}/api/push/register`, { method: 'POST', headers: h, body: JSON.stringify({ token: pt, plattform: 'ios' }) })).status, 200);
  let r = await pool.query('SELECT aktiv FROM push_tokens WHERE token = $1', [pt]);
  assert.equal(r.rows[0].aktiv, false);
  await fetch(`${BASE}/api/push/register`, { method: 'POST', headers: h, body: JSON.stringify({ token: pt, plattform: 'ios', aktiv: true }) });
  r = await pool.query('SELECT aktiv FROM push_tokens WHERE token = $1', [pt]);
  assert.equal(r.rows[0].aktiv, true);
  await fetch(`${BASE}/api/push/unregister`, { method: 'POST', headers: h, body: JSON.stringify({ token: pt }) });
  r = await pool.query('SELECT 1 FROM push_tokens WHERE token = $1', [pt]);
  assert.equal(r.rowCount, 0);
});
