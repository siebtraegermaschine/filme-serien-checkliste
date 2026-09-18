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

// Wrapper analog faktenVerdacht() in seo-batch.mjs: bindet Quelle + Kennzahlen
// an pruefeGegenQuelle() und ergaenzt die personenspezifischen MUSTER.
export function faktenVerdachtPerson(text, p) {
  const quelle = datensatzPerson(p);
  const geburtsjahr = p.geburtstag ? Number(String(p.geburtstag).slice(0, 4)) : undefined;
  const filme = p.filmografie || [];
  const genreCount = new Set(filme.flatMap((f) => f.genres || [])).size;
  const verdacht = pruefeGegenQuelle(text, quelle, {
    year: geburtsjahr,
    castCount: filme.length,
    genreCount,
  });
  const quelleLower = quelle.toLowerCase();
  for (const [re, was] of MUSTER_PERSON) {
    const treffer = text.match(re);
    if (treffer && !quelleLower.includes(treffer[0].toLowerCase())) verdacht.push(`${was}: „${treffer[0]}“`);
  }
  return [...new Set(verdacht)];
}
