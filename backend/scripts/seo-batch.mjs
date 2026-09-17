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
// Laeuft ueber die Message-Batches-API (50 % Rabatt gegenueber Einzelaufrufen,
// kombiniert mit gecachtem Systemprompt). Ein Lauf verarbeitet die Kandidaten
// in Chunks: je Chunk ein Batch anlegen, auf "ended" pollen, Ergebnisse holen,
// pruefen, schreiben. Fortschritt und laufende Kosten stehen in einer
// Statusdatei -- bricht der Prozess ab, nimmt ein Neustart beim offenen Batch
// wieder auf, statt ihn doppelt anzulegen.
//
// "Hoechstens einmal neu erzeugen" (Christian, 17.09.2026): Innerhalb EINES
// Laufs (einer Statusdatei) wird jeder Kandidat genau einmal versucht --
// verworfene Texte tauchen im selben Lauf nicht wieder auf, auch wenn sie noch
// nicht in seo_content stehen. Ein bewusster zweiter Versuch fuer die
// Verwerfungen ist ein zweiter Aufruf mit neuer --status-datei (oder die alte
// loeschen): Erfolge bleiben durch seo_content ausgeschlossen, nur die
// Verwerfungen werden dann erneut versucht.
//
// Aufruf:
//   ANTHROPIC_API_KEY=... node scripts/seo-batch.mjs --limit 50 --dry-run
//   ANTHROPIC_API_KEY=... node scripts/seo-batch.mjs --limit 500 --chunk-groesse 250
//   ANTHROPIC_API_KEY=... node scripts/seo-batch.mjs --max-kosten 120
//
// Optionen:
//   --locale CODE        de-de (Standard), en-us, es-es, fr-fr, it-it, nl-nl, pt-pt
//   --limit N            Hoechstzahl Titel insgesamt (Standard: alle offenen)
//   --chunk-groesse N    Titel je Batch (Standard 1000)
//   --intervall N        Sekunden zwischen Status-Abfragen (Standard 30)
//   --model NAME         Standard claude-sonnet-5; claude-opus-5 fuer mehr Qualitaet
//   --stufe B|C          B = Plot>250 und >=4 Darsteller (Standard), C = Plot>150 und >=3
//   --min-votes N        Nur Titel ab dieser Stimmenzahl (Standard 0)
//   --max-kosten ZAHL    Harte Obergrenze in Dollar echter Kosten (Standard 120)
//   --dry-run            Nichts nach seo_content schreiben, Texte nur ausgeben
//   --journal PFAD        JSONL-Protokoll je Text (Standard scripts/.seo-batch-journal.jsonl)
//   --status-datei PFAD  Lauf-Status: offener Batch, Kosten bisher, Versuchte (Standard scripts/.seo-batch-lauf.json)
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
    limit: Number(hol('limit', Infinity)),
    chunkGroesse: Number(hol('chunk-groesse', '1000')),
    intervall: Number(hol('intervall', '30')),
    model: hol('model', 'claude-sonnet-5'),
    stufe: hol('stufe', 'B').toUpperCase(),
    minVotes: Number(hol('min-votes', '0')),
    maxKosten: Number(hol('max-kosten', '120')),
    dryRun: a.includes('--dry-run'),
    journal: hol('journal', path.join(import.meta.dirname, '.seo-batch-journal.jsonl')),
    statusDatei: hol('status-datei', path.join(import.meta.dirname, '.seo-batch-lauf.json')),
  };
}

