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
  // Laufende Abfragen des alten Containers koennen mit den ALTER TABLE-Sperren
  // in einen Deadlock (40P01) geraten -- die Migration ist idempotent, also wiederholen.
  for (let versuch = 1; ; versuch++) {
    try { await pool.query(sql); break; } catch (err) {
      if (err.code !== '40P01' || versuch >= 5) throw err;
      console.warn(`Deadlock bei der Migration, Versuch ${versuch + 1} ...`);
      await new Promise((r) => setTimeout(r, 2000 * versuch));
    }
  }
  console.log('Schema angewendet.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration fehlgeschlagen:', err);
  process.exit(1);
});
