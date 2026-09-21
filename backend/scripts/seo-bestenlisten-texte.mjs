#!/usr/bin/env node
// Legt Redaktionstexte fuer alle qualifizierenden Bestenlisten in seo_content an
// (bereich 'bestenliste'). Deterministisch aus DB-Fakten, kein API-Aufruf, keine
// Kosten. Legt nur FEHLENDE Eintraege an; bestehende Texte bleiben unangetastet.
// Kino-/Neu-Texte nennen weder Zahlen noch Titel -- die Listen aendern sich
// laufend, der Text darf nicht veralten.
//
// Aufruf (im Backend-Container):
//   node scripts/seo-bestenlisten-texte.mjs [--dry-run] [--zeige 5] [--modus genre-anbieter]
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';
import { ladeBestenliste, alleBestenlisten } from '../lib/seoData.js';
import { THEMEN, jahrzehntName, LAUFZEITEN, STAFFELN } from '../lib/seoBestenlisten.js';

const LOCALE = 'de-de';

function ueber(n) {
  if (n < 20) return String(n);
  const schritt = n >= 1000 ? 500 : n >= 100 ? 50 : 10;
  return `über ${Math.floor(n / schritt) * schritt}`;
}

function spitze(titel) {
  const namen = titel.slice(0, 3).map((t) => `„${t.title}“`);
  if (namen.length < 2) return namen.join('');
  return `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`;
}

const SORTIERUNG = 'Sortiert wird nach der Bewertung der MovieMatch-Community, sonst nach der gewichteten TMDB-Bewertung — damit ein Titel mit nur wenigen Stimmen nicht ganz oben landet.';

