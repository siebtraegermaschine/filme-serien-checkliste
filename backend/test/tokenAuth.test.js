// Integrationstest Token-Anmeldung: startet den echten Server gegen die Test-DB
// (DATABASE_URL, z. B. embedded-postgres auf 55432) und prueft, dass Bearer und
// Cookie dieselben Antworten liefern. Ohne DB wird uebersprungen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';
import { pool } from '../db/pool.js';
import { loescheKonto } from '../lib/kontoAufraeumen.js';

const PORT = 3917;
const BASE = `http://127.0.0.1:${PORT}`;
const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const email = `token-test-${Date.now()}@example.com`;
const passwort = 'Testpasswort123!';
let server; let dbDa = false;

before(async () => {
  try { await pool.query('SELECT 1 FROM auth_tokens LIMIT 1'); dbDa = true; } catch { return; }
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

const post = (url, body, headers = {}) => fetch(BASE + url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('Bearer und Cookie liefern dieselben Antworten', async (t) => {
  if (!dbDa) return t.skip('keine Test-DB');
  // Registrierung nativ: Token, kein Cookie.
  const reg = await post('/api/auth/register', { email, password: passwort, displayName: 'Tester', plattform: 'ios', geraet: 'iPhone Test' }, { 'x-client': 'native' });
  assert.equal(reg.status, 201);
  assert.ok(!reg.headers.getSetCookie().some((c) => c.startsWith('fs.sid')));
  const regBody = await reg.json();
  assert.match(regBody.token, /^[a-f0-9]{64}$/);

  // Login Web: Cookie, kein Token im Body.
  const web = await post('/api/auth/login', { email, password: passwort });
  assert.equal(web.status, 200);
  assert.equal((await web.json()).token, undefined);
  const cookie = web.headers.getSetCookie().find((c) => c.startsWith('fs.sid')).split(';')[0];

  // Login nativ: zweites Token.
  const nat = await post('/api/auth/login', { email, password: passwort, plattform: 'android', geraet: 'Pixel' }, { 'x-client': 'native' });
  const { token } = await nat.json();
  assert.match(token, /^[a-f0-9]{64}$/);

  for (const pfad of ['/api/auth/me', '/api/progress', '/api/links', '/api/hidden-titles']) {
    const a = await fetch(BASE + pfad, { headers: { cookie } });
    const b = await fetch(BASE + pfad, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(b.status, a.status, pfad);
    assert.deepEqual(await b.json(), await a.json(), pfad);
  }

  // Ohne und mit falschem Token: abgewiesen, kein Rueckfall aufs Cookie.
  assert.equal((await fetch(BASE + '/api/progress')).status, 401);
  assert.equal((await fetch(BASE + '/api/progress', { headers: { authorization: 'Bearer ' + 'a'.repeat(64), cookie } })).status, 401);

  // Geraeteliste und einzelnes Abmelden.
  const liste = await (await fetch(BASE + '/api/auth/devices', { headers: { authorization: `Bearer ${token}` } })).json();
  assert.equal(liste.length, 2);
  const andere = liste.find((g) => !g.aktuell);
  assert.equal((await fetch(`${BASE}/api/auth/devices/${andere.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } })).status, 204);
  assert.equal((await fetch(BASE + '/api/auth/me', { headers: { authorization: `Bearer ${regBody.token}` } })).status, 200);
  assert.equal(await (await fetch(BASE + '/api/auth/me', { headers: { authorization: `Bearer ${regBody.token}` } })).json(), null);

  // Logout per Bearer beendet nur dieses Token.
  assert.equal((await post('/api/auth/logout', {}, { authorization: `Bearer ${token}` })).status, 204);
  assert.equal((await fetch(BASE + '/api/progress', { headers: { authorization: `Bearer ${token}` } })).status, 401);
});

test('Geloeschtes Konto: Token wird abgewiesen', async (t) => {
  if (!dbDa) return t.skip('keine Test-DB');
  const nat = await post('/api/auth/login', { email, password: passwort, plattform: 'ios' }, { 'x-client': 'native' });
  const { token, id } = await nat.json();
  assert.equal((await fetch(BASE + '/api/progress', { headers: { authorization: `Bearer ${token}` } })).status, 200);
  // Loeschantrag per App beendet alle Tokens sofort.
  const antrag = await fetch(BASE + '/api/auth/account', { method: 'DELETE', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: passwort }) });
  assert.equal(antrag.status, 200);
  assert.equal((await fetch(BASE + '/api/progress', { headers: { authorization: `Bearer ${token}` } })).status, 401);
  // Endgueltige Loeschung: nichts bleibt zurueck.
  const nat2 = await post('/api/auth/login', { email, password: passwort }, { 'x-client': 'native' });
  assert.equal(nat2.status, 200);
  await loescheKonto(id, email);
  const { rows } = await pool.query('SELECT count(*)::int n FROM auth_tokens WHERE user_id = $1', [id]);
  assert.equal(rows[0].n, 0);
});
