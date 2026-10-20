#!/usr/bin/env node
// Verlaengert de-de-Titeltexte unter 250 Zeichen (seo_content, bereich 'titel') um Saetze
// aus belegten Katalogfakten (Streaming-Anbieter je Region, einzelner Besetzungseintrag).
// Der bestehende Text bleibt erhalten, die Saetze kommen vor den MovieTaste-Schlusssatz.
// Kein API-Aufruf. Idempotent: nur Texte < MIN, Update nur bei unveraendertem Text.
//
// Aufruf (Backend-Container): node scripts/seo-titel-verlaengern.mjs [--dry-run] [--zeige 50]
//   [--max N] [--sicherung DATEI] [--probe DATEI]
import 'dotenv/config';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';

const LOCALE = 'de-de';
const MIN = 250;
const ZIEL = 270; // Puffer ueber der Schwelle
const SCHLUSS = 'Auf MovieTaste lässt sich';
const land = new Intl.DisplayNames(['de'], { type: 'region' });

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}
const wahl = (k, v) => v[hash(k) % v.length];

function aufz(l) {
  if (l.length <= 1) return l.join('');
  return `${l.slice(0, -1).join(', ')} und ${l[l.length - 1]}`;
}

function regionName(code) {
  try { const n = land.of(code); return n && n !== code ? n : null; } catch { return null; }
}

// Anbieter mit Laendern, wichtigste zuerst (DE vorn, dann nach Zahl der Regionen).
export function anbieterText(anbieter) {
  const nach = new Map();
  for (const a of anbieter || []) {
    const n = regionName(a.region);
    if (!n) continue;
    if (!nach.has(a.provider_name)) nach.set(a.provider_name, []);
    nach.get(a.provider_name).push({ code: a.region, name: n });
  }
  const liste = [...nach.entries()].map(([name, rs]) => ({
    name,
    de: rs.some((r) => r.code === 'DE'),
    rs: rs.sort((x, y) => (x.code === 'DE' ? -1 : y.code === 'DE' ? 1 : x.name.localeCompare(y.name, 'de'))),
  }));
  liste.sort((x, y) => (y.de - x.de) || (y.rs.length - x.rs.length) || x.name.localeCompare(y.name, 'de'));
  const top = liste.slice(0, 2).map((p) => {
    const namen = p.rs.slice(0, 2).map((r) => r.name);
    const regionen = p.rs.length > 2 ? `${namen.join(', ')} u. a.` : aufz(namen);
    return `${p.name} (${regionen})`;
  });
  return top.length ? aufz(top) : null;
}

// Liefert die Zusatzsaetze in Prioritaetsreihenfolge (nur belegte Fakten).
export function zusatzSaetze(t) {
  const serie = t.type === 'series';
  const k = `${t.type}:${t.tmdb_id}`;
  const er = serie ? 'die Serie' : 'der Film';
  const out = [];
  const anb = anbieterText(t.anbieter);
  if (anb) {
    out.push(wahl(k + 'a', [
      `In den Katalogdaten ist ${er} bei ${anb} verzeichnet.`,
      `Als Streaming-Angebot nennt der Katalog ${anb}.`,
      `Laut Katalog ist ${serie ? 'sie' : 'er'} bei ${anb} zu finden.`,
      `Verzeichnet ist ${serie ? 'sie' : 'er'} im Katalog bei ${anb}.`,
      `Der Katalog nennt für ${er === 'die Serie' ? 'diese Serie' : 'diesen Film'} folgendes Angebot: ${anb}.`,
      `Unter den Streaming-Anbietern des Katalogs taucht ${serie ? 'sie' : 'er'} bei ${anb} auf.`,
    ]));
  }
  const cast = t.cast_names || [];
  if (cast.length === 1) {
    out.push(wahl(k + 'c', [
      `In der Besetzung führt der Katalog ${cast[0]}.`,
      `Als Darstellerin oder Darsteller ist ${cast[0]} verzeichnet.`,
    ]));
  }
  return out;
}

export function verlaengere(text, t) {
  if (text.length >= MIN) return null;
  const i = text.lastIndexOf(SCHLUSS);
  if (i < 0) return null;
  const kopf = text.slice(0, i).trimEnd();
  const schluss = text.slice(i);
  let neu = text;
  const add = [];
  for (const s of zusatzSaetze(t)) {
    add.push(s);
    neu = `${kopf} ${add.join(' ')} ${schluss}`;
    if (neu.length >= ZIEL) break;
  }
  return neu.length >= MIN ? neu : null;
}

async function main() {
  const a = process.argv.slice(2);
  const dryRun = a.includes('--dry-run');
  const arg = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  const zeige = Number(arg('--zeige')) || 0;
  const max = arg('--max') ? Number(arg('--max')) : Infinity;
  const sicherung = arg('--sicherung');
  const probe = arg('--probe');

  const { rows } = await pool.query(
    `SELECT s.schluessel, s.text, t.type, t.tmdb_id, t.cast_names,
            COALESCE((SELECT json_agg(json_build_object('provider_name', c.provider_name, 'region', c.region))
                        FROM streaming_cache c WHERE c.type = t.type AND c.tmdb_id = t.tmdb_id), '[]') AS anbieter
       FROM seo_content s
       JOIN titles t ON s.schluessel = t.type || ':' || t.tmdb_id
      WHERE s.bereich = 'titel' AND s.locale = $1 AND length(s.text) < $2
      ORDER BY s.schluessel`, [LOCALE, MIN]);

  const aenderungen = [];
  let keineFakten = 0;
  for (const r of rows) {
    if (aenderungen.length >= max) break;
    const neu = verlaengere(r.text, r);
    if (!neu) { keineFakten++; continue; }
    aenderungen.push({ schluessel: r.schluessel, alt: r.text, neu });
  }
  const laengen = aenderungen.map((x) => x.neu.length);
  console.log(`Kandidaten ${rows.length}, verlaengerbar ${aenderungen.length}, ohne passende Fakten ${keineFakten}`);
  if (laengen.length) console.log(`Laenge neu: min ${Math.min(...laengen)}, max ${Math.max(...laengen)}`);

  if (zeige) {
    const schritt = Math.max(1, Math.floor(aenderungen.length / zeige));
    const auswahl = aenderungen.filter((_, i) => i % schritt === 0).slice(0, zeige);
    const txt = auswahl.map((x) => `${x.schluessel} (${x.neu.length})\n${x.neu}\n`).join('\n');
    if (probe) fs.writeFileSync(probe, txt); else console.log(txt);
  }
  if (sicherung && !dryRun) fs.writeFileSync(sicherung, JSON.stringify(aenderungen.map(({ schluessel, alt }) => ({ schluessel, alt })), null, 0));

  if (!dryRun) {
    let ok = 0;
    for (const x of aenderungen) {
      const r = await pool.query(
        `UPDATE seo_content SET text = $1 WHERE bereich = 'titel' AND schluessel = $2 AND locale = $3 AND text = $4`,
        [x.neu, x.schluessel, LOCALE, x.alt]);
      ok += r.rowCount;
    }
    console.log(`Aktualisiert ${ok}`);
  }
  await pool.end();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
