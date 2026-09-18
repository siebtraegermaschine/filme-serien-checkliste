#!/usr/bin/env node
// Sammelt die von den Bearbeitern erzeugten Personentexte ein, prueft sie und
// schreibt sie nach seo_content. Gegenstueck zu personen-pakete.mjs, Pendant
// zu seo-einspielen.mjs fuer Titeltexte.
//
// Erwartet JSON-Dateien der Form { "regisseur:1": "### Werdegang\n...", ... }
// -- derselbe Schluessel wie in den Pakete-Dateien (rolle:tmdbPersonId).
//
// Geprueft wird dreifach, bevor irgendetwas geschrieben wird:
//   1. Format -- exakt die drei Personen-Ueberschriften, 200-340 Woerter
//   2. Fakten mechanisch -- Zahlen und Eigennamen ohne Beleg im Datensatz,
//      verbotene Formulierungen (Auszeichnung, Privatleben, Werturteil, ...)
//   3. Schluessel -- muss zu einer Person/Rolle gehoeren, die noch keinen
//      Text hat und den Katalogdaten hier noch tatsaechlich entspricht
// Faellt ein Text durch, wird er verworfen und protokolliert, der Lauf
// bricht nicht ab.
//
// Aufruf:
//   node scripts/personen-einspielen.mjs --datei /tmp/texte-01.json
//   node scripts/personen-einspielen.mjs --verzeichnis /tmp/texte --dry-run
//
// Optionen:
//   --datei PFAD         Einzelne Textdatei
//   --verzeichnis PFAD   Alle *.json darin
//   --locale CODE        Zielsprache (Standard de-de)
//   --dry-run            Nur pruefen, nichts schreiben
//   --protokoll PFAD     JSONL-Protokoll (Standard scripts/.personen-einspielen.jsonl)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { formatFehlerPerson, faktenVerdachtPerson } from './seo-personen-check.mjs';

const NOTE_SQL = `CASE WHEN COALESCE(rating, 0) = 0 THEN 0
  ELSE (COALESCE(vote_count, 0)::float / (COALESCE(vote_count, 0) + 1000)) * rating
     + (1000::float / (COALESCE(vote_count, 0) + 1000)) * 6.76 END`;

function argumente() {
  const a = process.argv.slice(2);
  const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };
  return {
    datei: hol('datei', null),
    verzeichnis: hol('verzeichnis', null),
    locale: hol('locale', 'de-de'),
    dryRun: a.includes('--dry-run'),
    protokoll: hol('protokoll', path.join(import.meta.dirname, '.personen-einspielen.jsonl')),
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

const geburtstagString = (wert) => {
  if (!wert) return null;
  const d = new Date(wert);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Holt zu einem Schluessel (rolle:tmdbPersonId) die Person aus dem Cache und
// ihre rollengefilterte Filmografie -- dieselbe Abfrage wie in
// personen-pakete.mjs, bewusst dupliziert statt importiert (das Paket-Skript
// laeuft beim Import direkt in main(), ist also kein Modul zum Wiederverwenden).
async function personDatensatz(schluessel) {
  const [rolle, tmdbIdStr] = schluessel.split(':');
  const tmdbId = Number(tmdbIdStr);
  if (!['regisseur', 'schauspieler'].includes(rolle) || !Number.isInteger(tmdbId)) return null;

  const { rows: personRows } = await pool.query(
    `SELECT pr.name AS katalogname, pc.biografie, pc.geburtstag
       FROM personen_resolution pr
       JOIN personen_cache pc ON pc.tmdb_person_id = pr.tmdb_person_id
      WHERE pr.tmdb_person_id = $1
      LIMIT 1`,
    [tmdbId]
  );
  if (!personRows.length) return null;
  const person = personRows[0];

  const bedingung = rolle === 'regisseur' ? 'director = $1' : '$1 = ANY(cast_names)';
  const { rows: filmRows } = await pool.query(
    `SELECT title, year, type, genres, rating FROM titles
      WHERE ${bedingung} ORDER BY ${NOTE_SQL} DESC LIMIT 24`,
    [person.katalogname]
  );
  if (!filmRows.length) return null;

  return {
    name: person.katalogname,
    rolle: rolle === 'regisseur' ? 'Regisseur/in' : 'Schauspieler/in',
    geburtstag: geburtstagString(person.geburtstag),
    biografie: person.biografie,
    filmografie: filmRows.map((f) => ({ title: f.title, year: f.year, type: f.type, genres: f.genres || [], rating: f.rating })),
  };
}

async function main() {
  const opt = argumente();
  if (!opt.datei && !opt.verzeichnis) {
    console.error('Bitte --datei oder --verzeichnis angeben.');
    process.exit(1);
  }

  const { dateien, texte } = texteLesen(opt);
  console.log(`${texte.size} Texte aus ${dateien.length} Datei(en) · Sprache ${opt.locale}`);
  if (!texte.size) { await pool.end(); return; }

  const protokoll = fs.createWriteStream(opt.protokoll, { flags: 'a' });
  const zaehler = { ok: 0, format: 0, fakten: 0, unbekannt: 0 };
  const beanstandet = [];

  for (const [schluessel, { text, quelle }] of texte) {
    const p = await personDatensatz(schluessel);
    if (!p) {
      zaehler.unbekannt++;
      beanstandet.push({ schluessel, quelle, grund: ['Schluessel gehoert zu keiner bekannten Person/Rolle im Katalog'] });
      continue;
    }
    const ff = formatFehlerPerson(text);
    const fv = faktenVerdachtPerson(text, p);
    const eintrag = { schluessel, name: p.name, quelle, locale: opt.locale, formatFehler: ff, faktenVerdacht: fv };

    if (ff.length) { zaehler.format++; beanstandet.push({ ...eintrag, grund: ff }); protokoll.write(JSON.stringify({ ...eintrag, status: 'format' }) + '\n'); continue; }
    if (fv.length) { zaehler.fakten++; beanstandet.push({ ...eintrag, grund: fv }); protokoll.write(JSON.stringify({ ...eintrag, status: 'fakten', text }) + '\n'); continue; }

    if (!opt.dryRun) {
      await pool.query(
        `INSERT INTO seo_content (bereich, schluessel, locale, text)
         VALUES ('person', $1, $2, $3)
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
    console.log(`\n  ${b.schluessel} (${b.quelle})${b.name ? ' · ' + b.name : ''}`);
    for (const g of b.grund) console.log(`    – ${g}`);
  }
  if (beanstandet.length > 20) console.log(`\n  … und ${beanstandet.length - 20} weitere. Vollstaendig im Protokoll.`);
  console.log(`\nProtokoll: ${opt.protokoll}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
