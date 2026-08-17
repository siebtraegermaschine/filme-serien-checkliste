// Haengt NEUE Eintraege an seo-content-daten.mjs an (bereich 'titel', locale 'de-de').
// Aufruf: node anhaengen.mjs <overlay.mjs> "<Blockueberschrift>"
// Overlay exportiert: export const NEU = { 'movie:12345': `...`, ... }
// Bricht ohne jede Schreiboperation ab, wenn ein Text die Pruefung nicht besteht
// oder ein Schluessel bereits vorhanden ist.
import fs from 'node:fs';
import path from 'node:path';

const ZIEL = '/Users/digital-wings/Documents/GitHub/filme-serien-checkliste/backend/scripts/seo-content-daten.mjs';
const ABSCHNITTE = ['Worum es geht', 'Entstehungsgeschichte', 'Hinter den Kulissen', 'Einordnung & Wirkung'];

const overlayPfad = path.resolve(process.argv[2]);
const blocktitel = process.argv[3] || 'Weitere Titel';
const { NEU } = await import(overlayPfad);

const src = fs.readFileSync(ZIEL, 'utf8');
const { EINTRAEGE } = await import(ZIEL);
const vorhanden = new Set(EINTRAEGE.map((e) => e.schluessel));

const fehler = [];
const bloecke = [];

for (const [key, text] of Object.entries(NEU)) {
  if (!/^(movie|series):\d+$/.test(key)) fehler.push(`${key}: Schluesselformat ungueltig`);
  if (vorhanden.has(key)) fehler.push(`${key}: bereits vorhanden — anhaengen wuerde eine Dublette erzeugen`);
  for (const a of ABSCHNITTE) {
    if (!text.includes(`### ${a}`)) fehler.push(`${key}: Abschnitt "${a}" fehlt`);
  }
  const reihenfolge = ABSCHNITTE.map((a) => text.indexOf(`### ${a}`));
  if (reihenfolge.some((p, i) => i > 0 && p < reihenfolge[i - 1])) fehler.push(`${key}: Abschnitte in falscher Reihenfolge`);
  const woerter = text.replace(/###.*/g, '').split(/\s+/).filter(Boolean).length;
  if (woerter < 250) fehler.push(`${key}: nur ${woerter} Woerter (min 250)`);
  if (text.includes('`') || text.includes('${')) fehler.push(`${key}: Backtick/Interpolation im Text`);

  bloecke.push(`  {\n    bereich: 'titel', schluessel: '${key}', locale: 'de-de',\n    text: \`${text}\` },`);
}

if (fehler.length) {
  console.error('ABBRUCH — nichts geschrieben:');
  for (const f of fehler) console.error('  ' + f);
  process.exit(1);
}

const marke = '\n];';
const pos = src.lastIndexOf(marke);
if (pos < 0) {
  console.error('ABBRUCH — Abschluss "];" nicht gefunden.');
  process.exit(1);
}

const einschub = `\n  // ---- ${blocktitel} ----\n` + bloecke.join('\n') + '\n';
fs.writeFileSync(ZIEL, src.slice(0, pos) + einschub + src.slice(pos + 1));
console.log(`${bloecke.length} Texte angehaengt.`);
