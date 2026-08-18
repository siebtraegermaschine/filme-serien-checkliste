#!/usr/bin/env node
// Erzeugt Titeltexte im Vier-Abschnitte-Format aus den lokalen Metadaten und
// schreibt sie direkt nach seo_content. Ersetzt fuer den Langschwanz das
// handgetriebene Verfahren ueber seo-content-daten.mjs.
//
// QUELLE ist ausschliesslich der Datenbanksatz. Es wird nichts recherchiert und
// nichts aus Modellwissen ergaenzt -- die Faktenregel bleibt hart. Was nicht im
// Satz steht, darf nicht im Text stehen. Zwei Kontrollen greifen:
//   1. hier, mechanisch: Format, Wortzahl, Zahlen und Eigennamen ohne Beleg
//   2. seo-batch-pruefen.mjs: Stichprobe, jede Aussage gegen den Satz geprueft
//
// Aufruf:
//   ANTHROPIC_API_KEY=... node scripts/seo-batch.mjs --limit 20 --dry-run
//   ANTHROPIC_API_KEY=... node scripts/seo-batch.mjs --limit 500 --concurrency 8
//   ANTHROPIC_API_KEY=... node scripts/seo-batch.mjs --locale es-es --limit 500
//
// Optionen:
//   --locale CODE        de-de (Standard), en-us, es-es, fr-fr, it-it, nl-nl, pt-pt
//   --limit N            Hoechstzahl Titel in diesem Lauf (Standard 50)
//   --concurrency N      Gleichzeitige Anfragen (Standard 6)
//   --model NAME         Standard claude-sonnet-5; claude-opus-5 fuer mehr Qualitaet
//   --stufe B|C          B = Plot>250 und >=4 Darsteller (Standard), C = Plot>150 und >=3
//   --min-votes N        Nur Titel ab dieser Stimmenzahl (Standard 0)
//   --dry-run            Nichts schreiben, Texte nur ausgeben
//   --journal PFAD       JSONL-Protokoll (Standard scripts/.seo-batch-journal.jsonl)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';

const MIN_WOERTER = 250;
const MAX_WOERTER = 420;

// --- Sprachen ---------------------------------------------------------------
// Je Sprache: Ueberschriften, Bezeichnung fuer die Ausgabeanweisung und der
// Schluessel in titles.uebersetzungen. Die Regeln selbst stehen nur einmal auf
// Deutsch -- eine Quelle der Wahrheit fuer die Faktenregel, unabhaengig davon,
// in welcher Sprache der Text herauskommt.
export const SPRACHEN = {
  'de-de': { sprache: 'Deutsch', uebKey: null, abschnitte: ['Worum es geht', 'Entstehungsgeschichte', 'Hinter den Kulissen', 'Einordnung & Wirkung'] },
  'en-us': { sprache: 'Englisch', uebKey: 'en', abschnitte: ['What it is about', 'How it came about', 'Behind the scenes', 'Context and impact'] },
  'es-es': { sprache: 'Spanisch', uebKey: 'es', abschnitte: ['De qué trata', 'Cómo surgió', 'Detrás de las cámaras', 'Contexto y repercusión'] },
  'fr-fr': { sprache: 'Franzoesisch', uebKey: 'fr', abschnitte: ['De quoi il s’agit', 'Genèse du projet', 'Dans les coulisses', 'Portée et réception'] },
  'it-it': { sprache: 'Italienisch', uebKey: 'it', abschnitte: ['Di cosa si tratta', 'Come è nato', 'Dietro le quinte', 'Contesto e ricezione'] },
  'nl-nl': { sprache: 'Niederlaendisch', uebKey: 'nl', abschnitte: ['Waar het over gaat', 'Hoe het ontstond', 'Achter de schermen', 'Context en ontvangst'] },
  'pt-pt': { sprache: 'Portugiesisch', uebKey: 'pt', abschnitte: ['Do que se trata', 'Como surgiu', 'Nos bastidores', 'Contexto e repercussão'] },
};

