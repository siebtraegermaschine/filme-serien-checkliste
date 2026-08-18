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
// Quellenkette fuer die Inhaltsangabe: muttersprachlich, sonst englisch, sonst
// deutsch. Eine Inhaltsangabe in anderer Sprache ist keine andere Tatsache --
// sie beschreibt denselben Titel, und das Modell gibt sie in der Zielsprache
// wieder. Erfunden wird dadurch nichts.
export function inhaltsangabe(t, locale) {
  const k = SPRACHEN[locale]?.uebKey;
  const nativ = k && t.uebersetzungen?.[k]?.ov;
  if (nativ && nativ.length > 150) return nativ;
  if (t.overview_en && t.overview_en.length > 150) return t.overview_en;
  return t.plot;
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
async function erzeugen({ apiKey, model, t, locale }) {
  const body = {
    model,
    max_tokens: 1600,
    system: systemPrompt(locale),
    messages: [{ role: 'user', content: `DATENSATZ\n${datensatz(t, locale)}\n\nSchreibe den Titeltext.` }],
  };
  for (let versuch = 1; versuch <= 5; versuch++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j = await res.json();
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
const MUSTER = [
  [/\b(gewann|ausgezeichnet|nominiert|Oscar|Golden Globe|Palme|Bär(en)?preis|won|award|nominated|premio|galardón|récompense|César)\b/i, 'Auszeichnung'],
  [/\b(Millionen? (Dollar|Euro)|million (dollars|euros)|Einspiel|box office|budget|taquilla|recette)\b/i, 'Geschaeftszahl'],
  [/\b(gedreht|Drehort|Dreharbeiten|Produktionsfirma|filmed|shot in|rodaje|tournage|studio)\b/i, 'Produktionsangabe'],
  [/\b(Kritiker|Rezension|Rotten Tomatoes|Metacritic|IMDb|critics|reseña|critique)\b/i, 'Rezeption'],
  [/\b(basiert auf|Vorlage|Fortsetzung|Neuverfilmung|Remake|based on|sequel|adaptación|adapté de|secuela|suite)\b/i, 'Werkbezug'],
];

export function faktenVerdacht(text, t, locale) {
  const quelle = (datensatz(t, locale) + ' ' + (t.plot || '') + ' ' + (t.overview_en || '')).toLowerCase();
  const verdacht = [];

  // Zahlen: jede Zahl im Text muss im Datensatz vorkommen oder sich zwingend
  // daraus errechnen (Jahresabstand, Jahrzehnt).
  const jetzt = new Date().getFullYear();
  const erlaubt = new Set([String(t.year), String(t.rating ?? ''), String(t.vote_count ?? ''),
    String(jetzt), String(jetzt - t.year), String(Math.floor(t.year / 10) * 10),
    String((t.cast_names || []).length), String((t.genres || []).length), '10']);
  for (const m of text.matchAll(/\b\d[\d.,]*\b/g)) {
    const roh = m[0].replace(/[.,]$/, '');
    if (erlaubt.has(roh) || quelle.includes(roh.toLowerCase())) continue;
    verdacht.push(`Zahl ohne Beleg: ${roh}`);
  }

  // Eigennamen: Zweiwortfolgen aus Grossbuchstaben-Anfaengen, die nicht im
  // Datensatz stehen. Trifft erfundene Personen, Studios, Festivals und Preise
  // zuverlaessig; einzelne grossgeschriebene Woerter erzeugen zu viel Rauschen.
  for (const m of text.matchAll(/\b([A-ZÄÖÜÁÉÍÓÚÀÈÌÒÙÇ][\p{Ll}]{2,}\s+[A-ZÄÖÜÁÉÍÓÚÀÈÌÒÙÇ][\p{Ll}]{2,})\b/gu)) {
    if (!quelle.includes(m[1].toLowerCase())) verdacht.push(`Eigenname ohne Beleg: ${m[1]}`);
  }

  for (const [re, was] of MUSTER) {
    const treffer = text.match(re);
    if (treffer && !quelle.includes(treffer[0].toLowerCase())) verdacht.push(`${was}: „${treffer[0]}“`);
  }
  return [...new Set(verdacht)];
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
  await pool.end();
}

if (import.meta.filename === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
