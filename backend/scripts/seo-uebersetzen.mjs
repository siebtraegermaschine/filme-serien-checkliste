#!/usr/bin/env node
// Uebersetzt vorhandene de-de-Titeltexte (>= 1200 Zeichen) per Batch-API in die
// uebrigen Locales und schreibt sie nach seo_content. Die Fakten sind im
// deutschen Text schon geprueft; hier wird nur uebertragen, nichts ergaenzt.
// Kein Mindestwortlimit: die Laenge folgt dem Quelltext (Verhaeltnis 0,6-1,7).
//
// Mehrere Locales laufen reihum in Chunks, die Obergrenze gilt gemeinsam.
// Pro Locale werden die beliebtesten Titel zuerst bearbeitet (vote_count).
//
// Aufruf:
//   ANTHROPIC_API_KEY=... node scripts/seo-uebersetzen.mjs --locales en-gb,fr-fr --gesamt 50 --zufall --dry-run
//   ... --locales en-gb,fr-fr,it-it,nl-nl,pt-pt --max-kosten 140 --chunk-groesse 500
// Optionen: --model (Standard claude-haiku-4-5-20251001), --gesamt N (Titel insgesamt),
//   --chunk-groesse N, --zufall (Probe: Zufallsauswahl), --dry-run, --intervall S,
//   --journal PFAD, --status-datei PFAD
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import {
  SPRACHEN, PREISE, kostenBerechnen, ergebnisZeilenLesen, ueberschriftenNormalisieren,
  pruefeGegenQuelle, statusLesen,
} from './seo-batch.mjs';

const API = 'https://api.anthropic.com/v1/messages/batches';

function argumente() {
  const a = process.argv.slice(2);
  const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };
  return {
    locales: hol('locales', 'en-gb').split(','),
    model: hol('model', 'claude-haiku-4-5-20251001'),
    gesamt: Number(hol('gesamt', Infinity)),
    chunk: Number(hol('chunk-groesse', '500')),
    maxKosten: Number(hol('max-kosten', '140')),
    intervall: Number(hol('intervall', '30')),
    zufall: a.includes('--zufall'),
    dryRun: a.includes('--dry-run'),
    journal: hol('journal', path.join(import.meta.dirname, '.seo-uebersetzen-journal.jsonl')),
    statusDatei: hol('status-datei', path.join(import.meta.dirname, '.seo-uebersetzen-lauf.json')),
  };
}

const cid = (locale, schluessel) => `${locale.replace('-', '_')}__${schluessel.replace(':', '-')}`;
function cidParse(id) {
  const [l, rest] = id.split('__');
  const i = rest.indexOf('-');
  return { locale: l.replace('_', '-'), schluessel: `${rest.slice(0, i)}:${rest.slice(i + 1)}` };
}

async function kandidaten({ locale, limit, zufall, versucht }) {
  const { rows } = await pool.query(
    `SELECT t.type, t.tmdb_id, t.title, t.original_title, t.title_en, t.year, t.rating,
            t.director, t.cast_names, t.uebersetzungen, d.text AS quelle
       FROM seo_content d
       JOIN titles t ON d.schluessel = t.type || ':' || t.tmdb_id
      WHERE d.bereich = 'titel' AND d.locale = 'de-de' AND length(d.text) >= 1200
        AND NOT EXISTS (SELECT 1 FROM seo_content s WHERE s.bereich = 'titel'
              AND s.schluessel = d.schluessel AND s.locale = $1 AND length(s.text) >= 1200)
        AND NOT (d.schluessel = ANY($3::text[]))
      ORDER BY ${zufall ? 'random()' : 't.vote_count DESC NULLS LAST'}
      LIMIT $2`,
    [locale, limit, versucht]
  );
  return rows;
}

// Titel, wie er im Zieltext stehen soll: TMDB-Fassung der Sprache, sonst
// englischer bzw. Originaltitel. Gleich dem deutschen Titel => keine Zuordnung.
function zielTitel(t, locale) {
  const k = locale.startsWith('en') ? 'en' : locale.slice(0, 2);
  const nativ = t.uebersetzungen?.[k]?.t;
  if (nativ) return nativ;
  if (k === 'en' && t.title_en) return t.title_en;
  return t.original_title || t.title_en || t.title;
}