// --- Kandidaten -------------------------------------------------------------
// Nur Titel mit ausreichenden Metadaten. Fehlt eines der Felder, fehlt dem
// Modell die Grundlage fuer einen belegten Abschnitt -- solche Titel bleiben
// bewusst liegen, statt duenn abgehandelt zu werden.
//
// `ausschluss` sind Schluessel, die in DIESEM Lauf schon versucht wurden (egal
// ob erfolgreich) -- siehe Kopfkommentar zu "hoechstens einmal neu erzeugen".
// Erfolge stehen zusaetzlich in seo_content und sind damit ueber Laeufe hinweg
// ausgeschlossen; Verwerfungen nur innerhalb des laufenden `ausschluss`.
async function kandidaten({ locale, limit, minVotes, stufe, ausschluss }) {
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
        AND NOT (t.type || ':' || t.tmdb_id = ANY($6::text[]))
      ORDER BY t.vote_count DESC NULLS LAST
      LIMIT $2`,
    [locale, limit, minVotes, minPlot, minCast, [...ausschluss]]
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
  // Bei Serien steht in director die Idee/Entwicklung (TMDB created_by), nicht die Regie --
  // bis 17.09.2026 hiess es auch hier "Regie", und 344 Serientexte schrieben "Regie führte".
  z.push(t.type === 'series' ? `Entwickelt von (Idee, nicht Regie): ${t.director}` : `Regie: ${t.director}`);
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

WIEDERKEHRENDE ANGABEN VARIIEREN
Alle Texte nennen dieselben Arten von Angaben -- Regie, Jahr, Freigabe, Bewertung.
Formuliere sie unterschiedlich und baue sie in den Satz ein, statt sie aufzuzaehlen;
nicht jeder Text muss sie im selben Satzbau oder an derselben Stelle bringen.

QUELLE NICHT ERWAEHNEN
Der Text steht auf einer oeffentlichen Seite, die Leser kennen keinen "Datensatz"
und keine "Inhaltsangabe". Schreibe nie "der Datensatz nennt", "im Datensatz
verzeichnet", "laut Inhaltsangabe" oder Aehnliches -- auch nicht "nicht
hinterlegt/verzeichnet/angegeben/vermerkt/ausgewiesen" fuer eine fehlende Angabe.
Nenne die Angabe direkt, oder lass sie weg, statt ihr Fehlen zu kommentieren.

ZEIT- UND EPOCHENANGABEN
Nenne Epochen so, wie der DATENSATZ sie nennt (z. B. "viktorianisch"), rechne sie
nicht in Jahrhunderte um -- die Umrechnung faellt durch die Pruefung, weil die
Jahreszahl im DATENSATZ so nicht vorkommt. Abstaende zur Gegenwart nur mit der
genauen Differenz aus laufendem Jahr minus Erscheinungsjahr, nicht gerundet
("mehr als 35 Jahre").

STIMMENZAHL NICHT BEZIFFERN
Die Zahl der abgegebenen Stimmen aendert sich taeglich -- ein Text, der sie nennt,
ist damit oft schon nach einer Nacht falsch. Nenne deshalb nie die genaue
Stimmenzahl, sondern ordne sie ein ("eine noch schmale Bewertungsbasis", "ein
Publikum im vierstelligen Bereich"). Die Durchschnittsbewertung selbst darfst du
nennen, im Deutschen mit Komma (7,4 statt 7.4).

LAENGE MIT PUFFER
Ziel sind 290 bis 330 Woerter, nicht die Untergrenze von 280 -- wer knapp darueber
schreibt, rutscht beim Nachschaerfen leicht darunter und faellt durch die Pruefung.

Gib ausschliesslich den Text aus, ohne Vorrede und ohne Nachbemerkung.`;
}

// --- Preise -------------------------------------------------------------
// Stand 17.09.2026, https://platform.claude.com/docs/en/about-claude/pricing
// (Sonnet-5-Einfuehrungspreis ist inzwischen der Standardpreis). Batch-Rabatt
// ist durchgaengig 50 % auf jede Spalte -- deshalb hier nur die Basispreise
// je Modell und die Halbierung an einer Stelle in kostenBerechnen().
// 1h-Cache-Schreiben, weil ein Batch laenger laufen kann als die 5-Minuten-
// Standarddauer (Empfehlung der Anthropic-Doku fuer die Batch-API).
export const PREISE = {
  'claude-sonnet-5': { eingabe: 2, cacheSchreiben1h: 4, cacheLesen: 0.20, ausgabe: 10 },
  'claude-opus-5': { eingabe: 5, cacheSchreiben1h: 10, cacheLesen: 0.50, ausgabe: 25 },
  'claude-haiku-4-5-20251001': { eingabe: 1, cacheSchreiben1h: 2, cacheLesen: 0.10, ausgabe: 5 },
};