function argumente() {
  const a = process.argv.slice(2);
  const hol = (name, standard) => {
    const i = a.indexOf(`--${name}`);
    return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : standard;
  };
  return {
    locale: hol('locale', 'de-de'),
    limit: Number(hol('limit', '50')),
    concurrency: Number(hol('concurrency', '6')),
    model: hol('model', 'claude-sonnet-5'),
    stufe: hol('stufe', 'B').toUpperCase(),
    minVotes: Number(hol('min-votes', '0')),
    dryRun: a.includes('--dry-run'),
    journal: hol('journal', path.join(import.meta.dirname, '.seo-batch-journal.jsonl')),
  };
}

// --- Kandidaten -------------------------------------------------------------
// Nur Titel mit ausreichenden Metadaten. Fehlt eines der Felder, fehlt dem
// Modell die Grundlage fuer einen belegten Abschnitt -- solche Titel bleiben
// bewusst liegen, statt duenn abgehandelt zu werden.
async function kandidaten({ locale, limit, minVotes, stufe }) {
  const [minPlot, minCast] = stufe === 'C' ? [150, 3] : [250, 4];
  const { rows } = await pool.query(
    `SELECT t.tmdb_id, t.type, t.title, t.original_title, t.title_en, t.year,
            t.genres, t.director, t.cast_names, t.keywords, t.rating,
            t.vote_count, t.plot, t.overview_en, t.certification, t.uebersetzungen
       FROM titles t
      WHERE t.tmdb_id IS NOT NULL
        AND t.plot IS NOT NULL AND length(t.plot) > $4
        AND t.director IS NOT NULL AND t.director <> ''
        AND t.year IS NOT NULL
        AND array_length(t.cast_names, 1) >= $5
        AND array_length(t.genres, 1) >= 1
        AND coalesce(t.vote_count, 0) >= $3
        AND NOT EXISTS (
              SELECT 1 FROM seo_content s
               WHERE s.bereich = 'titel'
                 AND s.schluessel = t.type || ':' || t.tmdb_id
                 AND s.locale = $1)
      ORDER BY t.vote_count DESC NULLS LAST
      LIMIT $2`,
    [locale, limit, minVotes, minPlot, minCast]
  );
  return rows;
}

// --- Datensatz --------------------------------------------------------------
// Quelle fuer die Inhaltsangabe ist die ausfuehrlichste verfuegbare -- in
// welcher Sprache auch immer. Eine Inhaltsangabe auf Spanisch ist keine andere
// Tatsache als dieselbe auf Deutsch: Sie beschreibt denselben Titel, und das
// Modell gibt sie in der Zielsprache wieder. Erfunden wird dadurch nichts.
//
// Das ist kein Detail: Gegenueber der reinen Verwendung des deutschen Plots
// bringt diese Auswahl 3.339 zusaetzliche Titel ueber die Schwelle von 250
// Zeichen. Ohne sie faellt jeder dieser Titel aus dem Verfahren heraus.
//
// Bei Gleichstand gewinnt die Zielsprache, dann Deutsch, dann Englisch --
// je naeher die Quelle an der Zielsprache liegt, desto weniger geht verloren.
const UEB_SPRACHEN = ['es', 'fr', 'it', 'nl', 'pt', 'en'];

