#!/usr/bin/env node
// Schneidet priorisierte Personen in Arbeitspakete fuer die redaktionelle
// Texterstellung -- Pendant zu seo-pakete.mjs fuer Titeltexte, siehe
// seo-auftrag-personen.md und STATUS.md.
//
// Eine Person mit Regie- UND Besetzungscredits bekommt zwei Pakete-Eintraege
// (rolle 'regisseur' und 'schauspieler'), je mit ihrer eigenen, rollen-
// gefilterten Filmografie -- identisch zur Aufteilung in ladePersonSeite()
// (lib/seoData.js): zwei getrennte Seiten statt einer mit doppeltem Inhalt.
//
// Schluessel-Format fuer seo_content (bereich 'person'): `${rolle}:${tmdbPersonId}`.
//
// Ausschluesse:
//   - Priorisierungsschwelle: >=2 Titel im Katalog gesamt (STATUS.md, 18.09.2026)
//   - Keine Biografie im Cache -> kein Werdegang-Abschnitt moeglich, ausgelassen
//   - Namenskollisions-Plausibilitaetscheck (STATUS.md): Geburtsjahr nach dem
//     fruehesten Katalog-Titel oder weniger als 5 Jahre davor ist ein harter
//     Widerspruch (Person kann diesen Titel nicht gemacht haben) -- Hinweis auf
//     eine falsch aufgeloeste Person, wird ausgeschlossen statt riskiert.
//   - Bereits vorhandener seo_content-Eintrag fuer denselben Schluessel/Sprache
//
// Aufruf:
//   node scripts/personen-pakete.mjs --pakete 6 --je 15
//   node scripts/personen-pakete.mjs --locale de-de --pakete 8 --je 20 --ziel /tmp/pakete
//
// Optionen:
//   --locale CODE    Zielsprache (Standard de-de)
//   --pakete N       Zahl der Pakete (Standard 6)
//   --je N           Personen-Rollen je Paket (Standard 15)
//   --min-titel N    Priorisierungsschwelle, Titel gesamt (Standard 2)
//   --ziel PFAD      Ablageort (Standard scripts/.personen-pakete)
//   --mischen SEED   Zufallsreihenfolge statt tmdb_id-Reihenfolge (Stichproben)
//   --ausschluss-datei PFAD  JSON-Array von Schluesseln, die uebersprungen werden
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { datensatzPerson } from './seo-personen-check.mjs';
import { kandidaten, personObjekt } from './personen-daten.mjs';

function argumente() {
  const a = process.argv.slice(2);
  const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };
  return {
    locale: hol('locale', 'de-de'),
    pakete: Number(hol('pakete', '6')),
    je: Number(hol('je', '15')),
    minTitel: Number(hol('min-titel', '2')),
    ziel: hol('ziel', path.join(import.meta.dirname, '.personen-pakete')),
    mischen: hol('mischen', null),
    ausschlussDatei: hol('ausschluss-datei', null),
  };
}

async function main() {
  const opt = argumente();
  const gesamt = opt.pakete * opt.je;

  const ausschluss = opt.ausschlussDatei ? JSON.parse(fs.readFileSync(opt.ausschlussDatei, 'utf8')) : [];
  const offen = await kandidaten({ locale: opt.locale, limit: gesamt, minTitel: opt.minTitel, ausschluss, mischen: opt.mischen });
  if (!offen.length) { console.log('Keine offenen Kandidaten (alle haben einen seo_content-Eintrag).'); await pool.end(); return; }

  fs.mkdirSync(opt.ziel, { recursive: true });
  for (const f of fs.readdirSync(opt.ziel)) {
    if (f.startsWith(`paket-${opt.locale}-`)) fs.unlinkSync(path.join(opt.ziel, f));
  }

  const geschrieben = [];
  for (let i = 0; i < opt.pakete; i++) {
    const teil = offen.slice(i * opt.je, (i + 1) * opt.je);
    if (!teil.length) break;
    const eintraegeMitDatensatz = [];
    for (const row of teil) {
      const person = await personObjekt(row);
      eintraegeMitDatensatz.push({
        schluessel: `${row.rolle}:${row.tmdb_id}`,
        anzeige: `${person.name} (${row.rolle})`,
        datensatz: datensatzPerson(person),
      });
    }
    const datei = path.join(opt.ziel, `paket-${opt.locale}-${String(i + 1).padStart(2, '0')}.json`);
    fs.writeFileSync(datei, JSON.stringify({ locale: opt.locale, personen: eintraegeMitDatensatz }, null, 2));
    geschrieben.push({ datei, anzahl: eintraegeMitDatensatz.length });
  }

  console.log(`${offen.length} offene Personen-Rollen in ${geschrieben.length} Pakete geschnitten (Sprache ${opt.locale}, Schwelle >= ${opt.minTitel} Titel):`);
  for (const g of geschrieben) console.log(`  ${g.anzahl.toString().padStart(3)} Eintraege  ${g.datei}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