// Kosten eines einzelnen Aufrufs in Dollar, aus dem gemessenen `usage`-Objekt
// der API-Antwort. Rein rechnerisch, ohne Netzwerk/DB -- so laesst es sich
// gegen bekannte Betraege testen.
export function kostenBerechnen(usage, model) {
  const p = PREISE[model];
  if (!p) throw new Error(`Keine Preise fuer Modell ${model} hinterlegt.`);
  const u = usage || {};
  const dollar =
    (u.input_tokens || 0) * p.eingabe +
    (u.cache_creation_input_tokens || 0) * p.cacheSchreiben1h +
    (u.cache_read_input_tokens || 0) * p.cacheLesen +
    (u.output_tokens || 0) * p.ausgabe;
  // Batch-Rabatt: 50 % auf alle vier Spalten (Anthropic-Doku, "Batch processing").
  return (dollar / 2) / 1_000_000;
}

// --- custom_id ----------------------------------------------------------
// Die Batches-API erlaubt in custom_id nur [a-zA-Z0-9_-], unser Schluessel
// ("movie:12345") enthaelt aber einen Doppelpunkt. type ("movie"/"series")
// und tmdb_id (rein numerisch) enthalten selbst nie einen Bindestrich, der
// Rueckweg ist also eindeutig.
export function customId(schluessel) {
  return schluessel.replace(':', '-');
}
export function schluesselAusCustomId(id) {
  const i = id.indexOf('-');
  return i < 0 ? id : `${id.slice(0, i)}:${id.slice(i + 1)}`;
}

// --- Batches-API ----------------------------------------------------------
// Der System-Prompt ist bei jedem Aufruf identisch und macht den groesseren
// Teil der Eingabe aus. Als zwischengespeicherter Block wird er nur einmal
// berechnet und danach zum Bruchteil gelesen -- bei zehntausenden Aufrufen ist
// das der groesste Kostenhebel ueberhaupt, kombiniert mit dem Batch-Rabatt.
// Sonnet 5 denkt ohne Angabe standardmaessig mit "effort: high" -- bei einem
// Diagnoselauf hat das bei 3 von 10 Titeln das ganze max_tokens-Budget fuer
// unsichtbares Denken verbraucht, bevor ueberhaupt Text entstand (stop_reason
// "max_tokens", leerer Text). Diese Aufgabe ist eine reine, deterministische
// Umformung ohne Ermessensspielraum -- "low" ist laut Anthropic-Doku genau fuer
// hochvolumige, einfache Aufgaben gedacht und macht den Lauf schneller,
// guenstiger und vor allem verlaesslich (Christian, 17.09.2026).
function anfrageKoerper(model, locale, t) {
  return {
    model,
    max_tokens: 2048,
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: systemPrompt(locale), cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: `DATENSATZ\n${datensatz(t, locale)}\n\nSchreibe den Titeltext.` }],
  };
}

async function mitWiederholung(aufruf, versuche = 5) {
  for (let versuch = 1; versuch <= versuche; versuch++) {
    const res = await aufruf();
    if (res.ok) return res;
    if (![429, 500, 502, 503, 529].includes(res.status)) {
      throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, Math.min(60000, 2000 * 2 ** (versuch - 1))));
  }
  throw new Error(`API nach ${versuche} Versuchen nicht erreichbar`);
}

async function batchAnlegen({ apiKey, model, locale, liste }) {
  const requests = liste.map((t) => ({
    custom_id: customId(`${t.type}:${t.tmdb_id}`),
    params: anfrageKoerper(model, locale, t),
  }));
  const res = await mitWiederholung(() =>
    fetch('https://api.anthropic.com/v1/messages/batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ requests }),
    })
  );
  return res.json();
}

