#!/usr/bin/env node
// Uebersetzung der de-de-Titeltexte ueber Dateien statt Batch-API: Pakete fuer
// Bearbeiter (Abo-Subagenten) schreiben und deren Ergebnisse geprueft einspielen.
// Gleiche Kandidaten, Regeln und Pruefung wie seo-uebersetzen.mjs.
//
//   node scripts/seo-uebersetzen-dateien.mjs pakete --locales it-it,nl-nl --pakete 10 --je 20 --ziel DIR
//   node scripts/seo-uebersetzen-dateien.mjs einspielen --verzeichnis DIR [--dry-run]
// Pakete heissen paket-<locale>-NN.json, Ergebnisse texte-<locale>-NN.json ({schluessel: text}).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { SPRACHEN, ueberschriftenNormalisieren } from './seo-batch.mjs';
import { kandidaten, zielTitel, systemPrompt, pruefe } from './seo-uebersetzen.mjs';

const a = process.argv.slice(2);
const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };

async function pakete() {
  const locales = hol('locales', 'en-gb').split(',');
  const anzahl = Number(hol('pakete', '10')), je = Number(hol('je', '20')), ziel = hol('ziel');
  if (!ziel) throw new Error('--ziel fehlt');
  for (const l of locales) if (!SPRACHEN[l] || l === 'de-de') throw new Error(`Ungueltige Locale ${l}`);
  fs.mkdirSync(ziel, { recursive: true });
  // Pakete reihum auf die Locales verteilen, je Paket nur eine Sprache.
  const proLocale = Object.fromEntries(locales.map((l, i) => [l, Math.floor(anzahl / locales.length) + (i < anzahl % locales.length ? 1 : 0)]));
  let nr = 0;
  for (const l of locales) {
    const liste = await kandidaten({ locale: l, limit: proLocale[l] * je, zufall: false, versucht: [] });
    for (let i = 0; i < liste.length; i += je) {
      nr++;
      const titel = liste.slice(i, i + je).map((t) => ({
        schluessel: `${t.type}:${t.tmdb_id}`, titel_de: t.title, titel_ziel: zielTitel(t, l), quelle: t.quelle,
      }));
      const datei = path.join(ziel, `paket-${l}-${String(nr).padStart(2, '0')}.json`);
      fs.writeFileSync(datei, JSON.stringify({ locale: l, regeln: systemPrompt(l), titel }, null, 1));
    }
    console.log(`${l}: ${liste.length} Titel`);
  }
}

async function einspielen() {
  const dir = hol('verzeichnis'), dry = a.includes('--dry-run');
  if (!dir) throw new Error('--verzeichnis fehlt');
  const z = { ok: 0, format: 0, fakten: 0, unbekannt: 0 };
  console.log(dry ? 'Probelauf' : 'Scharf');
  for (const f of fs.readdirSync(dir).filter((f) => /^texte-[a-z]{2}-[a-z]{2}-\d+\.json$/.test(f)).sort()) {
    const locale = f.slice(6, 11);
    const texte = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const { rows } = await pool.query(
      `SELECT t.type || ':' || t.tmdb_id AS schluessel, t.title, t.original_title, t.title_en, t.year, t.rating,
              t.director, t.cast_names, t.uebersetzungen, d.text AS quelle
         FROM titles t JOIN seo_content d ON d.bereich = 'titel' AND d.locale = 'de-de' AND d.schluessel = t.type || ':' || t.tmdb_id
        WHERE t.type || ':' || t.tmdb_id = ANY($1::text[])`, [Object.keys(texte)]);
    const nach = new Map(rows.map((r) => [r.schluessel, r]));
    for (const [schluessel, roh] of Object.entries(texte)) {
      const t = nach.get(schluessel);
      if (!t) { z.unbekannt++; console.log(`UNBEKANNT ${f} ${schluessel}`); continue; }
      const text = ueberschriftenNormalisieren(String(roh).trim());
      const { fehler, verdacht } = pruefe(text, t, locale);
      if (fehler.length) { z.format++; console.log(`FORMAT ${locale} ${schluessel} ${fehler.join('; ')}`); continue; }
      if (verdacht.length) { z.fakten++; console.log(`FAKTEN ${locale} ${schluessel} ${verdacht.join('; ')}`); continue; }
      z.ok++;
      if (!dry) await pool.query(
        `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('titel', $1, $2, $3)
         ON CONFLICT (bereich, schluessel, locale) DO UPDATE SET text = EXCLUDED.text, aktualisiert_am = now()`,
        [schluessel, locale, text]);
    }
  }
  console.log(`${dry ? 'Wuerde schreiben' : 'Geschrieben'}: ${z.ok} · Format: ${z.format} · Fakten: ${z.fakten} · unbekannt: ${z.unbekannt}`);
}

const befehl = a[0];
(befehl === 'pakete' ? pakete() : befehl === 'einspielen' ? einspielen() : Promise.reject(new Error('Befehl: pakete | einspielen')))
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => pool.end());
