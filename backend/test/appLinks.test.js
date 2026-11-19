import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aasaBauen, assetlinksBauen } from '../lib/appLinks.js';

test('AASA: ohne Team-ID aus', () => assert.equal(aasaBauen(''), null));

test('AASA: App, Titel, Einladung; keine SEO-Pfade', () => {
  const a = aasaBauen('ABCDE12345');
  const d = a.applinks.details[0];
  assert.deepEqual(d.appIDs, ['ABCDE12345.de.movietaste.app']);
  const pfade = d.components.map((c) => c['/']);
  assert.ok(pfade.includes('/app') && pfade.includes('/t/*'));
  assert.ok(!pfade.some((p) => /film|serie|de-de|\*$/.test(p) && !p.startsWith('/t/') && !p.startsWith('/app')));
  // "/" nur mit Einladungs-Query
  for (const c of d.components.filter((c) => c['/'] === '/')) assert.ok(c['?']);
});

test('assetlinks: ohne Fingerabdruck aus, sonst Liste', () => {
  assert.equal(assetlinksBauen(''), null);
  const r = assetlinksBauen('AA:BB, CC:DD');
  assert.deepEqual(r[0].target.sha256_cert_fingerprints, ['AA:BB', 'CC:DD']);
});
