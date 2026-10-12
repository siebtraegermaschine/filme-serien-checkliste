#!/usr/bin/env node
// Faktenpruefung fuer Personentexte -- Pendant zu formatFehler()/
// faktenVerdacht() in seo-batch.mjs fuer Titeltexte, siehe
// seo-auftrag-personen.md (Abschnitt SELBSTPRUEFUNG) und STATUS.md.
//
// Die mechanische Zahlen-/Namenspruefung selbst (pruefeGegenQuelle) wird von
// dort importiert statt dupliziert -- sie ist bereits generisch (Text gegen
// Quelltext plus Kennzahlen) und funktioniert unveraendert fuer Personen.
// Neu ist hier nur, was fuer Titel nicht passt: die drei Personen-
// Ueberschriften, ein eigener Wortzahlrahmen (seo-auftrag-personen.md) und
// datensatzPerson(), das die Quelle (Biografie + eigene Katalog-Filmografie)
// so als Text rendert, dass daraus abgeleitete Zahlen (Zeitspannen, Anzahl
// Titel) bereits woertlich in der Quelle stehen -- dann greift die generische
// Zahlenpruefung ohne Sonderfaelle pro Feld.
import { pruefeGegenQuelle } from './seo-batch.mjs';

export const PERSON_ABSCHNITTE = ['Werdegang', 'Filmografie bei uns', 'Einordnung'];

// seo-auftrag-personen.md: 220-280 Wort Zielkorridor, unter 200 bzw. ueber 340
// wird verworfen.
const MIN_WOERTER_PERSON = 200;
const MAX_WOERTER_PERSON = 340;

