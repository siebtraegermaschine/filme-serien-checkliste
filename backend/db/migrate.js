// Führt backend/db/schema.sql gegen DATABASE_URL aus. Idempotent (nur
// CREATE ... IF NOT EXISTS), kann also gefahrlos mehrfach laufen -- es gibt
// bewusst kein Migrations-Framework, solange ein einzelnes schema.sql reicht.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema angewendet.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration fehlgeschlagen:', err);
  process.exit(1);
});
