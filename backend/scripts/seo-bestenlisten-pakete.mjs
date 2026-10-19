#!/usr/bin/env node
// Schneidet die Bestenlisten (de-de) in Arbeitspakete fuer das Faecher-Verfahren
// (Abo statt API). Je Liste: Ueberschrift, Modus und die 20 Spitzentitel mit Fakten.
// Gegenstueck: seo-bestenlisten-einspielen.mjs.
//
// Aufruf (im Backend-Container):
//   node scripts/seo-bestenlisten-pakete.mjs --je 20 --ziel /tmp/bl-pakete [--modus jahr] [--nur-kurze]
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { ladeBestenliste, alleBestenlisten } from '../lib/seoData.js';

const a = process.argv.slice(2);
const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };
const je = Number(hol('je', '20'));
const ziel = hol('ziel', path.join(import.meta.dirname, '.bl-pakete'));
const nurModus = hol('modus', null);
const LOCALE = 'de-de';
const LANG = 900; // Zeichen; darueber gilt eine Liste als schon verlaengert

const listen = (await alleBestenlisten(LOCALE)).filter(([, m]) => !nurModus || m === nurModus);
const eintraege = [];
for (const [art, modus, wert] of listen) {
  const d = await ladeBestenliste(art, modus, wert, LOCALE);
  if (!d || !d.titel.length) continue;
  if (d.text && d.text.length >= LANG) continue;
  const ids = d.titel.map((t) => t.id);
  const { rows } = await pool.query(
    `SELECT id::text AS id, director, origin_country, left(coalesce(plot, overview_en, ''), 220) AS plot, cast_names[1:3] AS cast
       FROM titles WHERE id = ANY($1::bigint[])`, [ids]);
  const extra = new Map(rows.map((r) => [r.id, r]));
  eintraege.push({
    schluessel: `${modus}:${wert}:${d.type}`,
    art: d.type === 'series' ? 'Serien' : 'Filme',
    modus, wert, ueberschrift: d.ueberschrift,
    genre: d.genre, anbieter: d.anbieter, land: d.landAus, sprache: d.sprache,
    gesamtImKatalog: d.gesamtGefunden,
    bisherigerText: d.text || null,
    spitze: d.titel.map((t) => {
      const e = extra.get(t.id) || {};
      return { titel: t.title, jahr: t.year, genres: t.genres, regieOderIdee: e.director || null,
        laender: e.origin_country || null, besetzung: e.cast || null, handlung: e.plot || null };
    }),
  });
}
fs.mkdirSync(ziel, { recursive: true });
const n = Math.ceil(eintraege.length / je);
for (let i = 0; i < n; i++) {
  fs.writeFileSync(path.join(ziel, `paket-bl-${String(i + 1).padStart(2, '0')}.json`),
    JSON.stringify(eintraege.slice(i * je, (i + 1) * je), null, 1));
}
console.log(`${eintraege.length} Listen in ${n} Paketen -> ${ziel}`);
await pool.end();
