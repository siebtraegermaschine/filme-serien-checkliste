/* Leitet die anonyme Bewertungsstatistik aus (Abschnitt 9 der
   Datenschutzerklaerung). Der einzige vorgesehene Weg, an diese Zahlen zu
   kommen -- die Mindestzahl steckt in bewertungsstatistik.js und gilt damit
   fuer jeden Aufruf.

   Aufruf im Backend-Verzeichnis:

     npm run statistik              # Uebersicht auf den Bildschirm
     npm run statistik -- --csv     # CSV nach stdout, zum Umleiten in eine Datei

   Bewusst ohne HTTP-Route: Eine Auswertung, die an Dritte geht, soll ein
   bewusster Schritt von Hand sein und keine URL, die irgendwann jemand offen
   im Netz stehen laesst. */
import 'dotenv/config';
import { pool } from '../db/pool.js';
import {
  bewertungsstatistik,
  zurueckgehalteneTitel,
  MINDESTZAHL_BEWERTUNGEN,
} from '../lib/bewertungsstatistik.js';

const alsCsv = process.argv.includes('--csv');

function csvFeld(wert) {
  const s = String(wert ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function main() {
  const zeilen = await bewertungsstatistik();
  const { zurueckgehalten, aufgenommen } = await zurueckgehalteneTitel();

  if (alsCsv) {
    const kopf = ['titel', 'jahr', 'typ', 'bewertungen'];
    for (let s = 1; s <= 10; s++) kopf.push(`sterne_${s}`);
    console.log(kopf.join(','));
    for (const z of zeilen) {
      console.log([z.titel, z.jahr, z.typ, z.gesamt, ...z.verteilung].map(csvFeld).join(','));
    }
    // Die Einordnung nach stderr, damit sie eine umgeleitete CSV nicht verschmutzt.
    console.error(`${zeilen.length} Titel ausgegeben, ${zurueckgehalten} unter der Mindestzahl zurueckgehalten.`);
    return;
  }

  console.log(`Mindestzahl: ${MINDESTZAHL_BEWERTUNGEN} Bewertungen je Titel.`);
  console.log(`Aufgenommen: ${aufgenommen} Titel, zurueckgehalten: ${zurueckgehalten}.`);
  if (!zeilen.length) {
    console.log('\nKein Titel erreicht die Mindestzahl -- es gibt nichts auszuleiten.');
    return;
  }
  console.log('');
  for (const z of zeilen.slice(0, 50)) {
    const v = z.verteilung.map((n, i) => (n ? `${i + 1}★:${n}` : null)).filter(Boolean).join('  ');
    console.log(`${String(z.gesamt).padStart(6)}  ${z.titel} (${z.jahr})`);
    console.log(`        ${v}`);
  }
  if (zeilen.length > 50) console.log(`\n… und ${zeilen.length - 50} weitere.`);
}

main()
  .catch((err) => {
    console.error('Auswertung fehlgeschlagen:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
