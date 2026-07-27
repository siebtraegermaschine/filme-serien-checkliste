#!/usr/bin/env node
// Einmaliges Skript: traegt die letzten per Web-Recherche geschriebenen
// Kurzbeschreibungen fuer Titel nach, fuer die TMDB auch auf Englisch keinen
// Overview-Text hatte (siehe backfill-overviews.mjs). Datenquelle:
// missing-plots-2026-07.json (id -> deutsche Kurzbeschreibung).
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(readFileSync(path.join(__dirname, 'missing-plots-2026-07.json'), 'utf8'));

async function main() {
  let updated = 0;
  for (const [id, plot] of Object.entries(map)) {
    const { rowCount } = await pool.query(
      `UPDATE titles SET plot = $1, updated_at = now() WHERE id = $2 AND (plot IS NULL OR plot = '')`,
      [plot, Number(id)]
    );
    updated += rowCount;
  }
  console.log(`${updated} Zeilen aktualisiert.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