function systemPrompt(locale) {
  const s = SPRACHEN[locale];
  const dezimal = locale.startsWith('en') ? 'Punkt (7.4)' : 'Komma (7,4)';
  return `Du uebersetzt redaktionelle Titeltexte des Filmportals movietaste.de aus dem Deutschen ins ${s.sprache} (${locale}).

REGELN
- Gib nur die Uebersetzung aus, ohne Vorrede und Nachbemerkung.
- Uebertrage Inhalt und Aufbau getreu. Nichts hinzufuegen, nichts erfinden, keine Fakten aus eigenem Wissen. Jede Zahl, jeder Name bleibt wie im Text.
- Exakt vier Ueberschriften in dieser Reihenfolge, als "### ..." (die deutschen Ueberschriften ersetzt du so):
### ${s.abschnitte[0]}
### ${s.abschnitte[1]}
### ${s.abschnitte[2]}
### ${s.abschnitte[3]}
- Fliesstext wie in der Vorlage, keine Aufzaehlungen, keine Fettschrift.
- Personennamen unveraendert. Den Titel schreibst du so, wie unter TITEL angegeben.
- Dezimalzahlen mit ${dezimal}.
- Deutsche Altersfreigaben (FSK) und Bezuege auf Deutschland als Veroeffentlichungsland laesst du weg, wenn sie im Text vorkommen; sonst bleibt alles.
- Natuerliches, sachliches ${s.sprache}, keine Woerter-fuer-Wort-Uebersetzung, aber auch keine Umdeutung.`;
}

function anfrage(model, locale, t) {
  const ziel = zielTitel(t, locale);
  const titelZeile = ziel === t.title ? `TITEL: ${t.title}` : `TITEL: deutsch „${t.title}“ -> im Zieltext „${ziel}“`;
  return {
    model,
    max_tokens: 2048,
    ...(/haiku/.test(model) ? {} : { output_config: { effort: 'low' } }),
    system: [{ type: 'text', text: systemPrompt(locale), cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: `${titelZeile}\n\nTEXT\n${t.quelle}` }],
  };
}

