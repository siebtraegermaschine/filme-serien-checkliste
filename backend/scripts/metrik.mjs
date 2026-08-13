/* Leitet die anonymen Trichter- und Loop-Zahlen aus (IDEEN-WACHSTUM.md,
   Abschnitt 3). Wie bei der Bewertungsstatistik bewusst ohne HTTP-Route:
   Diese Zahlen holt man sich von Hand, sie stehen nicht im Netz.

   Aufruf im Backend-Verzeichnis:

     npm run metrik              # letzte 14 Tage
     npm run metrik -- --tage 30 # anderer Zeitraum */
import 'dotenv/config';
import { pool } from '../db/pool.js';
import { trichter, einladungen, movieNight, wiederkehr } from '../lib/metrik.js';

const argIdx = process.argv.indexOf('--tage');
const TAGE = argIdx !== -1 ? Math.max(1, Number(process.argv[argIdx + 1]) || 14) : 14;
const SCHRITTE = ['besuch', 'erste-markierung', 'konto', 'zehn-titel'];

// 17 statt 16: "erste-markierung" ist genau 16 Zeichen lang -- ohne das
// zusaetzliche Zeichen klebten die Spaltenueberschriften aneinander.
function pad(s, n) { return String(s).padStart(n || 17); }

async function main() {
  const zeilen = await trichter(TAGE);

  console.log(`Trichter der letzten ${TAGE} Tage (anonyme Tageszaehler):\n`);
  console.log(['tag        ', ...SCHRITTE.map((s) => pad(s))].join(''));
  const jeTag = new Map();
  for (const z of zeilen) {
    const tag = z.tag.toISOString().slice(0, 10);
    if (!jeTag.has(tag)) jeTag.set(tag, {});
    jeTag.get(tag)[z.schritt] = Number(z.anzahl);
  }
  const summen = {};
  for (const [tag, werte] of jeTag) {
    console.log([tag, ' ', ...SCHRITTE.map((s) => pad(werte[s] || 0))].join(''));
    for (const s of SCHRITTE) summen[s] = (summen[s] || 0) + (werte[s] || 0);
  }
  console.log(['summe      ', ...SCHRITTE.map((s) => pad(summen[s] || 0))].join(''));
  if (!jeTag.size) console.log('(noch keine Eintraege)');

  const e = await einladungen();
  console.log(`\nKonten gesamt: ${e.konten}, davon ueber Einladung geworben: ${e.geworben}`);
  for (const w of e.werber) console.log(`  ${w.name}: ${w.geworben}`);

  const mn = await movieNight(30);
  console.log(`\nMovie Night (30 Tage): ${mn.runden} Runden, im Schnitt ${mn.teilnehmer_je_runde} Teilnehmer je Runde`);

  const wk = await wiederkehr();
  console.log(`\nWiederkehr: ${wk.tage7} Konten mit Markierungen in den letzten 7 Tagen, ${wk.tage30} in den letzten 30 Tagen`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
