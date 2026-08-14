/* npm run kpi:verify -- gibt den Snapshot der letzten abgeschlossenen Woche
   aus und nennt fuer jedes null-Feld den Grund ("kein Event X im Zeitraum" /
   "Konfigtabelle leer"). Gedacht als Handgriff nach Deploys und vor dem
   ersten Blick ins Cockpit: null muss erklaerbar sein, sonst stimmt etwas
   an der Erfassung nicht. */
import { pool } from '../db/pool.js';
import { buildSnapshot, abgeschlosseneWoche } from '../lib/kpi.js';

const woche = await abgeschlosseneWoche(1);
const { snapshot, gruende } = await buildSnapshot(woche.from, woche.to);

console.log(`KPI-Snapshot ${woche.from} .. ${woche.to}\n`);
console.log(JSON.stringify(snapshot, null, 2));

const nullFelder = Object.entries(snapshot.metrics).filter(([, wert]) => wert === null);
if (nullFelder.length) {
  console.log('\nnull-Felder und ihre Gruende:');
  for (const [feld] of nullFelder) {
    console.log(`  ${feld}: ${gruende[feld] || 'kein Grund vermerkt (bitte pruefen)'}`);
  }
} else {
  console.log('\nKeine null-Felder.');
}

await pool.end();
