#!/usr/bin/env node
// Zweite Kontrollstufe fuer die Batch-Texte: zieht eine Stichprobe aus
// seo_content, legt sie neben den Datenbanksatz und laesst jede Tatsachen-
// behauptung einzeln pruefen. Ein Pruefdurchgang urteilt nicht ueber Stil,
// sondern nur darueber, ob eine Aussage im Satz gedeckt ist.
//
// Das Modell wird ausdruecklich gegen den Text eingesetzt: Es soll Verstoesse
// finden, nicht bestaetigen. Im Zweifel gilt eine Aussage als ungedeckt.
//
// Aufruf:
//   ANTHROPIC_API_KEY=... node scripts/seo-batch-pruefen.mjs --stichprobe 40
//   ANTHROPIC_API_KEY=... node scripts/seo-batch-pruefen.mjs --stichprobe 200 --loeschen
//
// Optionen:
//   --locale CODE      Sprache (Standard de-de)
//   --stichprobe N     Zahl der geprueften Texte (Standard 30)
//   --concurrency N    Gleichzeitige Anfragen (Standard 6)
//   --model NAME       Standard claude-opus-5 -- die Pruefstufe darf teurer sein
//   --seit ISO         Nur Texte, die seit diesem Zeitpunkt geschrieben wurden
//   --loeschen         Beanstandete Texte aus seo_content entfernen, damit der
//                      naechste Batchlauf sie neu erzeugt
//   --bericht PFAD     JSONL-Bericht (Standard scripts/.seo-pruefbericht.jsonl)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { SPRACHEN, datensatz } from './seo-batch.mjs';

function argumente() {
  const a = process.argv.slice(2);
  const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };
  return {
    locale: hol('locale', 'de-de'),
    stichprobe: Number(hol('stichprobe', '30')),
    concurrency: Number(hol('concurrency', '6')),
    model: hol('model', 'claude-opus-5'),
    seit: hol('seit', null),
    loeschen: a.includes('--loeschen'),
    bericht: hol('bericht', path.join(import.meta.dirname, '.seo-pruefbericht.jsonl')),
  };
}

async function stichprobe({ locale, stichprobe, seit }) {
  const { rows } = await pool.query(
    `SELECT s.schluessel, s.text, s.aktualisiert_am,
            t.tmdb_id, t.type, t.title, t.original_title, t.title_en, t.year,
            t.genres, t.director, t.cast_names, t.keywords, t.rating,
            t.vote_count, t.plot, t.overview_en, t.certification, t.uebersetzungen
       FROM seo_content s
       JOIN titles t ON t.type || ':' || t.tmdb_id = s.schluessel
      WHERE s.bereich = 'titel' AND s.locale = $1
        AND ($3::timestamptz IS NULL OR s.aktualisiert_am >= $3)
      ORDER BY random()
      LIMIT $2`,
    [locale, stichprobe, seit]
  );
  return rows;
}

const SYSTEM = `Du pruefst redaktionelle Filmtexte auf Faktentreue. Deine Aufgabe ist
ausschliesslich, Verstoesse zu finden -- nicht, den Text zu loben oder zu verbessern.

Du bekommst einen DATENSATZ und einen TEXT. Der DATENSATZ ist die einzige zulaessige
Quelle. Jede Tatsachenbehauptung im TEXT muss sich darauf zurueckfuehren lassen.

GEDECKT sind:
- Angaben, die woertlich oder sinngemaess im DATENSATZ stehen
- zwingende Schluesse daraus (Jahresabstand, Verhaeltnis von Bewertung und Stimmenzahl,
  Zahl der genannten Darsteller, Bedeutung einer Genrekombination)
- Aussagen ueber die Erzaehlform, die keine Tatsache ueber den Titel behaupten

UNGEDECKT sind insbesondere:
- Auszeichnungen, Nominierungen, Festivals
- Budget, Einspielergebnis, Zuschauer- oder Abrufzahlen, Starttermine
- Drehorte, Drehzeiten, Produktionsfirmen, Kamera, Musik, Schnitt, Drehbuchautoren
- Kritikerstimmen, Wertungen von Bewertungsportalen
- Vorlagen, Fortsetzungen, Remakes, Bezuege zu anderen Werken
- Biografisches oder Karriereeinordnungen zu Regie und Besetzung
- Rezeptionsbehauptungen wie "gilt als", "wurde gefeiert", "Kultstatus"
- Handlungsdetails, die ueber die Inhaltsangabe hinausgehen

IM ZWEIFEL GILT EINE AUSSAGE ALS UNGEDECKT. Lieber eine Beanstandung zu viel.

Antworte ausschliesslich mit JSON in genau dieser Form, ohne Vorrede:
{"verstoesse":[{"zitat":"woertliches Zitat aus dem TEXT","grund":"kurze Begruendung"}]}
Ist alles gedeckt, gib {"verstoesse":[]} zurueck.`;

