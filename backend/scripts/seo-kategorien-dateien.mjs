#!/usr/bin/env node
// Uebersetzt Redaktionstexte (reihe, bestenliste, genre, anbieter, hub, kino_stadt,
// person) ueber Dateien statt Batch-API: Pakete fuer Abo-Subagenten schreiben,
// deren Ergebnisse mit denselben Pruefungen wie seo-kategorien-uebersetzen.mjs einspielen.
//
//   node scripts/seo-kategorien-dateien.mjs pakete --bereich reihe --locale es-es --je 40 --ziel DIR [--ersetzen] [--limit N]
//   node scripts/seo-kategorien-dateien.mjs einspielen --verzeichnis DIR [--dry-run]
// Pakete: paket-<bereich>-<locale>-NN.json, Ergebnisse texte-<bereich>-<locale>-NN.json ({schluessel: text}).
// --ersetzen nimmt auch Zieltexte, die aelter sind als der de-de-Text.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { ZIELE, PERSON_ABSCHNITTE, systemPrompt, uebersetzungPruefen } from './seo-kategorien-uebersetzen.mjs';

const a = process.argv.slice(2);
const modus = a[0];
const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };

async function pakete() {
  const bereich = hol('bereich'), locale = hol('locale'), ziel = hol('ziel');
  const je = Number(hol('je', '40')), limit = Number(hol('limit', 1e9)), ersetzen = a.includes('--ersetzen');
  if (!bereich || !ZIELE[locale] || !ziel) throw new Error('--bereich, --locale (nicht de-de) und --ziel noetig');
  fs.mkdirSync(ziel, { recursive: true });
  const { rows } = await pool.query(
    `SELECT d.schluessel, d.text FROM seo_content d
      WHERE d.locale = 'de-de' AND d.bereich = $1
        AND NOT EXISTS (SELECT 1 FROM seo_content z WHERE z.bereich = d.bereich AND z.schluessel = d.schluessel AND z.locale = $2
                          AND ($3::boolean = false OR z.aktualisiert_am >= d.aktualisiert_am))
      ORDER BY d.schluessel LIMIT $4`, [bereich, locale, ersetzen, limit]);
  const regeln = systemPrompt(locale, [bereich]);
  for (let i = 0, n = 1; i < rows.length; i += je, n++) {
    const datei = path.join(ziel, `paket-${bereich}-${locale}-${String(n).padStart(2, '0')}.json`);
    fs.writeFileSync(datei, JSON.stringify({ locale, bereich, regeln, texte: Object.fromEntries(rows.slice(i, i + je).map((r) => [r.schluessel, r.text])) }, null, 1));
  }
  console.log(`${bereich} ${locale}: ${rows.length} Texte in ${Math.ceil(rows.length / je)} Paketen`);
}

async function einspielen() {
  const dir = hol('verzeichnis'), dry = a.includes('--dry-run');
  if (!dir) throw new Error('--verzeichnis fehlt');
  const z = { ok: 0, verworfen: 0, unbekannt: 0 };
  const verworfen = {};
  console.log(dry ? 'Probelauf' : 'Scharf');
  for (const f of fs.readdirSync(dir).filter((f) => /^texte-[a-z_]+-[a-z]{2}-[a-z]{2}-\d+\.json$/.test(f)).sort()) {
    const [, bereich, locale] = f.match(/^texte-([a-z_]+)-([a-z]{2}-[a-z]{2})-/);
    const texte = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const { rows } = await pool.query(`SELECT schluessel, text FROM seo_content WHERE locale='de-de' AND bereich=$1 AND schluessel = ANY($2::text[])`, [bereich, Object.keys(texte)]);
    const quelle = new Map(rows.map((r) => [r.schluessel, r.text]));
    for (const [schluessel, roh] of Object.entries(texte)) {
      const q = quelle.get(schluessel);
      if (q === undefined) { z.unbekannt++; continue; }
      const text = String(roh).trim();
      const fehler = uebersetzungPruefen(q, text, locale);
      if (bereich === 'person') for (const h of PERSON_ABSCHNITTE[locale] || []) if (!text.includes(`### ${h}`)) { fehler.push(`ueberschrift ${h}`); break; }
      if (text.length < 250 && q.length >= 250) fehler.push(`kurz ${text.length}`);
      if (fehler.length) { z.verworfen++; verworfen[`${bereich}|${locale}|${schluessel}`] = fehler; continue; }
      if (!dry) await pool.query(
        `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ($1,$2,$3,$4)
         ON CONFLICT (bereich, schluessel, locale) DO UPDATE SET text = EXCLUDED.text, aktualisiert_am = now()`, [bereich, schluessel, locale, text]);
      z.ok++;
    }
  }
  fs.writeFileSync(path.join(dir, 'verworfen.json'), JSON.stringify(verworfen, null, 1));
  console.log(`${z.ok} ok, ${z.verworfen} verworfen, ${z.unbekannt} unbekannt (Details: verworfen.json)`);
}

try { await (modus === 'pakete' ? pakete() : modus === 'einspielen' ? einspielen() : Promise.reject(new Error('pakete|einspielen'))); }
catch (e) { console.error(e.message); process.exitCode = 1; }
await pool.end();
