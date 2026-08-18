#!/usr/bin/env node
// Sammelt die von den Bearbeitern erzeugten Texte ein, prueft sie und schreibt
// sie nach seo_content. Gegenstueck zu seo-pakete.mjs.
//
// Erwartet JSON-Dateien der Form { "movie:123": "### ...", ... }.
//
// Geprueft wird dreifach, und zwar bevor irgendetwas geschrieben wird:
//   1. Format -- exakt die vier Ueberschriften der Zielsprache, 250-420 Woerter
//   2. Fakten mechanisch -- Zahlen und Eigennamen ohne Beleg im Datensatz
//   3. Schluessel -- muss zu einem Titel gehoeren, der noch keinen Text hat
// Faellt ein Text durch, wird er verworfen und protokolliert. Der Lauf bricht
// nicht ab: Ein schlechter Text unter zwanzig soll die anderen neunzehn nicht
// aufhalten, aber er darf auch nicht durchrutschen.
//
// Aufruf:
//   node scripts/seo-einspielen.mjs --datei /tmp/texte-01.json
//   node scripts/seo-einspielen.mjs --verzeichnis /tmp/texte --dry-run
//
// Optionen:
//   --datei PFAD         Einzelne Textdatei
//   --verzeichnis PFAD   Alle *.json darin
//   --locale CODE        Zielsprache (Standard de-de)
//   --dry-run            Nur pruefen, nichts schreiben
//   --protokoll PFAD     JSONL-Protokoll (Standard scripts/.seo-einspielen.jsonl)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { SPRACHEN, datensatz, formatFehler, faktenVerdacht } from './seo-batch.mjs';

function argumente() {
  const a = process.argv.slice(2);
  const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };
  return {
    datei: hol('datei', null),
    verzeichnis: hol('verzeichnis', null),
    locale: hol('locale', 'de-de'),
    dryRun: a.includes('--dry-run'),
    protokoll: hol('protokoll', path.join(import.meta.dirname, '.seo-einspielen.jsonl')),
  };
}

function texteLesen(opt) {
  const dateien = [];
  if (opt.datei) dateien.push(opt.datei);
  if (opt.verzeichnis) {
    for (const f of fs.readdirSync(opt.verzeichnis).sort()) {
      if (f.endsWith('.json')) dateien.push(path.join(opt.verzeichnis, f));
    }
  }
  const texte = new Map();
  for (const d of dateien) {
    const inhalt = JSON.parse(fs.readFileSync(d, 'utf8'));
    for (const [schluessel, text] of Object.entries(inhalt)) {
      if (typeof text === 'string') texte.set(schluessel, { text, quelle: path.basename(d) });
    }
  }
  return { dateien, texte };
}

// Holt zu den gelieferten Schluesseln die Datensaetze, gegen die geprueft wird.
async function datensaetze(schluessel) {
  const paare = schluessel.map((s) => s.split(':'));
  const { rows } = await pool.query(
    `SELECT t.tmdb_id, t.type, t.title, t.original_title, t.title_en, t.year,
            t.genres, t.director, t.cast_names, t.keywords, t.rating,
            t.vote_count, t.plot, t.overview_en, t.certification, t.uebersetzungen
       FROM titles t
      WHERE (t.type, t.tmdb_id) IN (
        SELECT u.typ, u.id::int FROM unnest($1::text[], $2::text[]) AS u(typ, id))`,
    [paare.map((p) => p[0]), paare.map((p) => p[1])]
  );
  return new Map(rows.map((r) => [`${r.type}:${r.tmdb_id}`, r]));
}

async function main() {
  const opt = argumente();
  if (!opt.datei && !opt.verzeichnis) {
    console.error('Bitte --datei oder --verzeichnis angeben.');
    process.exit(1);
  }
  if (!SPRACHEN[opt.locale]) {
    console.error(`Unbekannte Sprache ${opt.locale}.`);
    process.exit(1);
  }

  const { dateien, texte } = texteLesen(opt);
  console.log(`${texte.size} Texte aus ${dateien.length} Datei(en) · Sprache ${opt.locale}`);
  if (!texte.size) { await pool.end(); return; }

  const saetze = await datensaetze([...texte.keys()]);
  const protokoll = fs.createWriteStream(opt.protokoll, { flags: 'a' });
  const zaehler = { ok: 0, format: 0, fakten: 0, unbekannt: 0 };
  const beanstandet = [];

  for (const [schluessel, { text, quelle }] of texte) {
    const t = saetze.get(schluessel);
    if (!t) {
      zaehler.unbekannt++;
      beanstandet.push({ schluessel, quelle, grund: ['Schluessel gehoert zu keinem Titel'] });
      continue;
    }
    const ff = formatFehler(text, opt.locale);
    const fv = faktenVerdacht(text, t, opt.locale);
    const eintrag = { schluessel, titel: t.title, quelle, locale: opt.locale, formatFehler: ff, faktenVerdacht: fv };

    if (ff.length) { zaehler.format++; beanstandet.push({ ...eintrag, grund: ff }); protokoll.write(JSON.stringify({ ...eintrag, status: 'format' }) + '\n'); continue; }
    if (fv.length) { zaehler.fakten++; beanstandet.push({ ...eintrag, grund: fv }); protokoll.write(JSON.stringify({ ...eintrag, status: 'fakten', text }) + '\n'); continue; }

    if (!opt.dryRun) {
      await pool.query(
        `INSERT INTO seo_content (bereich, schluessel, locale, text)
         VALUES ('titel', $1, $2, $3)
         ON CONFLICT (bereich, schluessel, locale) DO UPDATE
           SET text = EXCLUDED.text, aktualisiert_am = now()`,
        [schluessel, opt.locale, text]
      );
    }
    zaehler.ok++;
    protokoll.write(JSON.stringify({ ...eintrag, status: 'ok' }) + '\n');
  }
  protokoll.end();

  console.log(`\n${opt.dryRun ? 'Probelauf' : 'Geschrieben'}: ${zaehler.ok} ok · ${zaehler.format} Formatfehler · ${zaehler.fakten} Faktenverdacht · ${zaehler.unbekannt} unbekannte Schluessel`);
  for (const b of beanstandet.slice(0, 20)) {
    console.log(`\n  ${b.schluessel} (${b.quelle})${b.titel ? ' · ' + b.titel : ''}`);
    for (const g of b.grund) console.log(`    – ${g}`);
  }
  if (beanstandet.length > 20) console.log(`\n  … und ${beanstandet.length - 20} weitere. Vollstaendig im Protokoll.`);
  console.log(`\nProtokoll: ${opt.protokoll}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