export function formatFehlerPerson(text) {
  const fehler = [];
  const ueberschriften = [...text.matchAll(/^#{1,6}\s*(.+)$/gm)].map((m) => m[1].trim());
  if (ueberschriften.length !== 3 || ueberschriften.some((u, i) => u !== PERSON_ABSCHNITTE[i])) {
    fehler.push(`Ueberschriften falsch: ${JSON.stringify(ueberschriften)}`);
  }
  const woerter = text.replace(/^#{1,6}.*$/gm, '').split(/\s+/).filter(Boolean).length;
  if (woerter < MIN_WOERTER_PERSON) fehler.push(`zu kurz: ${woerter} Woerter`);
  if (woerter > MAX_WOERTER_PERSON) fehler.push(`zu lang: ${woerter} Woerter`);
  if (/^\s*[-*•]\s/m.test(text)) fehler.push('Aufzaehlung enthalten');
  if (/\*\*/.test(text)) fehler.push('Fettschrift enthalten');
  return fehler;
}

// Woerter, die typischerweise eine unbelegte Behauptung ueber eine reale
// Person einleiten -- Pendant zu MUSTER in seo-batch.mjs, aber auf die in
// seo-auftrag-personen.md genannten Verbote zugeschnitten (Auszeichnungen,
// Privatleben/Gesundheit/Tod, Werturteile, Karriereeinordnung), statt auf
// Produktions-/Geschaeftszahlen wie bei Titeltexten.
const MUSTER_PERSON = [
  [/\b(gewann (?:den|einen|die)|wurde ausgezeichnet|(?:war |wurde )?nominiert|Oscar|Golden Globe|Goldene[nr]? (?:Palme|Bär|Himbeere)|César|Emmy|BAFTA|Preistr[äa]ger|won (?:the|an)|nominated for)\b/i, 'Auszeichnung'],
  [/\b(verheiratet|Ehefrau|Ehemann|Partnerin|Partner|Scheidung|Tochter|Sohn|Kinder|erkrankte|Krankheit|verstarb|starb an|Todesursache|Beerdigung)\b/i, 'Privatleben'],
  [/\b(einer der (?:besten|groessten|einflussreichsten)|eine[r]? der (?:besten|groessten)|gefeiert[e]?|Ikone|Legende|brillant|genial|unvergleichlich|Jahrhunderttalent)\b/i, 'Werturteil'],
  [/\b(pr[äa]gte|revolutionierte|beeinflusste (?:eine ganze )?Generation|Vermaechtnis|hinterliess Spuren|gilt als Wegbereiter)\b/i, 'Karriereeinordnung'],
  [/\b(Skandal|Kontroverse|Gerichtsverfahren|Prozess|Klage|verurteilt)\b/i, 'Kontroverse'],
];

// Rendert Biografie + eigene Filmografie als Fliesstext-Quelle -- dieselbe
// Funktion liefert sowohl die Pruef-Quelle hier als auch (im Paketier-Skript)
// den DATENSATZ, den das Modell erhaelt, damit beide garantiert denselben
// Stand sehen.
export function datensatzPerson(p) {
  const teile = [];
  teile.push(`Name: ${p.name}`);
  teile.push(`Rolle: ${p.rolle}`);
  if (p.geburtstag) teile.push(`Geburtsdatum: ${p.geburtstag}`);
  if (p.biografie) teile.push(`Biografie: ${p.biografie}`);

  const filme = p.filmografie || [];
  teile.push(`Anzahl Titel im Katalog: ${filme.length}`);
  if (filme.length) {
    const jahre = filme.map((f) => f.year).filter(Boolean);
    if (jahre.length) {
      const von = Math.min(...jahre);
      const bis = Math.max(...jahre);
      teile.push(`Zeitspanne der Titel: ${von} bis ${bis} (${bis - von} Jahre)`);
      const geburtsjahr = p.geburtstag ? Number(String(p.geburtstag).slice(0, 4)) : null;
      if (geburtsjahr) {
        teile.push(`Abstand Geburtsjahr zu erstem Titel: ${von - geburtsjahr} Jahre`);
        teile.push(`Abstand Geburtsjahr zu letztem Titel: ${bis - geburtsjahr} Jahre`);
      }
    }
    const genres = [...new Set(filme.flatMap((f) => f.genres || []))];
    if (genres.length) teile.push(`Genres: ${genres.join(', ')} (${genres.length})`);
    const filmeCount = filme.filter((f) => f.type === 'movie').length;
    const serienCount = filme.filter((f) => f.type === 'series').length;
    teile.push(`Davon Filme: ${filmeCount}, Serien: ${serienCount}`);
    // rating kommt aus Postgres als NUMERIC -- node-postgres liefert das als
    // String, nicht als Zahl, sonst wirft toFixed().
    const bewertungen = filme.map((f) => Number(f.rating)).filter((r) => Number.isFinite(r));
    if (bewertungen.length) {
      const schnitt = bewertungen.reduce((a, b) => a + b, 0) / bewertungen.length;
      teile.push(`Unsere Bewertungen: ${bewertungen.map((r) => r.toFixed(1)).join(', ')} (Schnitt ${schnitt.toFixed(1)})`);
    }
    teile.push(`Titel: ${filme.map((f) => `${f.title} (${f.year || 'o. J.'})`).join('; ')}`);
  }
  return teile.join('\n');
}

// Biografien liegen meist englisch vor, die Texte sind deutsch. Die woertliche
// Musterpruefung meldete deshalb belegte Aussagen als erfunden ("Academy
// Award" in der Quelle, "Oscar" im Text). Diese Tabelle ergaenzt die Quelle um
// das deutsche Stichwort, wenn der englische Beleg dort steht. Bewusst eng:
// nur eindeutige Entsprechungen, nichts Allgemeines wie "film".
const BELEGE_DE = [
  [/academy award|oscar/, 'oscar'],
  [/nominat/, 'nominiert wurde nominiert war nominiert'],
  [/\bwon\b|\bwinner\b|\bwins\b/, 'gewann den gewann einen gewann die'],
  [/awarded/, 'wurde ausgezeichnet'],
  [/\baward|\bprize|winner/, 'preisträger'],
  [/\bson\b|\bsons\b|born to|\bparents?\b/, 'sohn'],
  [/daughter|born to|\bparents?\b/, 'tochter'],
  [/\bchild|\bkids?\b/, 'kinder'],
  [/married|\bwife\b|\bhusband\b/, 'verheiratet ehefrau ehemann'],
  [/\bpartner/, 'partner partnerin'],
  [/divorc/, 'scheidung'],
  [/filming|\bshoot|on set/, 'dreharbeiten'],
  [/production company|production house/, 'produktionsfirma'],
  [/\bcritic/, 'kritiker'],
  [/\breviews?\b/, 'rezension'],
  [/lawsuit|\btrial\b|\bsued\b/, 'prozess klage'],
  [/scandal/, 'skandal'],
  [/controvers/, 'kontroverse'],
  [/convicted|sentenced/, 'verurteilt'],
];

const ZAHLWORT_EN = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

// "two hundred fifty" -> 250, "roughly sixty" -> 60: aus zusammenhaengenden
// englischen Zahlwoertern die Ziffer ableiten.
function zahlwoerterZuZiffern(quelleLower) {
  const out = [];
  const re = new RegExp(`\\b((?:(?:${Object.keys(ZAHLWORT_EN).join('|')}|hundred|thousand)(?:[\\s-]+|\\b))+)`, 'g');
  for (const m of quelleLower.matchAll(re)) {
    let summe = 0, aktuell = 0;
    for (const w of m[1].split(/[\s-]+/).filter(Boolean)) {
      if (w in ZAHLWORT_EN) aktuell += ZAHLWORT_EN[w];
      else if (w === 'hundred') aktuell = (aktuell || 1) * 100;
      else if (w === 'thousand') { summe += (aktuell || 1) * 1000; aktuell = 0; }
    }
    out.push(summe + aktuell);
  }
  return out;
}

// Zahlen, die sich zwingend aus der Quelle errechnen (Bewertungsspanne,
// Schwellen um die Bewertungen, Anzahl abzueglich eins, Jahreskuerzel,
// Tausendertrenner, englische Zahlwoerter). Sie sind keine Erfindung und
// werden der Quelle als Zusatzzeile angehaengt.
function abgeleiteteZahlen(quelle) {
  const lower = quelle.toLowerCase();
  const werte = [];
  const m = quelle.match(/^Unsere Bewertungen: ([\d., ]+?) \(Schnitt ([\d.]+)\)/m);
  if (m) {
    const r = m[1].split(',').map((s) => Number(s.trim())).filter(Number.isFinite);
    const schnitt = Number(m[2]);
    if (r.length) {
      const min = Math.min(...r), max = Math.max(...r);
      for (const x of [min, max, schnitt]) {
        werte.push(Math.floor(x), Math.ceil(x), Math.floor(x * 2) / 2, Math.ceil(x * 2) / 2);
      }
      werte.push(max - min, max - schnitt, schnitt - min);
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) werte.push(Math.abs(r[i] - r[j]));
    }
  }
  const n = quelle.match(/^Anzahl Titel im Katalog: (\d+)/m);
  if (n) werte.push(Number(n[1]) - 1, Number(n[1]) - 2);
  const g = quelle.match(/^Genres: .*\((\d+)\)$/m);
  if (n && g && Number(n[1])) werte.push(Number(g[1]) / Number(n[1]));
  for (const k of lower.matchAll(/(?<![\d'’])['’](\d\d)\b/g)) werte.push(Number(k[1]) >= 30 ? 1900 + Number(k[1]) : 2000 + Number(k[1]));
  for (const k of lower.matchAll(/\b(\d{1,3}),(\d{3})\b/g)) werte.push(Number(k[1] + k[2]));
  werte.push(...zahlwoerterZuZiffern(lower));
  return werte.filter((x) => Number.isFinite(x) && x >= 0).map((x) => (Number.isInteger(x) ? String(x) : x.toFixed(1)));
}

export function quelleErweitern(quelle) {
  const lower = quelle.toLowerCase();
  const stichworte = BELEGE_DE.filter(([re]) => re.test(lower)).map(([, de]) => de);
  return `${quelle}\nAbgeleitet: ${abgeleiteteZahlen(quelle).join(' ')} ${stichworte.join(' ')}`;
}

// Gemeinsamer Kern: Quelle + Kennzahlen -> Zahlen-/Namenspruefung plus die
// personenspezifischen MUSTER.
function pruefeQuelle(text, quelleRoh, kennzahlen) {
  const quelle = quelleErweitern(quelleRoh);
  const verdacht = pruefeGegenQuelle(text, quelle, kennzahlen);
  const quelleLower = quelle.toLowerCase();
  for (const [re, was] of MUSTER_PERSON) {
    const treffer = text.match(re);
    if (treffer && !quelleLower.includes(treffer[0].toLowerCase())) verdacht.push(`${was}: „${treffer[0]}“`);
  }
  return [...new Set(verdacht)];
}

// Wrapper analog faktenVerdacht() in seo-batch.mjs: bindet Quelle + Kennzahlen
// an pruefeGegenQuelle() und ergaenzt die personenspezifischen MUSTER.
export function faktenVerdachtPerson(text, p) {
  const quelle = datensatzPerson(p);
  const geburtsjahr = p.geburtstag ? Number(String(p.geburtstag).slice(0, 4)) : undefined;
  const filme = p.filmografie || [];
  const genreCount = new Set(filme.flatMap((f) => f.genres || [])).size;
  return pruefeQuelle(text, quelle, { year: geburtsjahr, castCount: filme.length, genreCount });
}

// Gleiche Pruefung gegen einen fertig gerenderten Datensatz-Text (Paketdatei),
// ohne DB -- fuer die Selbstpruefung der Bearbeiter. Kennzahlen werden aus den
// Zeilen des Datensatzes gelesen.
export function faktenVerdachtDatensatz(text, datensatz) {
  const zahl = (re) => { const m = datensatz.match(re); return m ? Number(m[1]) : undefined; };
  return pruefeQuelle(text, datensatz, {
    year: zahl(/^Geburtsdatum: (\d{4})/m),
    castCount: zahl(/^Anzahl Titel im Katalog: (\d+)/m),
    genreCount: zahl(/^Genres: .*\((\d+)\)$/m),
  });
}
