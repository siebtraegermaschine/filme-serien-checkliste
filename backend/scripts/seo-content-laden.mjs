#!/usr/bin/env node
// Spielt die Redaktionstexte aus seo-content-daten.mjs in seo_content ein
// (INSERT ... ON CONFLICT (bereich, schluessel, locale) DO UPDATE). Idempotent:
// mehrfaches Ausfuehren ueberschreibt nur den Text, nicht die Struktur.
// Aufruf: npm run seo-content (siehe package.json).
import 'dotenv/config';
import { pool } from '../db/pool.js';
import { EINTRAEGE } from './seo-content-daten.mjs';

async function main() {
  let eingefuegt = 0, aktualisiert = 0;
  for (const e of EINTRAEGE) {
    const { rows } = await pool.query(
      `INSERT INTO seo_content (bereich, schluessel, locale, text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (bereich, schluessel, locale) DO UPDATE SET
         text = EXCLUDED.text, aktualisiert_am = now()
       RETURNING (xmax = 0) AS neu`,
      [e.bereich, e.schluessel, e.locale, e.text]
    );
    if (rows[0].neu) eingefuegt++; else aktualisiert++;
  }
  console.log(`${eingefuegt} neu, ${aktualisiert} aktualisiert (${EINTRAEGE.length} insgesamt).`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