async function batchStatus({ apiKey, id }) {
  const res = await mitWiederholung(() =>
    fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    })
  );
  return res.json();
}

async function batchWartenBisEnde({ apiKey, id, intervall }) {
  for (;;) {
    const status = await batchStatus({ apiKey, id });
    if (status.processing_status === 'ended') return status;
    const c = status.request_counts || {};
    console.log(`  Batch ${id}: ${status.processing_status} -- verarbeitet ${c.processing ?? '?'}, fertig ${c.succeeded ?? 0}, Fehler ${c.errored ?? 0}`);
    await new Promise((r) => setTimeout(r, intervall * 1000));
  }
}

// JSONL-Ergebnisdatei zeilenweise lesen. Getrennt vom HTTP-Aufruf, damit sich
// das Parsen ohne Netzwerk testen laesst.
export function ergebnisZeilenLesen(text) {
  return text.split('\n').filter((z) => z.trim()).map((z) => JSON.parse(z));
}

async function batchErgebnisse({ apiKey, resultsUrl }) {
  const res = await mitWiederholung(() =>
    fetch(resultsUrl, { headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } })
  );
  return ergebnisZeilenLesen(await res.text());
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
  '(?:Regie(?:\\s+f[üu]hrte[n]?)?|inszeniert(?:e)?\\s+von|(?:entwickelt|erdacht|erfunden|geschaffen|kreiert)\\s+von|Idee\\s+von|gespielt\\s+von|verk[öo]rpert\\s+von|' +
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

