#!/usr/bin/env node
// Prueft verworfene Texte (status 'format') eines seo-batch-Journals erneut, ohne API-Aufruf:
// Ueberschriften normalisieren, Format- und Faktenpruefung, dann in seo_content schreiben.
// Schreibt nur, wo noch kein Langtext (>= 1200 Zeichen) steht.
//
// Aufruf (Backend-Container, Journal per -v einhaengen):
//   node scripts/seo-journal-nachpruefen.mjs --journal /lauf/fr-c.jsonl --locale fr-fr [--dry-run]
import 'dotenv/config';
import fs from 'node:fs';
import { pool } from '../db/pool.js';
import { formatFehler, faktenVerdacht, ueberschriftenNormalisieren } from './seo-batch.mjs';

const a = process.argv.slice(2);
const hol = (n) => { const i = a.indexOf(`--${n}`); return i >= 0 ? a[i + 1] : undefined; };
const journal = hol('journal');
const locale = hol('locale');
const dryRun = a.includes('--dry-run');
if (!journal || !locale) { console.error('Aufruf: --journal PFAD --locale CODE [--dry-run]'); process.exit(1); }

const eintraege = fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean).map((z) => JSON.parse(z))
  .filter((e) => e.status === 'format' && e.locale === locale && e.text);
const z = { ok: 0, format: 0, fakten: 0, fehlt: 0 };
const gründe = {};

for (let i = 0; i < eintraege.length; i += 500) {
  const teil = eintraege.slice(i, i + 500);
  const { rows } = await pool.query(
    `SELECT t.tmdb_id, t.type, t.title, t.original_title, t.title_en, t.year,
            t.genres, t.director, t.cast_names, t.keywords, t.rating,
            t.vote_count, t.plot, t.overview_en, t.certification, t.uebersetzungen
       FROM titles t WHERE (t.type || ':' || t.tmdb_id) = ANY($1::text[])`,
    [teil.map((e) => e.schluessel)]
  );
  const titel = new Map(rows.map((t) => [`${t.type}:${t.tmdb_id}`, t]));
  for (const e of teil) {
    const t = titel.get(e.schluessel);
    if (!t) { z.fehlt++; continue; }
    const text = ueberschriftenNormalisieren(e.text);
    const ff = formatFehler(text, locale);
    if (ff.length) { z.format++; const k = ff[0].replace(/\d+/g, 'N').slice(0, 40); gründe[k] = (gründe[k] || 0) + 1; continue; }
    if (faktenVerdacht(text, t, locale).length) { z.fakten++; continue; }
    if (!dryRun) {
      await pool.query(
        `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('titel', $1, $2, $3)
         ON CONFLICT (bereich, schluessel, locale) DO UPDATE SET text = EXCLUDED.text, aktualisiert_am = now()
         WHERE length(seo_content.text) < 1200`,
        [e.schluessel, locale, text]
      );
    }
    z.ok++;
  }
}
console.log(`${eintraege.length} Journal-Eintraege: ${z.ok} ${dryRun ? 'wuerden geschrieben' : 'geschrieben'}, ${z.format} weiter Formatfehler, ${z.fakten} Faktenverdacht, ${z.fehlt} ohne Titelzeile.`);
console.log('Restliche Formatgruende:', gründe);
await pool.end();
