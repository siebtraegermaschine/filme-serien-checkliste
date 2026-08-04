#!/usr/bin/env node
/*
 * backfill-themen.mjs -- traegt die Themen-Schlagwoerter aus lib/themen.js nach.
 *
 * Loest scripts/backfill-true-crime.mjs ab: Dort steckte ein einzelnes Thema
 * fest im Skript, jedes weitere haette ein weiteres Skript gebraucht. Die
 * Themenliste steht jetzt in backend/lib/themen.js (THEMEN), ein neues Thema
 * ist eine Zeile.
 *
 * Im laufenden Betrieb passiert das ohnehin von selbst -- das Backend startet
 * den Nachtrag woechentlich mit (siehe starteThemen). Dieses Skript ist fuer
 * den Fall, dass man nicht warten will oder erst einmal sehen moechte, was
 * passieren wuerde.
 *
 * Aufruf (auf dem Server, im Backend-Container):
 *   docker compose -f docker-compose.yml exec -T backend \
 *     node scripts/backfill-themen.mjs [--dry-run]
 *
 * Beliebig oft wiederholbar: Titel, die ein Schlagwort schon haben, werden
 * uebersprungen.
 */
import 'dotenv/config';
import { pool } from '../db/pool.js';
import { themenNachtragen } from '../lib/themen.js';

const dryRun = process.argv.includes('--dry-run');

themenNachtragen({ dryRun })
  .then(async () => { await pool.end(); })
  .catch(async (err) => {
    console.error('Nachtrag fehlgeschlagen:', err);
    await pool.end();
    process.exit(1);
  });