// Deutsche Texte setzen Namen in den Genitiv: "die Regie David Lynchs". Die
// Quelle fuehrt "David Lynch". Ohne diese Angleichung meldet die Pruefung den
// belegten Namen als erfunden. Gestrichen wird nur ein angehaengtes s an einem
// Wort ab vier Zeichen -- kurz genug, dass kein anderer Name dadurch passt.
function steht(wort, quelle) {
  const w = wort.toLowerCase();
  if (quelle.includes(w)) return true;
  const ohneGenitiv = w.replace(/(\w{3,})[’']?s\b/gu, "$1");
  return ohneGenitiv !== w && quelle.includes(ohneGenitiv);
}

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
    if (steht(name, quelle)) continue;
    // Einzelne Bestandteile pruefen -- "Phil Lord" ist belegt, wenn die Quelle
    // "Phil Lord" fuehrt; "Phil Lord und Chris Miller" faellt sonst durch.
    const teile = name.split(/\s+/).filter((w) => w.length > 2);
    if (teile.length && teile.every((w) => steht(w, quelle))) continue;
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

// --- Statusdatei ------------------------------------------------------------
// Traegt den Lauf ueber Neustarts hinweg: Kosten und Versuche bisher, und --
// falls beim Absturz ein Batch offen war -- dessen ID samt Kandidaten, damit
// ein Neustart ihn zu Ende bringt statt ihn doppelt anzulegen (doppelt bezahlt).
export function statusLesen(pfad) {
  const leer = { ausgegeben: 0, aufrufe: 0, texte: 0, versucht: [], aktuellerBatch: null };
  // Leere Datei (z. B. beim Vor-Anlegen eines Bind-Mounts per `touch`) zaehlt
  // wie "noch kein Status" -- sonst bricht der Lauf beim JSON.parse ab.
  if (!fs.existsSync(pfad) || !fs.readFileSync(pfad, 'utf8').trim()) return leer;
  return JSON.parse(fs.readFileSync(pfad, 'utf8'));
}
function statusSchreiben(pfad, status) {
  fs.writeFileSync(pfad, JSON.stringify(status, null, 2));
}

// --- Ein Chunk: Batch anlegen, abwarten, Ergebnisse pruefen und schreiben --
async function chunkVerarbeiten({ apiKey, opt, liste, protokoll, zaehler, status }) {
  let batchId = status.aktuellerBatch?.id;
  if (!batchId) {
    const batch = await batchAnlegen({ apiKey, model: opt.model, locale: opt.locale, liste });
    batchId = batch.id;
    status.aktuellerBatch = { id: batchId, schluessel: liste.map((t) => `${t.type}:${t.tmdb_id}`), eingereichtAm: new Date().toISOString() };
    statusSchreiben(opt.statusDatei, status);
    console.log(`  Batch angelegt: ${batchId} (${liste.length} Titel)`);
  } else {
    console.log(`  Nehme offenen Batch wieder auf: ${batchId}`);
  }

  const ended = await batchWartenBisEnde({ apiKey, id: batchId, intervall: opt.intervall });
  const zeilen = await batchErgebnisse({ apiKey, resultsUrl: ended.results_url });
  const nachSchluessel = new Map(liste.map((t) => [`${t.type}:${t.tmdb_id}`, t]));

  let beispieleGezeigt = 0;
  let kostenChunk = 0;
  for (const zeile of zeilen) {
    const schluessel = schluesselAusCustomId(zeile.custom_id);
    const t = nachSchluessel.get(schluessel);
    status.versucht.push(schluessel);

    if (zeile.result.type !== 'succeeded') {
      zaehler.fehler++;
      protokoll.write(JSON.stringify({ schluessel, locale: opt.locale, status: 'fehler', meldung: zeile.result.type, detail: zeile.result.error?.error?.message }) + '\n');
      continue;
    }

    const nachricht = zeile.result.message;
    const usage = nachricht.usage || {};
    const kosten = kostenBerechnen(usage, opt.model);
    kostenChunk += kosten;
    status.ausgegeben += kosten;
    status.aufrufe++;

    const text = (nachricht.content || []).map((c) => c.text || '').join('').trim();
    const ff = formatFehler(text, opt.locale);
    const fv = faktenVerdacht(text, t, opt.locale);
    const basis = { schluessel, titel: t.title, jahr: t.year, locale: opt.locale, formatFehler: ff, faktenVerdacht: fv };

    if (ff.length) { zaehler.format++; protokoll.write(JSON.stringify({ ...basis, status: 'format', text }) + '\n'); continue; }
    if (fv.length) { zaehler.fakten++; protokoll.write(JSON.stringify({ ...basis, status: 'fakten', text }) + '\n'); continue; }

    status.texte++;
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
      // Drei Beispiele je Chunk zeigen, auch ausserhalb von --dry-run -- fuer
      // den Probelauf und als laufende Stichprobe im Hauptlauf.
      if (beispieleGezeigt < 3) {
        beispieleGezeigt++;
        console.log(`\n----- Beispiel ${schluessel} · ${t.title} (${t.year}) -----\n${text}`);
      }
    }
    zaehler.ok++;
    protokoll.write(JSON.stringify({ ...basis, status: 'ok' }) + '\n');
  }

  status.aktuellerBatch = null;
  statusSchreiben(opt.statusDatei, status);
  console.log(`  Chunk fertig: ${zeilen.length} Ergebnisse, ${kostenChunk.toFixed(2)} $ echte Kosten (gesamt bisher ${status.ausgegeben.toFixed(2)} $).`);
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
  if (!PREISE[opt.model]) {
    console.error(`Keine Preise fuer Modell ${opt.model} hinterlegt (siehe PREISE) -- ohne Preise kein verlaesslicher Kostenabbruch.`);
    process.exit(1);
  }

  const status = statusLesen(opt.statusDatei);
  const protokoll = fs.createWriteStream(opt.journal, { flags: 'a' });
  const zaehler = { ok: 0, format: 0, fakten: 0, fehler: 0 };
  const begonnen = Date.now();

  console.log(`Sprache ${opt.locale} · Stufe ${opt.stufe} · Modell ${opt.model} · Chunk-Groesse ${opt.chunkGroesse} · Obergrenze ${opt.maxKosten} $`);
  if (status.ausgegeben) console.log(`Fortsetzung eines Laufs: ${status.ausgegeben.toFixed(2)} $ bereits ausgegeben, ${status.texte} Texte bisher.`);

  // Ein bei Absturz offener Batch wird zuerst zu Ende gebracht, bevor neue
  // Kandidaten gesucht werden -- sonst legt der Lauf ihn doppelt an.
  if (status.aktuellerBatch) {
    const liste = status.aktuellerBatch.schluessel.map((s) => {
      const [type, tmdb_id] = s.split(':');
      return { type, tmdb_id };
    });
    // Fuer den Wiedereinstieg reicht type/tmdb_id nicht (kein Titel/Jahr fuer
    // die Anzeige) -- die vollen Datensaetze erneut aus der DB holen.
    const { rows } = await pool.query(
      `SELECT t.tmdb_id, t.type, t.title, t.original_title, t.title_en, t.year,
              t.genres, t.director, t.cast_names, t.keywords, t.rating,
              t.vote_count, t.plot, t.overview_en, t.certification, t.uebersetzungen
         FROM titles t
        WHERE (t.type, t.tmdb_id) IN (
          SELECT u.typ, u.id::int FROM unnest($1::text[], $2::text[]) AS u(typ, id))`,
      [liste.map((l) => l.type), liste.map((l) => l.tmdb_id)]
    );
    await chunkVerarbeiten({ apiKey, opt, liste: rows, protokoll, zaehler, status });
  }

  let verbleibend = opt.limit;
  for (;;) {
    if (verbleibend <= 0) break;

    // Kostenschranke vor jedem neuen Chunk: mit dem bisher gemessenen
    // Durchschnitt hochrechnen, Chunk-Groesse notfalls kappen, bei 0 abbrechen.
    let chunkGroesse = Math.min(opt.chunkGroesse, verbleibend);
    if (status.aufrufe > 0) {
      const durchschnitt = status.ausgegeben / status.aufrufe;
      const budget = opt.maxKosten - status.ausgegeben;
      const maxTexte = Math.floor(budget / durchschnitt);
      if (maxTexte < 1) {
        console.log(`\nAbbruch: ${status.ausgegeben.toFixed(2)} $ ausgegeben, Obergrenze ${opt.maxKosten} $ -- ein weiterer Text wuerde sie ueberschreiten (Ø ${durchschnitt.toFixed(4)} $/Text).`);
        break;
      }
      chunkGroesse = Math.min(chunkGroesse, maxTexte);
    }

    const ausschluss = new Set(status.versucht);
    const liste = await kandidaten({ locale: opt.locale, limit: chunkGroesse, minVotes: opt.minVotes, stufe: opt.stufe, ausschluss });
    if (!liste.length) { console.log('\nKeine offenen Kandidaten mehr.'); break; }

    console.log(`\nChunk: ${liste.length} Kandidaten`);
    await chunkVerarbeiten({ apiKey, opt, liste, protokoll, zaehler, status });

    if (status.ausgegeben >= opt.maxKosten) {
      console.log(`\nAbbruch nach diesem Chunk: ${status.ausgegeben.toFixed(2)} $ erreicht/ueberschreitet die Obergrenze von ${opt.maxKosten} $.`);
      break;
    }
    verbleibend -= liste.length;
  }

  protokoll.end();
  const dauer = Math.round((Date.now() - begonnen) / 1000);
  console.log(`\nFertig in ${dauer}s: ${zaehler.ok} geschrieben, ${zaehler.format} Formatfehler, ${zaehler.fakten} Faktenverdacht, ${zaehler.fehler} Fehler.`);
  console.log(`Kosten dieses Prozesslaufs: ${status.ausgegeben.toFixed(2)} $ echt (Statusdatei: ${opt.statusDatei}).`);
  if (zaehler.fakten) console.log('Faktenverdacht = verworfen und protokolliert, nicht geschrieben.');
  console.log(`Protokoll: ${opt.journal}`);
  await pool.end();
}

if (import.meta.filename === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