// Fragment = endet auf Auslassungspunkte oder ganz ohne schliessendes Zeichen.
// Beides kommt bei TMDB haeufig vor und ist dort kein Importfehler, sondern
// Schreibstil der jeweiligen Gemeinschaft (Beleg: plot-quellen-pruefen.mjs).
// Fuer uns bleibt es trotzdem eine schlechtere Quelle: Wo der Text abbricht,
// fehlen Tatsachen, und die Faktenregel verbietet es, sie zu ergaenzen.
export const istFragment = (s) => !!s && (/(\.\.\.|…)\s*$/.test(s) || !/[.!?…")»']\s*$/.test(s));

export function inhaltsangabe(t, locale) {
  const zielKey = SPRACHEN[locale]?.uebKey;
  const kandidaten = [];
  if (zielKey && t.uebersetzungen?.[zielKey]?.ov) kandidaten.push({ text: t.uebersetzungen[zielKey].ov, rang: 0 });
  if (t.plot) kandidaten.push({ text: t.plot, rang: 1 });
  if (t.overview_en) kandidaten.push({ text: t.overview_en, rang: 2 });
  for (const k of UEB_SPRACHEN) {
    const ov = t.uebersetzungen?.[k]?.ov;
    if (ov && k !== zielKey) kandidaten.push({ text: ov, rang: 3 });
  }
  if (!kandidaten.length) return null;
  // Laenge schlaegt Naehe, aber nur bei deutlichem Vorsprung: eine um die
  // Haelfte laengere Quelle ist die Uebersetzung wert, eine knapp laengere nicht.
  kandidaten.sort((a, b) => (b.text.length - a.text.length) || (a.rang - b.rang));
  const laengste = kandidaten[0];
  const band = kandidaten.filter((k) => k.text.length >= laengste.text.length * 0.67);
  // Innerhalb des Bandes schlaegt Vollstaendigkeit die Sprachnaehe: Eine
  // Uebersetzung kostet nur Naehe, ein abgebrochener Text kostet Tatsachen.
  // Gemessen am Bestand hebt das 3.873 deutsche und 4.824 franzoesische Titel
  // von einem Fragment auf eine vollstaendige Quelle. Gibt es im Band nur
  // Fragmente, bleibt es bei der bisherigen Wahl -- kuerzen tun wir nichts.
  const vollstaendig = band.filter((k) => !istFragment(k.text));
  const nah = (vollstaendig.length ? vollstaendig : band).sort((a, b) => a.rang - b.rang)[0];
  return nah.text;
}

export function datensatz(t, locale) {
  const k = SPRACHEN[locale]?.uebKey;
  const nativerTitel = k && t.uebersetzungen?.[k]?.t;
  const z = [];
  z.push(`Titel (deutsch): ${t.title}`);
  if (nativerTitel && nativerTitel !== t.title) z.push(`Titel in der Zielsprache: ${nativerTitel}`);
  if (t.original_title && t.original_title !== t.title) z.push(`Originaltitel: ${t.original_title}`);
  if (t.title_en && t.title_en !== t.title && t.title_en !== t.original_title) z.push(`Englischer Titel: ${t.title_en}`);
  z.push(`Art: ${t.type === 'movie' ? 'Film' : 'Serie'}`);
  z.push(`Erscheinungsjahr: ${t.year}`);
  z.push(`Regie: ${t.director}`);
  z.push(`Besetzung: ${(t.cast_names || []).slice(0, 8).join(', ')}`);
  z.push(`Genres: ${(t.genres || []).join(', ')}`);
  if ((t.keywords || []).length) z.push(`Schlagwoerter: ${t.keywords.slice(0, 12).join(', ')}`);
  if (t.certification) z.push(`Altersfreigabe: ${t.certification}`);
  if (t.rating != null) z.push(`Durchschnittsbewertung: ${t.rating} von 10`);
  if (t.vote_count != null) z.push(`Abgegebene Stimmen: ${t.vote_count}`);
  z.push(`Inhaltsangabe: ${inhaltsangabe(t, locale)}`);
  return z.join('\n');
}

function systemPrompt(locale) {
  const s = SPRACHEN[locale];
  return `Du schreibst redaktionelle Titeltexte fuer das Filmportal movietaste.de.

AUSGABESPRACHE: ${s.sprache}. Der gesamte Text steht in dieser Sprache, auch dann,
wenn Teile des DATENSATZES in einer anderen Sprache vorliegen.

ABSOLUTE REGEL -- FAKTEN
Der uebergebene DATENSATZ ist deine einzige Quelle. Du darfst NICHTS schreiben, was
nicht daraus hervorgeht. Verboten sind insbesondere:
- Auszeichnungen, Nominierungen, Festivalteilnahmen
- Budget, Einspielergebnis, Zuschauerzahlen, Kinostarts, Streamingzahlen
- Drehorte, Drehzeiten, Produktionsfirmen, Kamera, Musik, Schnitt, Drehbuch
- Zitate von Kritikern oder Publikationen, Wertungen von Bewertungsportalen
- Vorlagen, Fortsetzungen, Neuverfilmungen, Bezuege zu anderen Werken
- Biografisches zu Regie oder Besetzung, Karriereeinordnungen, frueher/spaeter
- Rezeptionsbehauptungen ("gilt als", "wurde gelobt", "Kultfilm", "Klassiker")
Wenn du etwas ueber den Titel zu wissen glaubst, es steht aber nicht im DATENSATZ:
Es kommt nicht in den Text. Lieber ein Satz weniger als eine Behauptung zu viel.

ERLAUBT ist ausschliesslich:
- Was im DATENSATZ steht, in eigenen Worten
- Schluesse, die sich zwingend daraus ergeben: der Abstand zum Erscheinungsjahr,
  was eine Genrekombination bedeutet, wie Bewertung und Stimmenzahl zueinander
  stehen, was die Zusammensetzung der Besetzung ueber die Anlage verraet
- Beobachtungen zur Erzaehlform, die keine Tatsachenbehauptung ueber diesen Titel sind

FORMAT -- exakt diese vier Ueberschriften, in dieser Reihenfolge, keine weiteren:
### ${s.abschnitte[0]}
### ${s.abschnitte[1]}
### ${s.abschnitte[2]}
### ${s.abschnitte[3]}

Keine Aufzaehlungen, keine Fettschrift, keine Zwischenueberschriften. Fliesstext in
kurzen Absaetzen. Insgesamt 280 bis 340 Woerter.

INHALT DER ABSCHNITTE
1. Die Ausgangslage aus der Inhaltsangabe, erzaehlt statt zusammengefasst. Haelt den
   Ausgang zurueck, wenn die Inhaltsangabe ihn verraet.
2. Regie, Erscheinungsjahr, Art des Werks, Besetzung mit den Namen aus dem DATENSATZ,
   Altersfreigabe falls vorhanden. Nur diese Angaben, keine weiteren Gewerke.
3. Was Genrekombination, Schlagwoerter und die Anlage der Geschichte ueber den Titel
   aussagen. Keine Produktionsanekdoten -- die kennst du nicht.
4. Bewertung und Stimmenzahl nuechtern einordnen, den zeitlichen Abstand zum
   Erscheinungsjahr, die Stellung im Genre. Keine erfundene Rezeption.

TON
Sachlich, praezise, ohne Werbesprache. Keine Ausrufezeichen, keine rhetorischen Fragen
an das Publikum, kein "Fans von X werden Y lieben". Bei heiklen Stoffen -- reale Opfer,
Gewalt, Krankheit, Verbrechen -- nuechtern und respektvoll bleiben, ohne zu beschoenigen.

Gib ausschliesslich den Text aus, ohne Vorrede und ohne Nachbemerkung.`;
}

// --- API --------------------------------------------------------------------
// Der System-Prompt ist bei jedem Aufruf identisch und macht den groesseren
// Teil der Eingabe aus. Als zwischengespeicherter Block wird er nur einmal
// berechnet und danach zum Bruchteil gelesen -- bei zehntausenden Aufrufen ist
// das der groesste Kostenhebel ueberhaupt.
//
// Der Cache lebt wenige Minuten und wird durch jeden Aufruf verlaengert. Bei
// durchgehendem Betrieb bleibt er also warm; nur der allererste Aufruf und
// laengere Pausen zahlen den vollen Preis.
function anfrageKoerper(model, locale, t) {
  return {
    model,
    max_tokens: 1600,
    system: [{ type: 'text', text: systemPrompt(locale), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `DATENSATZ\n${datensatz(t, locale)}\n\nSchreibe den Titeltext.` }],
  };
}

// Laufende Summe des Verbrauchs, damit am Ende belastbare Zahlen stehen statt
// Schaetzungen -- und damit sichtbar wird, ob der Cache tatsaechlich greift.
export const verbrauch = { eingabe: 0, cacheGeschrieben: 0, cacheGelesen: 0, ausgabe: 0, aufrufe: 0 };

async function erzeugen({ apiKey, model, t, locale }) {
  const body = anfrageKoerper(model, locale, t);
  for (let versuch = 1; versuch <= 5; versuch++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j = await res.json();
      const u = j.usage || {};
      verbrauch.eingabe += u.input_tokens || 0;
      verbrauch.cacheGeschrieben += u.cache_creation_input_tokens || 0;
      verbrauch.cacheGelesen += u.cache_read_input_tokens || 0;
      verbrauch.ausgabe += u.output_tokens || 0;
      verbrauch.aufrufe++;
      return j.content.map((c) => c.text || '').join('').trim();
    }
    if (![429, 500, 502, 503, 529].includes(res.status)) {
      throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, Math.min(60000, 2000 * 2 ** (versuch - 1))));
  }
  throw new Error('API nach 5 Versuchen nicht erreichbar');
}

