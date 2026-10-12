/* Kino-Hub: Orte, deren Slug leer waere (nicht-lateinische Schrift), duerfen
 * weder im Hub noch in der Stadt-Sitemap noch als Stadtseite auftauchen
 * (Fix 12.10.2026). Eigene Datei: staedteListe() cached im Prozess. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';
import { ladeKinoHub, ladeKinoStadt } from '../lib/seoData.js';
import { sitemapBereich } from '../lib/seoSitemap.js';

const QUELLE = 'seotest-kinohub';
const GRIECH = 'Αθήνα';
const LATEIN = 'SEOTEST-Kinostadt';

async function aufraeumen() {
  await pool.query(`DELETE FROM kinos WHERE quelle = $1`, [QUELLE]);
}

test('Kino-Hub und Sitemap: Ort mit leerem Slug wird verworfen, lateinischer bleibt', async (t) => {
  await aufraeumen();
  t.after(aufraeumen);
  const werte = [];
  for (const ort of [GRIECH, LATEIN]) {
    for (let i = 1; i <= 3; i++) werte.push(`('${QUELLE}', '${ort}-${i}', 'Kino ${i}', '${ort}', 50, 10)`);
  }
  await pool.query(`INSERT INTO kinos (quelle, quelle_id, name, ort, lat, lon) VALUES ${werte.join(',')}`);

  const hub = await ladeKinoHub('de-de');
  assert.equal(hub.staedte.some((s) => s.ort === GRIECH), false, 'Athen nicht im Hub');
  assert.ok(hub.staedte.every((s) => s.slug !== ''), 'kein leerer Slug im Hub');
  assert.ok(hub.staedte.some((s) => s.ort === LATEIN), 'lateinischer Ort bleibt');

  assert.equal(await ladeKinoStadt('', 'de-de'), null);

  const locs = [...(await sitemapBereich('de-de', 'kino_stadt')).matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.every((l) => !/\/kino\/$/.test(l)), 'keine Sitemap-URL auf /kino/ selbst');
  assert.ok(locs.some((l) => l.endsWith('/kino/seotest-kinostadt')), 'lateinischer Ort in der Sitemap');
  assert.equal(new Set(locs).size, locs.length, 'keine Doppel-URLs');
});

test.after(async () => { await pool.end(); });
