#!/usr/bin/env node
// Selbstpruefung fuer Bearbeiter (Subagenten) OHNE Datenbank: prueft eine
// Texte-Datei gegen die Datensaetze ihrer Paketdatei -- dieselbe Format- und
// Faktenpruefung wie beim Einspielen (seo-personen-check.mjs), nur mit dem
// Datensatz als Quelle statt der DB-Person.
//
//   node scripts/personen-selbstcheck.mjs PAKET.json TEXTE.json
//
// Gibt je beanstandetem Text die Gruende aus; Exit-Code 1, wenn etwas
// beanstandet wurde. Ein Text ohne Beanstandung kann trotzdem Fehler haben
// (die Pruefung ist mechanisch) -- sie ersetzt nicht das Gegenlesen.
import fs from 'node:fs';
import { formatFehlerPerson, faktenVerdachtDatensatz } from './seo-personen-check.mjs';

const [paketPfad, textePfad] = process.argv.slice(2);
if (!paketPfad || !textePfad) {
  console.error('Aufruf: node scripts/personen-selbstcheck.mjs PAKET.json TEXTE.json');
  process.exit(2);
}
const paket = JSON.parse(fs.readFileSync(paketPfad, 'utf8'));
const texte = JSON.parse(fs.readFileSync(textePfad, 'utf8'));

let beanstandet = 0;
for (const p of paket.personen) {
  const text = texte[p.schluessel];
  if (typeof text !== 'string') { console.log(`${p.schluessel} (${p.anzeige}): KEIN TEXT`); beanstandet++; continue; }
  const gruende = [...formatFehlerPerson(text), ...faktenVerdachtDatensatz(text, p.datensatz)];
  if (gruende.length) {
    beanstandet++;
    console.log(`${p.schluessel} (${p.anzeige}):`);
    for (const g of gruende) console.log(`  - ${g}`);
  }
}
console.log(`${paket.personen.length - beanstandet} von ${paket.personen.length} ohne Beanstandung.`);
process.exit(beanstandet ? 1 : 0);
