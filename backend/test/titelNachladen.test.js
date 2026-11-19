// ?ids= und ?limit= der Titelliste (schlanker App-Katalog); ohne Parameter bleibt alles beim Alten.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { pool } from '../db/pool.js';
import { ladeListe } from '../routes/titles.js';

let dbDa = false;
const ids = [];
const marke = `Nachladentest${Date.now()}`;

before(async () => {
  try { await pool.query('SELECT 1 FROM titles LIMIT 1'); dbDa = true; } catch { return; }
  for (let i = 0; i < 3; i++) {
    const { rows } = await pool.query(
      `INSERT INTO titles (type, title, original_title, year, genres, rating, vote_count, source)
       VALUES ('movie', $1, $1, 2020, ARRAY['Drama'], 7, $2, 'discovery') RETURNING id`,
      [`${marke} ${i}`, i * 10]);
    ids.push(Number(rows[0].id));
  }
});
after(async () => {
  if (dbDa) await pool.query('DELETE FROM titles WHERE id = ANY($1)', [ids]);
  await pool.end();
});

test('ids liefert genau diese Titel', async (t) => {
  if (!dbDa) return t.skip('keine Test-DB');
  const rows = await ladeListe({ ids: [ids[0], ids[2]], withPlot: false });
  assert.deepEqual(rows.map((r) => Number(r.id)).sort(), [ids[0], ids[2]].sort());
});

test('limit deckelt die Suche, meistbewertete zuerst', async (t) => {
  if (!dbDa) return t.skip('keine Test-DB');
  const rows = await ladeListe({ search: marke, limit: 2, withPlot: false });
  assert.equal(rows.length, 2);
  assert.equal(Number(rows[0].id), ids[2]);
});

test('ohne limit bleibt die Suche ungedeckelt', async (t) => {
  if (!dbDa) return t.skip('keine Test-DB');
  assert.equal((await ladeListe({ search: marke, withPlot: false })).length, 3);
});