// daten = Ergebnis von ladeBestenliste. Liefert den Text oder null.
export function bauText(daten) {
  const serie = daten.type === 'series';
  const w = serie ? 'Serien' : 'Filme';
  const eins = serie ? 'Serie' : 'Film';
  const n = daten.gesamtGefunden;
  const top = spitze(daten.titel);
  const [erst, zweit] = String(daten.wert).split('+');
  const genre = daten.genre;
  const treffer = `Im MovieMatch-Katalog stehen ${ueber(n)} ${w}`;

  switch (daten.modus) {
    case 'jahr':
      return `Welche ${w} des Jahres ${daten.wert} sind am besten bewertet? ${treffer} dieses Jahrgangs; die Liste zeigt die 20 stärksten, an der Spitze ${top}. ${SORTIERUNG}`;
    case 'genre':
      return `Die besten ${genre}-${w}: ${treffer} dieses Genres, die Liste zeigt die 20 am höchsten bewerteten — angeführt von ${top}. ${SORTIERUNG} Wer das ganze Genre durchstöbern will, findet unter „Alle ${genre}-${w}“ den vollständigen Katalog.`;
    case 'anbieter':
      return `Die besten ${w} auf ${daten.anbieter}: Aus dem aktuellen Streaming-Angebot in Deutschland (${ueber(n)} ${w} im Abo) zeigt die Liste die 20 am höchsten bewerteten, an der Spitze ${top}. ${SORTIERUNG} Das Angebot ändert sich; die Liste folgt ihm.`;
    case 'jahrzehnt':
      return `Die besten ${w} der ${jahrzehntName(erst)}: ${treffer} aus diesem Jahrzehnt, die Liste zeigt die 20 am höchsten bewerteten, angeführt von ${top}. ${SORTIERUNG}`;
    case 'thema': {
      const t = THEMEN[erst];
      return `Die besten ${t[serie ? 'serie' : 'film']}: ${treffer} mit dem Thema „${t.name}“, die Liste zeigt die 20 am höchsten bewerteten — angeführt von ${top}. Die Zuordnung beruht auf den Schlagwörtern im Katalog und ist nicht bei jedem Titel vollständig. ${SORTIERUNG}`;
    }
    case 'genre-jahrzehnt':
      return `Die besten ${genre}-${w} der ${jahrzehntName(zweit)}: ${treffer} dieser Kombination, die Liste zeigt die 20 am höchsten bewerteten, an der Spitze ${top}. ${SORTIERUNG}`;
    case 'genre-anbieter':
      return `Die besten ${genre}-${w} auf ${daten.anbieter}: Aus dem aktuellen Streaming-Angebot in Deutschland zeigt die Liste die 20 am höchsten bewerteten ${genre}-Titel, an der Spitze ${top}. ${SORTIERUNG} Das Angebot ändert sich; die Liste folgt ihm.`;
    case 'land':
      return `Die besten ${w} ${daten.landAus}: ${treffer} mit diesem Herkunftsland, die Liste zeigt die 20 am höchsten bewerteten, angeführt von ${top}. Bei Koproduktionen zählt jedes beteiligte Land. ${SORTIERUNG}`;
    case 'land-genre':
      return `Die besten ${genre}-${w} ${daten.landAus}: ${treffer} dieser Kombination, die Liste zeigt die 20 am höchsten bewerteten, an der Spitze ${top}. Bei Koproduktionen zählt jedes beteiligte Land. ${SORTIERUNG}`;
    case 'sprache':
      return `Die besten ${w} auf ${daten.sprache}: ${treffer} mit ${daten.sprache} als Originalsprache, die Liste zeigt die 20 am höchsten bewerteten, angeführt von ${top}. Gemeint ist die Originalfassung, nicht die Synchronisation. ${SORTIERUNG}`;
    case 'laufzeit': {
      const l = LAUFZEITEN[erst];
      const hinweis = l.max ? 'Ideal für einen kurzen Filmabend: Filme ab 60 Minuten Laufzeit zählen mit, Kurzfilme nicht.' : 'Für lange Abende und Freunde des großen Erzählens: Die Liste zeigt die Epen unter den Filmen.';
      return `Die besten ${w} ${l.kurz}: ${treffer} in dieser Länge, die Liste zeigt die 20 am höchsten bewerteten, angeführt von ${top}. ${hinweis} ${SORTIERUNG}`;
    }
    case 'staffeln': {
      const st = STAFFELN[erst];
      const hinweis = st.max ? 'Abgeschlossene Geschichten, die sich an einem Wochenende schaffen lassen, zählen hier mit.' : 'Serien, die über viele Jahre trugen, sind hier zusammengefasst — ein guter Ausgangspunkt für alle, die lange dranbleiben wollen.';
      return `Die besten ${w} ${st.kurz}: ${treffer} in dieser Länge, die Liste zeigt die 20 am höchsten bewerteten, angeführt von ${top}. ${hinweis} ${SORTIERUNG}`;
    }
    case 'kino':
      return `Die besten ${w} im Kino: Aus den Filmen, die gerade in den deutschen Kinos laufen und im MovieMatch-Katalog stehen, zeigt die Liste die am höchsten bewerteten. ${SORTIERUNG} Wer einen Kinoabend plant, sieht hier auf einen Blick, welche der laufenden Filme sich am meisten lohnen — und findet über die Kino-Seiten die Kinos in der eigenen Stadt.`;
    case 'neu':
      return `Die besten neuen ${w}: Die Liste zeigt die am höchsten bewerteten ${w} aus dem laufenden und dem vorherigen Kalenderjahr, sie rückt also jedes Jahr von selbst weiter. ${SORTIERUNG} Für alle, die wissen wollen, welche ${eins === 'Film' ? 'aktuellen Filme' : 'aktuellen Serien'} man nicht verpassen sollte.`;
    default: return null;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const zi = process.argv.indexOf('--zeige');
  const zeige = zi >= 0 ? Number(process.argv[zi + 1]) || 3 : 0;
  const mi = process.argv.indexOf('--modus');
  const nurModus = mi >= 0 ? process.argv[mi + 1] : null;
  const listen = (await alleBestenlisten(LOCALE)).filter(([, m]) => !nurModus || m === nurModus);
  let neu = 0, vorhanden = 0, uebersprungen = 0, gezeigt = 0;
  for (const [art, modus, wert] of listen) {
    const daten = await ladeBestenliste(art, modus, wert, LOCALE);
    if (!daten || !daten.titel.length) { uebersprungen++; continue; }
    if (daten.text) { vorhanden++; continue; }
    const text = bauText(daten);
    if (!text) { uebersprungen++; continue; }
    if (zeige && gezeigt < zeige && Math.random() < (nurModus ? 0.5 : 0.1)) { gezeigt++; console.log(`\n${art}/${modus}/${wert}:\n${text}`); }
    if (!dryRun) {
      await pool.query(
        `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('bestenliste', $1, $2, $3)
         ON CONFLICT (bereich, schluessel, locale) DO NOTHING`,
        [`${modus}:${wert}:${daten.type}`, LOCALE, text]
      );
    }
    neu++;
  }
  console.log(`\nListen gesamt ${listen.length}: neu ${neu}${dryRun ? ' (Probelauf)' : ''}, schon mit Text ${vorhanden}, uebersprungen ${uebersprungen}`);
  await pool.end();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