async function api(url, opts, versuche = 5) {
  for (let v = 1; v <= versuche; v++) {
    const res = await fetch(url, opts);
    if (res.ok) return res;
    if (![429, 500, 502, 503, 529].includes(res.status)) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, Math.min(60000, 2000 * 2 ** (v - 1))));
  }
  throw new Error('API nicht erreichbar');
}
const kopf = (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' });

const DE_WOERTER = /\b(der|die|das|und|nicht|ist|mit|eine?n?|sich|auf|für|wird)\b/gi;
const woerterZahl = (s) => s.replace(/^#{1,6}.*$/gm, '').split(/\s+/).filter(Boolean).length;

export function pruefe(text, t, locale) {
  const fehler = [];
  const soll = SPRACHEN[locale].abschnitte;
  const u = [...text.matchAll(/^#{1,6}\s*(.+)$/gm)].map((m) => m[1].trim());
  if (u.length !== 4 || u.some((x, i) => x !== soll[i])) fehler.push(`Ueberschriften: ${JSON.stringify(u)}`);
  const w = woerterZahl(text), q = woerterZahl(t.quelle);
  if (w < q * 0.6 || w > q * 1.7) fehler.push(`Laenge ${w} Woerter bei Quelle ${q}`);
  if (/\*\*/.test(text) || /^\s*[-*•]\s/m.test(text)) fehler.push('Fett/Aufzaehlung');
  if (!locale.startsWith('de') && (text.match(DE_WOERTER) || []).length > 6) fehler.push('deutsche Reste');
  if (/\bFSK\b/.test(text)) fehler.push('FSK');
  const quelle = [t.quelle, t.title, t.original_title, t.title_en, t.director, (t.cast_names || []).join(' '),
    zielTitel(t, locale), JSON.stringify(t.uebersetzungen?.[locale.slice(0, 2)] || {})].filter(Boolean).join(' ');
  const v = pruefeGegenQuelle(text, quelle, { year: t.year, rating: t.rating, castCount: (t.cast_names || []).length });
  return { fehler, verdacht: v };
}

async function main() {
  const opt = argumente();
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { console.error('ANTHROPIC_API_KEY fehlt.'); process.exit(1); }
  if (!PREISE[opt.model]) { console.error(`Keine Preise fuer ${opt.model}.`); process.exit(1); }
  for (const l of opt.locales) if (!SPRACHEN[l] || l === 'de-de') { console.error(`Ungueltige Locale ${l}`); process.exit(1); }

  const status = statusLesen(opt.statusDatei);
  const speichern = () => fs.writeFileSync(opt.statusDatei, JSON.stringify(status, null, 2));
  const journal = fs.createWriteStream(opt.journal, { flags: 'a' });
  const z = { ok: 0, pruef: 0, verdacht: 0, fehler: 0 };
  const proLocale = Object.fromEntries(opt.locales.map((l) => [l, 0]));
  let verbleibend = opt.gesamt;
  console.log(`Locales ${opt.locales.join(',')} · ${opt.model} · Obergrenze ${opt.maxKosten} $ · ${opt.dryRun ? 'DRY-RUN' : 'schreibt'}`);
  if (status.ausgegeben) console.log(`Fortsetzung: ${status.ausgegeben.toFixed(2)} $ bisher.`);

  async function chunk(liste, locale) {
    let id = status.aktuellerBatch?.id;
    if (!id) {
      const requests = liste.map((t) => ({ custom_id: cid(locale, `${t.type}:${t.tmdb_id}`), params: anfrage(opt.model, locale, t) }));
      const res = await api(API, { method: 'POST', headers: { ...kopf(key), 'content-type': 'application/json' }, body: JSON.stringify({ requests }) });
      id = (await res.json()).id;
      status.aktuellerBatch = { id, locale, schluessel: liste.map((t) => `${t.type}:${t.tmdb_id}`) };
      speichern();
      console.log(`  Batch ${id} (${locale}, ${liste.length} Titel)`);
    } else console.log(`  Nehme offenen Batch ${id} wieder auf`);
    let ended;
    for (;;) {
      ended = await (await api(`${API}/${id}`, { headers: kopf(key) })).json();
      if (ended.processing_status === 'ended') break;
      await new Promise((r) => setTimeout(r, opt.intervall * 1000));
    }
    const zeilen = ergebnisZeilenLesen(await (await api(ended.results_url, { headers: kopf(key) })).text());
    const nach = new Map(liste.map((t) => [`${t.type}:${t.tmdb_id}`, t]));
    let kosten = 0;
    for (const zeile of zeilen) {
      const { locale: loc, schluessel } = cidParse(zeile.custom_id);
      const t = nach.get(schluessel);
      status.versucht.push(`${loc}|${schluessel}`);
      if (zeile.result.type !== 'succeeded') { z.fehler++; journal.write(JSON.stringify({ schluessel, locale: loc, status: 'fehler', meldung: zeile.result.type }) + '\n'); continue; }
      const m = zeile.result.message;
      const k = kostenBerechnen(m.usage, opt.model);
      kosten += k; status.ausgegeben += k; status.aufrufe++;
      const text = ueberschriftenNormalisieren((m.content || []).map((c) => c.text || '').join('').trim());
      const { fehler, verdacht } = pruefe(text, t, loc);
      const basis = { schluessel, titel: t.title, locale: loc, fehler, verdacht };
      if (fehler.length) { z.pruef++; journal.write(JSON.stringify({ ...basis, status: 'format', text }) + '\n'); continue; }
      if (verdacht.length) { z.verdacht++; journal.write(JSON.stringify({ ...basis, status: 'fakten', text }) + '\n'); continue; }
      if (opt.dryRun) journal.write(JSON.stringify({ ...basis, status: 'ok-dry', text }) + '\n');
      else {
        await pool.query(
          `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('titel', $1, $2, $3)
           ON CONFLICT (bereich, schluessel, locale) DO UPDATE SET text = EXCLUDED.text, aktualisiert_am = now()`,
          [schluessel, loc, text]);
        journal.write(JSON.stringify({ ...basis, status: 'ok' }) + '\n');
      }
      z.ok++; status.texte++;
    }
    status.aktuellerBatch = null; speichern();
    console.log(`  Chunk fertig: ${zeilen.length} Ergebnisse, ${kosten.toFixed(3)} $ (gesamt ${status.ausgegeben.toFixed(2)} $)`);
  }

  // Offenen Batch zuerst beenden (sonst doppelt bezahlt).
  if (status.aktuellerBatch) {
    const { locale, schluessel } = status.aktuellerBatch;
    const { rows } = await pool.query(
      `SELECT t.type, t.tmdb_id, t.title, t.original_title, t.title_en, t.year, t.rating, t.director, t.cast_names, t.uebersetzungen, d.text AS quelle
         FROM seo_content d JOIN titles t ON d.schluessel = t.type || ':' || t.tmdb_id
        WHERE d.bereich = 'titel' AND d.locale = 'de-de' AND d.schluessel = ANY($1::text[])`, [schluessel]);
    await chunk(rows, locale);
  }

  let leer = 0;
  while (verbleibend > 0 && leer < opt.locales.length) {
    leer = 0;
    for (const locale of opt.locales) {
      if (verbleibend <= 0) break;
      let n = Math.min(opt.chunk, verbleibend);
      if (status.aufrufe > 0) {
        const maxTexte = Math.floor((opt.maxKosten - status.ausgegeben) / (status.ausgegeben / status.aufrufe));
        if (maxTexte < 1) { console.log(`Obergrenze erreicht: ${status.ausgegeben.toFixed(2)} $.`); verbleibend = 0; break; }
        n = Math.min(n, maxTexte);
      }
      const versucht = status.versucht.filter((v) => v.startsWith(`${locale}|`)).map((v) => v.split('|')[1]);
      const liste = await kandidaten({ locale, limit: n, zufall: opt.zufall, versucht });
      if (!liste.length) { leer++; continue; }
      await chunk(liste, locale);
      proLocale[locale] += liste.length; verbleibend -= liste.length;
    }
  }
  journal.end();
  console.log(`\nFertig: ${z.ok} ${opt.dryRun ? 'bestanden (nicht geschrieben)' : 'geschrieben'}, ${z.pruef} Formatfehler, ${z.verdacht} Faktenverdacht, ${z.fehler} API-Fehler.`);
  console.log(`Kosten: ${status.ausgegeben.toFixed(3)} $ · Ø ${(status.aufrufe ? status.ausgegeben / status.aufrufe * 100 : 0).toFixed(3)} Cent/Text · Journal ${opt.journal}`);
  await pool.end();
}

if (import.meta.filename === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
