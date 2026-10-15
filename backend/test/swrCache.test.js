import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swrCache } from '../lib/swrCache.js';

test('kalt: wartet auf den Aufbau, parallele Aufrufe teilen ihn', async () => {
  const map = new Map();
  let n = 0;
  const laden = async () => { n++; await new Promise((r) => setTimeout(r, 20)); return 'a'; };
  const [x, y] = await Promise.all([swrCache(map, 'k', 1000, laden), swrCache(map, 'k', 1000, laden)]);
  assert.equal(x, 'a'); assert.equal(y, 'a'); assert.equal(n, 1);
});

test('frisch: kein Neuaufbau', async () => {
  const map = new Map();
  let n = 0;
  const laden = async () => ++n;
  await swrCache(map, 'k', 1000, laden);
  assert.equal(await swrCache(map, 'k', 1000, laden), 1);
  assert.equal(n, 1);
});

test('abgelaufen: alter Wert sofort, Neuaufbau im Hintergrund (einmal)', async () => {
  const map = new Map();
  let n = 0;
  const laden = async () => { n++; await new Promise((r) => setTimeout(r, 30)); return n; };
  await swrCache(map, 'k', 0, laden);
  const t = Date.now();
  const a = await swrCache(map, 'k', 0, laden);
  const b = await swrCache(map, 'k', 0, laden);
  assert.equal(a, 1); assert.equal(b, 1);
  assert.ok(Date.now() - t < 25);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(n, 2);
  assert.equal(map.get('k').wert, 2);
});

test('Fehler im Hintergrund behalten den alten Wert', async () => {
  const map = new Map();
  await swrCache(map, 'k', 0, async () => 'alt');
  assert.equal(await swrCache(map, 'k', 0, async () => { throw new Error('x'); }), 'alt');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(await swrCache(map, 'k', 0, async () => 'neu'), 'alt');
});
