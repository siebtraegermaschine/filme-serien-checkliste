#!/usr/bin/env node
// Uebersetzt die deutschen Redaktionstexte der Genre-, Anbieter-, Kino-Stadt-,
// Reihen- und Hub-Seiten (seo_content, de-de) in eine andere Locale und legt
// sie unter demselben Schluessel ab. Quelle ist ausschliesslich der deutsche
// Text -- das Modell uebersetzt, ergaenzt nichts. Laeuft ueber die
// Message-Batches-API (50 % Rabatt), Modell Haiku 4.5.
//
// Mechanische Pruefung je Text (uebersetzungPruefen): Zahlen, Eigennamen/
// Markennamen, Titel in Anfuehrungszeichen und Absatzzahl muessen erhalten
// bleiben, Laenge im Rahmen, kein deutscher Rest, keine Vorrede.
//
// Aufruf (im Backend-Container):
//   node scripts/seo-kategorien-uebersetzen.mjs --locale en-gb --limit 50 --dry-run
//   node scripts/seo-kategorien-uebersetzen.mjs --locale fr-fr --max-kosten 5
//
// Optionen: --locale CODE (Pflicht, nicht de-de) --bereiche a,b (Standard
// genre,anbieter,kino_stadt,reihe,hub) --limit N --chunk-groesse N (600)
// --intervall N (30) --model NAME --max-kosten ZAHL (5) --dry-run --journal PFAD
// --status-datei PFAD
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { PERSON_TX } from '../lib/seoPersonen.js';
import { PREISE, kostenBerechnen, ergebnisZeilenLesen, statusLesen } from './seo-batch.mjs';

export const ZIELE = {
  'en-gb': { sprache: 'britisches Englisch', hinweis: 'Britische Schreibweise (colour, programme). Dezimalpunkt (7.6), Tausender mit Komma (27,000). Anfuehrungszeichen: doppelte “…”.' },
  'es-es': { sprache: 'europaeisches Spanisch (Spanien)', hinweis: 'Dezimalkomma (7,6), Tausender mit Punkt (27.000). Anfuehrungszeichen: «…».' },
  'fr-fr': { sprache: 'Franzoesisch (Frankreich)', hinweis: 'Dezimalkomma (7,6), Tausender mit geschuetztem Leerzeichen (27 000). Anfuehrungszeichen: « … ».' },
  'it-it': { sprache: 'Italienisch', hinweis: 'Dezimalkomma (7,6), Tausender mit Punkt (27.000). Anfuehrungszeichen: «…».' },
  'nl-nl': { sprache: 'Niederlaendisch (Niederlande)', hinweis: 'Dezimalkomma (7,6), Tausender mit Punkt (27.000). Anfuehrungszeichen: „…” bzw. “…”.' },
  'pt-pt': { sprache: 'europaeisches Portugiesisch (Portugal)', hinweis: 'Dezimalkomma (7,6), Tausender mit Leerzeichen oder Punkt. Anfuehrungszeichen: «…».' },
};
// Personentexte haben drei feste Abschnitte ("### Werdegang" ...); die
// Ueberschriften muessen exakt diesen Wortlaut tragen (seoRender.js liest sie).
export const PERSON_ABSCHNITTE = { 'en-gb': PERSON_TX.en.abschnitte, 'fr-fr': PERSON_TX.fr.abschnitte };
const MODELL = 'claude-haiku-4-5-20251001';
const BEREICHE_STANDARD = ['genre', 'anbieter', 'kino_stadt', 'reihe', 'hub'];

// Haeufige deutsche Funktionswoerter, die in den Zielsprachen nicht vorkommen.
const DEUTSCH = ['und', 'ist', 'für', 'nicht', 'sich', 'wird', 'über', 'eine', 'dem', 'der', 'mit', 'von', 'auch', 'oder', 'sind', 'werden', 'zwischen', 'dieser', 'einem'];

const ziffern = (s) => String(s).replace(/\D/g, '');

export function zahlenIn(text) {
  return (String(text).match(/\d{1,3}(?:[.,   ]\d{3})+(?!\d)|\d+(?:[.,]\d+)?/g) || []).map(ziffern).filter(Boolean);
}

