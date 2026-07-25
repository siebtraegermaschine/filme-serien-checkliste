#!/usr/bin/env node
/*
 * Einmalige Erstbefüllung der `titles`-Tabelle aus der bisherigen index.html.
 *
 * Liest die dort eingebetteten Konstanten FILME, SERIEN, DETAILS und CAND
 * (siehe Kommentare in index.html selbst) und schreibt sie als Zeilen in
 * Postgres. Ab dem ersten erfolgreichen Lauf ist die Datenbank die Quelle der
 * Wahrheit für den Katalog -- kein erneuter Import gedacht (deshalb der
 * --force-Schalter als bewusste Hürde gegen versehentliches Doppelt-Seeden).
 *
 * Aufruf:  node scripts/seed-from-index-html.mjs [--force] [pfad/zu/index.html]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { pool } from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const force = args.includes('--force');
const indexPath = args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', '..', 'index.html');

// -- Parsing-Regeln 1:1 aus index.html übernommen (metaGenre/metaYear/metaRating/metaHtml),
// damit die Migration exakt dieselben Werte liefert, die die App bisher angezeigt hat.
function metaRating(meta) {
  const m = String(meta).match(/([0-9]+[.,][0-9]+)/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}
function metaYear(meta) {
  const parts = String(meta).split(' · ');
  const yearRe = /^(seit\s+)?\d{4}(\s*[–-]\s*\d{0,4})?$/;
  for (let i = 1; i < parts.length; i++) {
    const t = parts[i].trim();
    if (yearRe.test(t)) {
      const mm = t.match(/\d{4}/);
      return mm ? parseInt(mm[0], 10) : null;
    }
  }
  return null;
}
function metaGenre(meta) {
  const parts = String(meta).split('·');
  return parts[1] ? parts[1].trim() : '';
}
// "Extra"-Teil aus metaHtml(): alles außer Rating, Genre, Jahr und Mini-Serie-Flag.
// Bei Filmen ist das i.d.R. der Originaltitel.
function metaExtra(meta) {
  const parts = String(meta).split(' · ');
  parts.shift(); // rating
  if (parts.length) parts.shift(); // genre
  const yearRe = /^(seit\s+)?\d{4}\s*([–-]\s*\d{0,4})?$/;
  for (let i = 0; i < parts.length; i++) {
    if (yearRe.test(parts[i].trim())) {
      parts.splice(i, 1);
      break;
    }
  }
  for (let j = 0; j < parts.length; j++) {
    if (/mini[\s-]?serie/i.test(parts[j].trim())) {
      parts.splice(j, 1);
      break;
    }
  }
  return parts.join(' · ').trim() || null;
}

function extractLineBlock(text, startMarker, fromIndex) {
  const start = text.indexOf(startMarker, fromIndex);
  if (start === -1) throw new Error(`Marker nicht gefunden: ${startMarker}`);
  const end = text.indexOf('\n', start);
  return { text: text.slice(start, end === -1 ? undefined : end), end: end === -1 ? text.length : end };
}

function extractArrayBlock(text, startMarker, fromIndex) {
  const start = text.indexOf(startMarker, fromIndex);
  if (start === -1) throw new Error(`Marker nicht gefunden: ${startMarker}`);
  const closeIdx = text.indexOf('\n];', start);
  if (closeIdx === -1) throw new Error(`Array-Ende nicht gefunden für: ${startMarker}`);
  const end = closeIdx + '\n];'.length;
  return { text: text.slice(start, end), end };
}

function loadEmbeddedData(html) {
  const filme = extractArrayBlock(html, 'const FILME = [', 0);
  const serien = extractArrayBlock(html, 'const SERIEN = [', filme.end);
  const details = extractLineBlock(html, 'const DETAILS = {', serien.end);
  const cand = extractLineBlock(html, 'const CAND=', details.end);

  const src = `${filme.text}\n${serien.text}\n${details.text}\n${cand.text}\nmodule.exports = { FILME, SERIEN, DETAILS, CAND };`;
  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'index-html-data.js' }).runInContext(sandbox);
  return sandbox.module.exports;
}

function stripHash(tag) {
  return String(tag).replace(/^#+/, '').trim();
}

function buildCatalogRows(FILME, SERIEN, DETAILS) {
  const rows = [];
  const fromList = (list, details, type) => {
    list.forEach(([title, meta], i) => {
      const d = details[i] || {};
      rows.push({
        tmdbId: null,
        type,
        title,
        originalTitle: metaExtra(meta),
        year: metaYear(meta),
        genres: [metaGenre(meta)].filter(Boolean),
        director: d.d || null,
        cast: Array.isArray(d.c) ? d.c : [],
        keywords: Array.isArray(d.h) ? d.h.map(stripHash).filter(Boolean) : [],
        rating: metaRating(meta),
        plot: d.p || null,
        posterPath: null,
        posterBase64: d.poster || null,
        source: 'catalog',
      });
    });
  };
  fromList(FILME, DETAILS.filme || [], 'movie');
  fromList(SERIEN, DETAILS.serien || [], 'series');
  return rows;
}

function buildCandRows(CAND) {
  const rows = [];
  const fromList = (list, type) => {
    (list || []).forEach((c) => {
      rows.push({
        tmdbId: Number(c.id),
        type,
        title: c.t,
        originalTitle: null,
        year: c.y || null,
        genres: Array.isArray(c.g) ? c.g : [],
        director: c.d || null,
        cast: Array.isArray(c.c) ? c.c : [],
        keywords: Array.isArray(c.kw) ? c.kw : [],
        rating: c.r != null ? c.r : null,
        plot: c.ov || null,
        posterPath: c.p || null,
        posterBase64: null,
        source: 'discovery',
      });
    });
  };
  fromList(CAND.f, 'movie');
  fromList(CAND.s, 'series');
  return rows;
}

async function insertCatalogRow(client, row) {
  await client.query(
    `INSERT INTO titles (tmdb_id, type, title, original_title, year, genres, director, cast_names, keywords, rating, plot, poster_path, poster_base64, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      row.tmdbId,
      row.type,
      row.title,
      row.originalTitle,
      row.year,
      row.genres,
      row.director,
      row.cast,
      row.keywords,
      row.rating,
      row.plot,
      row.posterPath,
      row.posterBase64,
      row.source,
    ]
  );
}

async function upsertCandRow(client, row) {
  await client.query(
    `INSERT INTO titles (tmdb_id, type, title, original_title, year, genres, director, cast_names, keywords, rating, plot, poster_path, poster_base64, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (tmdb_id) DO NOTHING`,
    [
      row.tmdbId,
      row.type,
      row.title,
      row.originalTitle,
      row.year,
      row.genres,
      row.director,
      row.cast,
      row.keywords,
      row.rating,
      row.plot,
      row.posterPath,
      row.posterBase64,
      row.source,
    ]
  );
}

async function main() {
  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS n FROM titles');
  if (countRows[0].n > 0 && !force) {
    console.error(
      `titles enthält bereits ${countRows[0].n} Zeilen. Erneutes Seeden würde Duplikate erzeugen ` +
        `(FILME/SERIEN-Einträge haben keine tmdb_id als Deduplizierungs-Schlüssel).\n` +
        `Mit --force erzwingen (nur auf einer frisch migrierten/leeren DB sinnvoll).`
    );
    process.exit(1);
  }

  console.log(`Lese eingebettete Daten aus ${indexPath} ...`);
  const html = readFileSync(indexPath, 'utf8');
  const { FILME, SERIEN, DETAILS, CAND } = loadEmbeddedData(html);
  console.log(`FILME: ${FILME.length}, SERIEN: ${SERIEN.length}, CAND.f: ${(CAND.f || []).length}, CAND.s: ${(CAND.s || []).length}`);

  const catalogRows = buildCatalogRows(FILME, SERIEN, DETAILS);
  const candRows = buildCandRows(CAND);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of catalogRows) await insertCatalogRow(client, row);
    for (const row of candRows) await upsertCandRow(client, row);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`Fertig: ${catalogRows.length} Katalog-Titel + bis zu ${candRows.length} Discovery-Kandidaten geschrieben.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Seed fehlgeschlagen:', err);
  process.exit(1);
});
