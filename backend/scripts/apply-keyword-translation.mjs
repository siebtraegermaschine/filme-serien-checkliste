#!/usr/bin/env node
// Einmaliges Skript: ersetzt die rohen englischen TMDB-Keywords in
// titles.keywords (source='discovery') durch die deutschen Übersetzungen aus
// kwmap_merged.json (liegt im selben Verzeichnis). Idempotent so lange
// kwmap_merged.json unverändert bleibt (deterministisches 1:1-Mapping).
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(readFileSync(path.join(__dirname, 'keyword-translations-de.json'), 'utf8'));

async function main() {
  const { rows } = await pool.query(
    `SELECT id, keywords FROM titles WHERE source = 'discovery' AND array_length(keywords, 1) > 0`
  );
  console.log(`${rows.length} Zeilen mit Keywords gefunden.`);
  let updated = 0;
  let missingKeys = new Set();
  for (const row of rows) {
    const translated = row.keywords.map((k) => {
      if (Object.prototype.hasOwnProperty.call(map, k)) return map[k];
      missingKeys.add(k);
      return k;
    });
    await pool.query('UPDATE titles SET keywords = $1, updated_at = now() WHERE id = $2', [translated, row.id]);
    updated++;
  }
  console.log(`${updated} Zeilen aktualisiert.`);
  if (missingKeys.size) {
    console.log(`WARNUNG: ${missingKeys.size} Keywords ohne Mapping-Eintrag geblieben (unverändert übernommen):`);
    console.log([...missingKeys].join(', '));
  } else {
    console.log('Alle Keywords hatten einen Mapping-Eintrag.');
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