// Woerter mit Ziffern, Grossbuchstabenfolgen oder InnenGrossschreibung
// (TMDB, MovieMatch, OpenStreetMap, AMC) -- muessen unveraendert uebernommen sein.
export function markenIn(text) {
  const w = String(text).match(/[\p{L}\d]+/gu) || [];
  return [...new Set(w.filter((x) => /[A-ZÄÖÜ]{2,}|[a-zäöü][A-ZÄÖÜ]/.test(x)))];
}

export function titelIn(text) {
  return [...String(text).matchAll(/„([^“”"]+)[“”"]/g)].map((m) => m[1].trim());
}

// Liefert eine Liste von Fehlern (leer = ok).
export function uebersetzungPruefen(quelle, ziel, locale) {
  const f = [];
  const z = String(ziel || '').trim();
  if (!z) return ['leer'];
  if (/^(hier|here|voici|aqui|aquí|ecco|hier is)\b.*[:：]\s*$/im.test(z.split('\n')[0])) f.push('vorrede');
  if (/^(#|\*\*|- )/m.test(z) && !/^(#|\*\*|- )/m.test(quelle)) f.push('markdown');
  const verh = z.length / Math.max(1, quelle.length);
  if (verh < 0.6 || verh > 2.1) f.push(`laenge ${verh.toFixed(2)}`);
  const absQ = quelle.split(/\n\s*\n/).length, absZ = z.split(/\n\s*\n/).length;
  if (absQ !== absZ) f.push(`absaetze ${absQ}/${absZ}`);
  const zahlenZiel = zahlenIn(z);
  for (const n of zahlenIn(quelle)) if (!zahlenZiel.includes(n)) { f.push(`zahl ${n}`); break; }
  for (const n of new Set(zahlenZiel)) if (!zahlenIn(quelle).includes(n)) { f.push(`zusatzzahl ${n}`); break; }
  for (const t of titelIn(quelle)) if (!z.includes(t)) { f.push(`titel ${t}`); break; }
  for (const m of markenIn(quelle)) if (!z.includes(m)) { f.push(`marke ${m}`); break; }
  // Titel in Anfuehrungszeichen bleiben deutsch und zaehlen nicht als Rest.
  const ohneTitel = z.replace(/[„“"”][^„“"”]*[“"”]/g, ' ');
  const woerter = ohneTitel.toLowerCase().match(/[\p{L}]+/gu) || [];
  const de = new Set(DEUTSCH.filter((w) => !(locale === 'pt-pt' && w === 'das')));
  const treffer = woerter.filter((w) => de.has(w)).length;
  if (woerter.length && treffer / woerter.length > 0.03) f.push('deutsch');
  return f;
}

export function systemPrompt(locale, bereiche = []) {
  const ziel = ZIELE[locale];
  const ab = bereiche.includes('person') ? PERSON_ABSCHNITTE[locale] : null;
  const abRegel = ab ? `\n- Der Text hat drei Abschnitte mit den Ueberschriften „### Werdegang", „### Filmografie bei uns", „### Einordnung". Uebernimm die Zeilen mit ### und uebersetze die Ueberschriften genau so: „### ${ab[0]}", „### ${ab[1]}", „### ${ab[2]}".\n- Titel von Filmen und Serien sowie Namen von Personen, Firmen und Orten bleiben im Wortlaut unveraendert.` : '';
  return `Du uebersetzt kurze redaktionelle Seitentexte des Filmportals movietaste.de aus dem Deutschen ins ${ziel.sprache}.

REGELN
- Gib ausschliesslich die Uebersetzung aus, ohne Vorrede, ohne Anmerkung.
- Uebersetze treu: nichts hinzufuegen, nichts weglassen, keine Wertungen oder Fakten ergaenzen, den Aufbau (Absaetze, Leerzeilen, Satzzahl) beibehalten.
- Zahlen, Jahre, Bewertungen bleiben inhaltlich gleich; nur die Schreibweise folgt der Zielsprache. ${ziel.hinweis}
- Titel in deutschen Anfuehrungszeichen („…") und alle Eigennamen (Kinos, Orte, Anbieter, Marken wie MovieMatch, TMDB, OpenStreetMap, Strassen) bleiben im Wortlaut unveraendert; nur die Anfuehrungszeichen passen sich an.
- Genrebezeichnungen, Fachwoerter (Filme, Serien, Bestenliste, Watchlist, Abo, Leih- und Kaufkatalog) uebersetzt du so, wie sie in der Zielsprache auf Film- und Streamingseiten ueblich sind.
- Natuerlicher, sachlicher Ton wie ein Redakteur der Zielsprache; keine woertliche Uebernahme deutscher Satzstellung.${abRegel}`;
}

function argumente() {
  const a = process.argv.slice(2);
  const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };
  return {
    locale: hol('locale', ''),
    bereiche: hol('bereiche', BEREICHE_STANDARD.join(',')).split(','),
    limit: Number(hol('limit', Infinity)),
    chunkGroesse: Number(hol('chunk-groesse', '600')),
    intervall: Number(hol('intervall', '30')),
    model: hol('model', MODELL),
    maxKosten: Number(hol('max-kosten', '5')),
    dryRun: a.includes('--dry-run'),
    journal: hol('journal', path.join(import.meta.dirname, '.uebersetzen-journal.jsonl')),
    statusDatei: hol('status-datei', path.join(import.meta.dirname, '.uebersetzen-lauf.json')),
  };
}

async function mitWiederholung(aufruf, versuche = 5) {
  for (let v = 1; v <= versuche; v++) {
    const res = await aufruf();
    if (res.ok) return res;
    if (![429, 500, 502, 503, 529].includes(res.status)) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, Math.min(60000, 2000 * 2 ** (v - 1))));
  }
  throw new Error(`API nach ${versuche} Versuchen nicht erreichbar`);
}
const kopf = (apiKey) => ({ 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' });

async function offene({ locale, bereiche, limit, ausschluss }) {
  const { rows } = await pool.query(
    `SELECT d.bereich, d.schluessel, d.text FROM seo_content d
      WHERE d.locale = 'de-de' AND d.bereich = ANY($1::text[])
        AND NOT EXISTS (SELECT 1 FROM seo_content z WHERE z.bereich = d.bereich AND z.schluessel = d.schluessel AND z.locale = $2)
      ORDER BY d.bereich, d.schluessel`,
    [bereiche, locale]
  );
  return rows.filter((r) => !ausschluss.has(`${r.bereich}|${r.schluessel}`)).slice(0, limit);
}

async function chunkVerarbeiten({ apiKey, opt, rows, protokoll, zaehler, status }) {
  let batchId = status.aktuellerBatch?.id;
  if (!batchId) {
    const requests = rows.map((r, i) => ({
      custom_id: `k${i}`,
      params: {
        model: opt.model, max_tokens: 2048,
        system: systemPrompt(opt.locale, opt.bereiche),
        messages: [{ role: 'user', content: `Text:\n${r.text}` }],
      },
    }));
    const res = await mitWiederholung(() => fetch('https://api.anthropic.com/v1/messages/batches', { method: 'POST', headers: kopf(apiKey), body: JSON.stringify({ requests }) }));
    batchId = (await res.json()).id;
    status.aktuellerBatch = { id: batchId, eintraege: rows.map((r) => ({ bereich: r.bereich, schluessel: r.schluessel })) };
    fs.writeFileSync(opt.statusDatei, JSON.stringify(status, null, 2));
    console.log(`  Batch angelegt: ${batchId} (${rows.length} Texte)`);
  } else {
    console.log(`  Nehme offenen Batch wieder auf: ${batchId}`);
    const { rows: alle } = await pool.query(`SELECT bereich, schluessel, text FROM seo_content WHERE locale='de-de' AND (bereich, schluessel) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
      [status.aktuellerBatch.eintraege.map((e) => e.bereich), status.aktuellerBatch.eintraege.map((e) => e.schluessel)]);
    const m = new Map(alle.map((r) => [`${r.bereich}|${r.schluessel}`, r]));
    rows = status.aktuellerBatch.eintraege.map((e) => m.get(`${e.bereich}|${e.schluessel}`));
  }
  let ended;
  for (;;) {
    const st = await (await mitWiederholung(() => fetch(`https://api.anthropic.com/v1/messages/batches/${batchId}`, { headers: kopf(apiKey) }))).json();
    if (st.processing_status === 'ended') { ended = st; break; }
    const c = st.request_counts || {};
    console.log(`  Batch ${batchId}: ${st.processing_status} -- verarbeitet ${c.processing ?? '?'}, fertig ${c.succeeded ?? 0}, Fehler ${c.errored ?? 0}`);
    await new Promise((r) => setTimeout(r, opt.intervall * 1000));
  }
  const zeilen = ergebnisZeilenLesen(await (await mitWiederholung(() => fetch(ended.results_url, { headers: kopf(apiKey) }))).text());
  let beispiele = 0, kostenChunk = 0;
  for (const zeile of zeilen) {
    const r = rows[Number(zeile.custom_id.slice(1))];
    const id = `${r.bereich}|${r.schluessel}`;
    status.versucht.push(id);
    if (zeile.result.type !== 'succeeded') { zaehler.fehler++; protokoll.write(JSON.stringify({ id, locale: opt.locale, status: 'fehler', meldung: zeile.result.type }) + '\n'); continue; }
    const msg = zeile.result.message;
    const kosten = kostenBerechnen(msg.usage, opt.model);
    kostenChunk += kosten; status.ausgegeben += kosten; status.aufrufe++;
    const text = (msg.content || []).map((c) => c.text || '').join('').trim();
    const fehler = uebersetzungPruefen(r.text, text, opt.locale);
    if (r.bereich === 'person') for (const h of PERSON_ABSCHNITTE[opt.locale] || []) if (!text.includes(`### ${h}`)) { fehler.push(`ueberschrift ${h}`); break; }
    if (fehler.length) { zaehler.verworfen++; protokoll.write(JSON.stringify({ id, locale: opt.locale, status: 'verworfen', fehler, text }) + '\n'); continue; }
    status.texte++;
    if (!opt.dryRun) {
      await pool.query(`INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ($1,$2,$3,$4) ON CONFLICT (bereich, schluessel, locale) DO NOTHING`, [r.bereich, r.schluessel, opt.locale, text]);
    }
    if (beispiele < 3 || opt.dryRun) { beispiele++; console.log(`\n----- ${id} -----\nDE: ${r.text}\n${opt.locale}: ${text}`); }
    zaehler.ok++;
    protokoll.write(JSON.stringify({ id, locale: opt.locale, status: 'ok', ...(opt.dryRun ? { text } : {}) }) + '\n');
  }
  status.aktuellerBatch = null;
  fs.writeFileSync(opt.statusDatei, JSON.stringify(status, null, 2));
  console.log(`  Chunk fertig: ${zeilen.length} Ergebnisse, ${kostenChunk.toFixed(3)} $ (gesamt ${status.ausgegeben.toFixed(3)} $).`);
}

async function main() {
  const opt = argumente();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error('ANTHROPIC_API_KEY fehlt.'); process.exit(1); }
  if (!ZIELE[opt.locale]) { console.error(`--locale muss eines von ${Object.keys(ZIELE).join(', ')} sein.`); process.exit(1); }
  if (!PREISE[opt.model]) { console.error(`Keine Preise fuer ${opt.model}.`); process.exit(1); }
  const status = statusLesen(opt.statusDatei);
  if (!status.versucht) status.versucht = [];
  const protokoll = fs.createWriteStream(opt.journal, { flags: 'a' });
  const zaehler = { ok: 0, verworfen: 0, fehler: 0 };
  console.log(`Uebersetzung ${opt.locale} · ${opt.model} · Bereiche ${opt.bereiche.join(',')} · Obergrenze ${opt.maxKosten} $`);
  if (status.aktuellerBatch) await chunkVerarbeiten({ apiKey, opt, rows: [], protokoll, zaehler, status });
  let verbleibend = opt.limit;
  while (verbleibend > 0) {
    let groesse = Math.min(opt.chunkGroesse, verbleibend);
    if (status.aufrufe > 0) {
      const maxTexte = Math.floor((opt.maxKosten - status.ausgegeben) / (status.ausgegeben / status.aufrufe));
      if (maxTexte < 1) { console.log(`\nAbbruch: ${status.ausgegeben.toFixed(3)} $ ausgegeben, Obergrenze ${opt.maxKosten} $.`); break; }
      groesse = Math.min(groesse, maxTexte);
    }
    const rows = await offene({ locale: opt.locale, bereiche: opt.bereiche, limit: groesse, ausschluss: new Set(status.versucht) });
    if (!rows.length) { console.log('\nKeine offenen Texte mehr.'); break; }
    console.log(`\nChunk: ${rows.length} Texte`);
    await chunkVerarbeiten({ apiKey, opt, rows, protokoll, zaehler, status });
    verbleibend -= rows.length;
  }
  protokoll.end();
  console.log(`\nFertig: ${zaehler.ok} ok, ${zaehler.verworfen} verworfen, ${zaehler.fehler} Fehler. Kosten ${status.ausgegeben.toFixed(3)} $ echt.`);
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
