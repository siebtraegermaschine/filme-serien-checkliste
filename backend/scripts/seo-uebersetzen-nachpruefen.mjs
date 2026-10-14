#!/usr/bin/env node
// Prueft verworfene Eintraege (status 'format') eines seo-uebersetzen-Journals mit der
// aktuellen Pruefung erneut, ohne API-Aufruf, und schreibt bestandene Texte.
// Schreibt nur, wo noch kein Langtext (>= 1200 Zeichen) steht.
//
// Aufruf: node scripts/seo-uebersetzen-nachpruefen.mjs --journal PFAD --locale nl-nl [--dry-run]
import 'dotenv/config';
import fs from 'node:fs';
import { pool } from '../db/pool.js';
import { pruefe } from './seo-uebersetzen.mjs';

const a = process.argv.slice(2);
const hol = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
const journal = hol('journal'), locale = hol('locale'), dryRun = a.includes('--dry-run');
if (!journal || !locale) { console.error('Aufruf: --journal PFAD --locale CODE [--dry-run]'); process.exit(1); }

const eintraege = fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean).map((z) => JSON.parse(z))
  .filter((e) => e.status === 'format' && e.locale === locale && e.text);
const z = { ok: 0, format: 0, fakten: 0, fehlt: 0 };
for (let i = 0; i < eintraege.length; i += 500) {
  const teil = eintraege.slice(i, i + 500);
  const { rows } = await pool.query(
    `SELECT t.type, t.tmdb_id, t.title, t.original_title, t.title_en, t.year, t.rating,
            t.director, t.cast_names, t.uebersetzungen, d.text AS quelle
       FROM seo_content d JOIN titles t ON d.schluessel = t.type || ':' || t.tmdb_id
      WHERE d.bereich = 'titel' AND d.locale = 'de-de' AND d.schluessel = ANY($1::text[])`,
    [teil.map((e) => e.schluessel)]);
  const titel = new Map(rows.map((t) => [`${t.type}:${t.tmdb_id}`, t]));
  for (const e of teil) {
    const t = titel.get(e.schluessel);
    if (!t) { z.fehlt++; continue; }
    const { fehler, verdacht } = pruefe(e.text, t, locale);
    if (fehler.length) { z.format++; continue; }
    if (verdacht.length) { z.fakten++; continue; }
    if (!dryRun) {
      await pool.query(
        `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('titel', $1, $2, $3)
         ON CONFLICT (bereich, schluessel, locale) DO UPDATE SET text = EXCLUDED.text, aktualisiert_am = now()
         WHERE length(seo_content.text) < 1200`, [e.schluessel, locale, e.text]);
    }
    z.ok++;
  }
}
console.log(`${eintraege.length} Eintraege: ${z.ok} ${dryRun ? 'wuerden geschrieben' : 'geschrieben'}, ${z.format} weiter Formatfehler, ${z.fakten} Faktenverdacht, ${z.fehlt} ohne Titelzeile.`);
await pool.end();
