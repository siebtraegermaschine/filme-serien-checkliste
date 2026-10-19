#!/usr/bin/env node
// Spielt von Bearbeitern geschriebene Bestenlisten-Texte (de-de) ein und ersetzt
// den kurzen Vorlagentext. Sicherung der alten Texte nach --sicherung.
// Aufruf: node scripts/seo-bestenlisten-einspielen.mjs --verzeichnis DIR [--dry-run] [--sicherung DATEI]
// Dateien: { "<modus>:<wert>:<type>": "Text", ... }
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';

const a = process.argv.slice(2);
const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] ? a[i + 1] : s; };
const dir = hol('verzeichnis');
const dry = a.includes('--dry-run');
const sicherung = hol('sicherung', `/tmp/bl-sicherung-${Date.now()}.json`);
const MIN = 900, MAX = 2200;
const VERBOTEN = /datens[aä]tz|schlagw[oö]rt|verzeichnet|hinterlegt|eingetragen|vermerkt|ausgewiesen|\bangabe|\beintrag|meisterhaft|bahnbrechend|legendär|kultfilm|unvergesslich|\bdürfte|\bwohl\b/i;
const NICHT_LATEIN = /[Ѐ-ӿ぀-ヿ㐀-鿿가-힯]/;

const neu = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  Object.assign(neu, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}
let ok = 0; const bad = [];
const alt = {};
for (const [k, text] of Object.entries(neu)) {
  const fehler = [];
  if (text.length < MIN || text.length > MAX) fehler.push(`Laenge ${text.length}`);
  if (VERBOTEN.test(text)) fehler.push('Verbotswort');
  if (NICHT_LATEIN.test(text)) fehler.push('nicht-lateinische Schrift');
  if (/\d{2,}\s*(?:Filme|Serien|Titel)\b/.test(text)) fehler.push('Trefferzahl im Text');
  const { rows } = await pool.query(`SELECT text FROM seo_content WHERE bereich='bestenliste' AND schluessel=$1 AND locale='de-de'`, [k]);
  if (!rows.length) fehler.push('Schluessel unbekannt');
  if (fehler.length) { bad.push(`${k}: ${fehler.join(', ')}`); continue; }
  alt[k] = rows[0].text;
  if (!dry) await pool.query(`UPDATE seo_content SET text=$2, aktualisiert_am=now() WHERE bereich='bestenliste' AND schluessel=$1 AND locale='de-de'`, [k, text]);
  ok++;
}
if (!dry && ok) fs.writeFileSync(sicherung, JSON.stringify(alt, null, 1));
console.log(`${dry ? 'Probelauf' : 'Geschrieben'}: ${ok} ok, ${bad.length} abgelehnt${dry ? '' : `, Sicherung ${sicherung}`}`);
bad.forEach((b) => console.log('  ABGELEHNT', b));
await pool.end();