// --- Formatpruefung ---------------------------------------------------------
// Dieselben Regeln wie seo-texte-anhaengen.mjs, damit beide Wege dasselbe liefern.
export function formatFehler(text, locale) {
  const soll = SPRACHEN[locale].abschnitte;
  const fehler = [];
  const ueberschriften = [...text.matchAll(/^#{1,6}\s*(.+)$/gm)].map((m) => m[1].trim());
  if (ueberschriften.length !== 4 || ueberschriften.some((u, i) => u !== soll[i])) {
    fehler.push(`Ueberschriften falsch: ${JSON.stringify(ueberschriften)}`);
  }
  const woerter = text.replace(/^#{1,6}.*$/gm, '').split(/\s+/).filter(Boolean).length;
  if (woerter < MIN_WOERTER) fehler.push(`zu kurz: ${woerter} Woerter`);
  if (woerter > MAX_WOERTER) fehler.push(`zu lang: ${woerter} Woerter`);
  if (/^\s*[-*•]\s/m.test(text)) fehler.push('Aufzaehlung enthalten');
  if (/\*\*/.test(text)) fehler.push('Fettschrift enthalten');
  return fehler;
}

// --- Mechanische Faktenpruefung --------------------------------------------
// Faengt die haeufigste Sorte erfundener Angaben deterministisch ab, bevor die
// LLM-Pruefstufe laeuft: Zahlen und Eigennamen, die im Datensatz nicht vorkommen,
// sowie Formulierungen, die fast immer eine unbelegte Behauptung einleiten.
// Formulierungen, die fast immer eine unbelegte Behauptung einleiten.
//
// Die Muster mussten enger gefasst werden, nachdem ein Probelauf an 48 echten
// Texten zwei Fehlalarme erzeugte: "300 Millionen Dollar" war der Auftragswert
// aus der Inhaltsangabe, nicht das Einspielergebnis, und "Fortsetzung des
// Kampfes" meinte keine Filmfortsetzung. Ein blosses Stichwort genuegt also
// nicht -- geprueft wird die Wendung, in der es eine Tatsache ueber das Werk
// behauptet.
const MUSTER = [
  [/\b(gewann (?:den|einen|die)|wurde ausgezeichnet|(?:war |wurde )?nominiert|Oscar|Golden Globe|Goldene[nr]? (?:Palme|Bär|Himbeere)|César|Emmy|BAFTA|won (?:the|an)|nominated for)\b/i, 'Auszeichnung'],
  [/\b(Einspielergebnis|spielte[^.]{0,40}\bein\b|Herstellungskosten|Budget von|Produktionskosten|Kinokasse|box office|grossed)\b/i, 'Geschaeftszahl'],
  [/\b(gedreht (?:wurde|in|von)|Drehort|Dreharbeiten|Produktionsfirma|Studio[s]? (?:von|in)|filmed in|shot in)\b/i, 'Produktionsangabe'],
  [/\b(Kritiker|Rezension|Rotten Tomatoes|Metacritic|IMDb|Lexikon des internationalen Films|CinemaScore)\b/i, 'Rezeption'],
  [/\b(basiert auf (?:dem|einem|der)|Neuverfilmung|Remake|Fortsetzung (?:von|des Films|der Reihe|zu)\b|Vorlage (?:ist|war|bildet)|nach (?:dem|einem) (?:Roman|Buch|Comic|Theaterstück)|based on the)\b/i, 'Werkbezug'],
];

// Woerter, die ein Gewerk oder eine Rolle einleiten. Nur DIREKT dahinter wird
// nach Namen gesucht -- eine generische Suche nach grossgeschriebenen
// Wortpaaren ist im Deutschen unbrauchbar, weil dort jedes Substantiv gross
// geschrieben wird ("Die Altersfreigabe", "Genres Action"). Ein erster
// Versuch damit meldete 36 von 36 Texten als verdaechtig, also ausnahmslos
// falsch. Eine Pruefung, die immer anschlaegt, ist schlechter als keine:
// Sie erzieht dazu, sie zu ignorieren.
//
// Was hier stattdessen geprueft wird, ist der tatsaechliche Fehlerfall --
// eine Person, die als Beteiligte genannt wird, ohne im Datensatz zu stehen.
const NAME_TEIL = '[A-ZÄÖÜÁÉÍÓÚÀÈÌÒÙÇ][\\p{L}\'’-]*(?:\\.[\\p{L}\'’-]+)*';
const NAMENSKONTEXT = new RegExp(
  '(?:Regie(?:\\s+f[üu]hrte[n]?)?|inszeniert(?:e)?\\s+von|gespielt\\s+von|verk[öo]rpert\\s+von|' +
  'gesprochen\\s+von|Drehbuch(?:\\s+von)?|geschrieben\\s+von|Musik\\s+von|Kamera(?:\\s+von)?|' +
  'Schnitt\\s+von|produziert\\s+von|Produktion\\s+von|nach\\s+(?:einem\\s+)?(?:Roman|Buch|Vorlage)\\s+von|' +
  'directed\\s+by|written\\s+by|starring|dirigid[ao]\\s+por|r[éa]alis[ée]\\s+par)' +
  // Ein Punkt gehoert nur dann zum Namen, wenn unmittelbar ein Buchstabe folgt
  // ("J.R.R.", "Jr."). Ein Punkt vor einem Leerzeichen beendet den Satz -- ohne
  // diese Unterscheidung verschluckt der Ausdruck das erste Wort des naechsten
  // Satzes ("Brett Ratner. Die") und meldet den belegten Namen als erfunden.
  '[:\\s]+(' + NAME_TEIL + '(?:\\s+' + NAME_TEIL + '){1,3})',
  'gu'
);

// Vergleicht einen Text gegen eine Quelle. Getrennt von faktenVerdacht(),
// damit die Pruefung auch gegen einen fertig gerenderten Datensatz laufen kann
// -- so laesst sie sich ohne Datenbank an echten Texten nachmessen.
export function pruefeGegenQuelle(text, quellText, kennzahlen = {}) {
  const quelle = quellText.toLowerCase();
  const verdacht = [];
  const { year, rating, voteCount, castCount, genreCount } = kennzahlen;

  // Zahlen: jede Zahl im Text muss in der Quelle vorkommen oder sich zwingend
  // daraus errechnen. Deutsche Texte schreiben "8,7", der Datensatz "8.7" --
  // ohne diese Angleichung meldet die Pruefung jede Bewertung als erfunden.
  const norm = (s) => s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const jetzt = new Date().getFullYear();
  // Der Jahresabstand darf um eins abweichen: "gut 15 Jahre" bei rechnerisch
  // 16 ist normales Runden in Fliesstext, keine erfundene Zahl.
  const abstand = year ? jetzt - year : null;
  const erlaubt = new Set([year, rating, voteCount, jetzt,
    abstand, abstand != null ? abstand - 1 : null, abstand != null ? abstand + 1 : null,
    year ? Math.floor(year / 10) * 10 : null, castCount, genreCount, 10]
    .filter((x) => x != null).map((x) => norm(String(x))));
  const quelleZahlen = new Set([...quelle.matchAll(/\d[\d.,]*/g)].map((m) => norm(m[0].replace(/[.,]$/, ''))));
  for (const m of text.matchAll(/\b\d[\d.,]*\b/g)) {
    const z = norm(m[0].replace(/[.,]$/, ''));
    if (erlaubt.has(z) || quelleZahlen.has(z)) continue;
    verdacht.push(`Zahl ohne Beleg: ${m[0]}`);
  }

  // Namen, die als Beteiligte genannt werden, ohne in der Quelle zu stehen.
  for (const m of text.matchAll(NAMENSKONTEXT)) {
    const name = m[1].trim();
    // Auch Teiltreffer zaehlen: "Ryan Gosling" gilt als belegt, wenn die
    // Quelle den Namen enthaelt, selbst wenn der Text ihn anders einbettet.
    if (quelle.includes(name.toLowerCase())) continue;
    // Einzelne Bestandteile pruefen -- "Phil Lord" ist belegt, wenn die Quelle
    // "Phil Lord" fuehrt; "Phil Lord und Chris Miller" faellt sonst durch.
    const teile = name.split(/\s+/).filter((w) => w.length > 2);
    if (teile.length && teile.every((w) => quelle.includes(w.toLowerCase()))) continue;
    verdacht.push(`Beteiligte(r) ohne Beleg: ${name}`);
  }

  for (const [re, was] of MUSTER) {
    const treffer = text.match(re);
    if (treffer && !quelle.includes(treffer[0].toLowerCase())) verdacht.push(`${was}: „${treffer[0]}“`);
  }
  return [...new Set(verdacht)];
}

export function faktenVerdacht(text, t, locale) {
  const quelle = datensatz(t, locale) + ' ' + (t.plot || '') + ' ' + (t.overview_en || '');
  return pruefeGegenQuelle(text, quelle, {
    year: t.year, rating: t.rating, voteCount: t.vote_count,
    castCount: (t.cast_names || []).length, genreCount: (t.genres || []).length,
  });
}

// --- Ablauf -----------------------------------------------------------------
async function main() {
  const opt = argumente();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!SPRACHEN[opt.locale]) {
    console.error(`Unbekannte Sprache ${opt.locale}. Bekannt: ${Object.keys(SPRACHEN).join(', ')}`);
    process.exit(1);
  }
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY fehlt. Setze ihn in der Umgebung oder in backend/.env.');
    process.exit(1);
  }

  const liste = await kandidaten(opt);
  console.log(`${liste.length} Kandidaten · Sprache ${opt.locale} · Stufe ${opt.stufe} · Modell ${opt.model} · ${opt.concurrency} gleichzeitig`);
  if (!liste.length) { await pool.end(); return; }

  const protokoll = fs.createWriteStream(opt.journal, { flags: 'a' });
  const zaehler = { ok: 0, format: 0, fakten: 0, fehler: 0 };
  const begonnen = Date.now();
  let naechster = 0;

  async function arbeiter() {
    for (;;) {
      const i = naechster++;
      if (i >= liste.length) return;
      const t = liste[i];
      const schluessel = `${t.type}:${t.tmdb_id}`;
      try {
        const text = await erzeugen({ apiKey, model: opt.model, t, locale: opt.locale });
        const ff = formatFehler(text, opt.locale);
        const fv = faktenVerdacht(text, t, opt.locale);
        const basis = { schluessel, titel: t.title, jahr: t.year, locale: opt.locale, formatFehler: ff, faktenVerdacht: fv };

        if (ff.length) { zaehler.format++; protokoll.write(JSON.stringify({ ...basis, status: 'format', text }) + '\n'); continue; }
        if (fv.length) { zaehler.fakten++; protokoll.write(JSON.stringify({ ...basis, status: 'fakten', text }) + '\n'); continue; }

        if (opt.dryRun) {
          console.log(`\n----- ${schluessel} · ${t.title} (${t.year}) -----\n${text}`);
        } else {
          await pool.query(
            `INSERT INTO seo_content (bereich, schluessel, locale, text)
             VALUES ('titel', $1, $2, $3)
             ON CONFLICT (bereich, schluessel, locale) DO UPDATE
               SET text = EXCLUDED.text, aktualisiert_am = now()`,
            [schluessel, opt.locale, text]
          );
        }
        zaehler.ok++;
        protokoll.write(JSON.stringify({ ...basis, status: 'ok' }) + '\n');
      } catch (e) {
        zaehler.fehler++;
        protokoll.write(JSON.stringify({ schluessel, locale: opt.locale, status: 'fehler', meldung: String(e).slice(0, 300) }) + '\n');
      }
      const fertig = zaehler.ok + zaehler.format + zaehler.fakten + zaehler.fehler;
      if (fertig % 25 === 0) {
        const proStunde = Math.round((fertig / ((Date.now() - begonnen) / 1000)) * 3600);
        console.log(`  ${fertig}/${liste.length} · ${zaehler.ok} ok · ${zaehler.format} Format · ${zaehler.fakten} Faktenverdacht · ${zaehler.fehler} Fehler · ~${proStunde}/h`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, opt.concurrency) }, arbeiter));
  protokoll.end();
  const dauer = Math.round((Date.now() - begonnen) / 1000);
  console.log(`\nFertig in ${dauer}s: ${zaehler.ok} geschrieben, ${zaehler.format} Formatfehler, ${zaehler.fakten} Faktenverdacht, ${zaehler.fehler} Fehler.`);
  console.log(`Durchsatz: ~${Math.round((zaehler.ok / dauer) * 3600)} Texte/h · Protokoll: ${opt.journal}`);
  if (zaehler.fakten) console.log('Faktenverdacht = verworfen und protokolliert, nicht geschrieben.');

  // Gemessener Verbrauch statt Schaetzung -- die Grundlage fuer jede
  // Hochrechnung auf den vollen Katalog.
  if (verbrauch.aufrufe) {
    const v = verbrauch, n = v.aufrufe;
    const eingabeGesamt = v.eingabe + v.cacheGeschrieben + v.cacheGelesen;
    const cacheAnteil = eingabeGesamt ? Math.round((v.cacheGelesen / eingabeGesamt) * 100) : 0;
    console.log(`\nVerbrauch ueber ${n} Aufrufe:`);
    console.log(`  Eingabe voll berechnet   ${v.eingabe.toLocaleString('de-DE')} (${Math.round(v.eingabe / n)}/Aufruf)`);
    console.log(`  Cache geschrieben        ${v.cacheGeschrieben.toLocaleString('de-DE')}`);
    console.log(`  Cache gelesen            ${v.cacheGelesen.toLocaleString('de-DE')} (${Math.round(v.cacheGelesen / n)}/Aufruf, ${cacheAnteil} % der Eingabe)`);
    console.log(`  Ausgabe                  ${v.ausgabe.toLocaleString('de-DE')} (${Math.round(v.ausgabe / n)}/Aufruf)`);
    const je = (eingabeGesamt + v.ausgabe) / n;
    console.log(`\nHochrechnung: ${Math.round(je).toLocaleString('de-DE')} Token je Text.`);
    for (const ziel of [1000, 18400]) {
      console.log(`  ${ziel.toLocaleString('de-DE')} Texte  ->  ` +
        `${Math.round((v.eingabe / n) * ziel).toLocaleString('de-DE')} Eingabe voll · ` +
        `${Math.round((v.cacheGelesen / n) * ziel).toLocaleString('de-DE')} Cache · ` +
        `${Math.round((v.ausgabe / n) * ziel).toLocaleString('de-DE')} Ausgabe`);
    }
    console.log('Preise je Million Token stehen in der Anthropic-Konsole; Cache-Lesen ist ein Bruchteil der vollen Eingabe.');
  }
  await pool.end();
}

if (import.meta.filename === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