async function pruefen({ apiKey, model, zeile, locale }) {
  const body = {
    model,
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{ role: 'user', content: `DATENSATZ\n${datensatz(zeile, locale)}\n\nTEXT\n${zeile.text}` }],
  };
  for (let versuch = 1; versuch <= 4; versuch++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j = await res.json();
      const roh = j.content.map((c) => c.text || '').join('').trim();
      const m = roh.match(/\{[\s\S]*\}/);
      if (!m) throw new Error(`Antwort ohne JSON: ${roh.slice(0, 160)}`);
      return JSON.parse(m[0]).verstoesse || [];
    }
    if (![429, 500, 502, 503, 529].includes(res.status)) {
      throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, Math.min(60000, 2000 * 2 ** (versuch - 1))));
  }
  throw new Error('API nach 4 Versuchen nicht erreichbar');
}

async function main() {
  const opt = argumente();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('ANTHROPIC_API_KEY fehlt.'); process.exit(1); }
  if (!SPRACHEN[opt.locale]) { console.error(`Unbekannte Sprache ${opt.locale}.`); process.exit(1); }

  const zeilen = await stichprobe(opt);
  console.log(`${zeilen.length} Texte in der Stichprobe · Sprache ${opt.locale} · Pruefmodell ${opt.model}`);
  if (!zeilen.length) { await pool.end(); return; }

  const bericht = fs.createWriteStream(opt.bericht, { flags: 'a' });
  const beanstandet = [];
  let sauber = 0, fehler = 0, naechster = 0;

  async function arbeiter() {
    for (;;) {
      const i = naechster++;
      if (i >= zeilen.length) return;
      const z = zeilen[i];
      try {
        const v = await pruefen({ apiKey, model: opt.model, zeile: z, locale: opt.locale });
        const eintrag = { schluessel: z.schluessel, titel: z.title, locale: opt.locale, verstoesse: v };
        bericht.write(JSON.stringify(eintrag) + '\n');
        if (v.length) beanstandet.push(eintrag); else sauber++;
      } catch (e) {
        fehler++;
        bericht.write(JSON.stringify({ schluessel: z.schluessel, status: 'fehler', meldung: String(e).slice(0, 200) }) + '\n');
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opt.concurrency) }, arbeiter));
  bericht.end();

  const geprueft = sauber + beanstandet.length;
  const quote = geprueft ? Math.round((beanstandet.length / geprueft) * 100) : 0;
  console.log(`\nGeprueft: ${geprueft} · sauber: ${sauber} · beanstandet: ${beanstandet.length} (${quote} %) · Fehler: ${fehler}`);

  for (const b of beanstandet.slice(0, 15)) {
    console.log(`\n${b.schluessel} · ${b.titel}`);
    for (const v of b.verstoesse) console.log(`  – „${v.zitat}“ — ${v.grund}`);
  }
  if (beanstandet.length > 15) console.log(`\n… und ${beanstandet.length - 15} weitere. Vollstaendig im Bericht.`);

  if (opt.loeschen && beanstandet.length) {
    const r = await pool.query(
      `DELETE FROM seo_content WHERE bereich = 'titel' AND locale = $1 AND schluessel = ANY($2)`,
      [opt.locale, beanstandet.map((b) => b.schluessel)]
    );
    console.log(`\n${r.rowCount} beanstandete Texte geloescht — der naechste Batchlauf erzeugt sie neu.`);
  } else if (beanstandet.length) {
    console.log('\nMit --loeschen werden die beanstandeten Texte entfernt und neu erzeugt.');
  }

  console.log(`\nBericht: ${opt.bericht}`);
  console.log(quote > 5
    ? 'Beanstandungsquote ueber 5 % — Prompt nachschaerfen, bevor der grosse Lauf startet.'
    : 'Beanstandungsquote im Rahmen.');
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
