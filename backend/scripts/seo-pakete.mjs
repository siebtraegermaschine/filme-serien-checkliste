#!/usr/bin/env node
// Schneidet offene Titel in Arbeitspakete und schreibt sie als JSON-Dateien.
// Gegenstueck zu seo-einspielen.mjs: Was hier herausfaellt, wird von mehreren
// Bearbeitern parallel getextet und dort wieder eingesammelt.
//
// Der Weg ueber Dateien statt ueber die API ist Absicht: So laeuft die
// Texterstellung ueber das bestehende Abo statt ueber eine getrennt
// abgerechnete Schnittstelle. Quelle, Faktenregel und Formatpruefung bleiben
// dieselben wie in seo-batch.mjs -- die Regeln haengen nicht am Transportweg.
//
// Aufruf:
//   node scripts/seo-pakete.mjs --pakete 6 --je 15
//   node scripts/seo-pakete.mjs --locale es-es --pakete 8 --je 20 --ziel /tmp/pakete
//
// Optionen:
//   --locale CODE    Zielsprache (Standard de-de)
//   --pakete N       Zahl der Pakete (Standard 6)
//   --je N           Titel je Paket (Standard 15)
//   --stufe B|C      B = Plot>250 und >=4 Darsteller (Standard), C = Plot>150 und >=3
//   --min-votes N    Nur Titel ab dieser Stimmenzahl (Standard 0)
//   --ziel PFAD      Ablageort (Standard scripts/.pakete)
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
    pakete: Number(hol('pakete', '6')),
    je: Number(hol('je', '15')),
    stufe: hol('stufe', 'B').toUpperCase(),
    minVotes: Number(hol('min-votes', '0')),
    ziel: hol('ziel', path.join(import.meta.dirname, '.pakete')),
  };
}

// Dieselbe Auswahl wie seo-batch.mjs. Bewusst dupliziert statt importiert:
// Das Batchskript exportiert seine Abfrage nicht, und eine zweite Fassung mit
// eigenem Kommentar ist hier ehrlicher als ein Umbau des anderen Skripts.
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

async function main() {
  const opt = argumente();
  if (!SPRACHEN[opt.locale]) {
    console.error(`Unbekannte Sprache ${opt.locale}. Bekannt: ${Object.keys(SPRACHEN).join(', ')}`);
    process.exit(1);
  }
  const gesamt = opt.pakete * opt.je;
  const liste = await kandidaten({ ...opt, limit: gesamt });
  if (!liste.length) { console.log('Keine offenen Kandidaten.'); await pool.end(); return; }

  fs.mkdirSync(opt.ziel, { recursive: true });
  // Alte Pakete derselben Sprache entfernen, damit kein Rest aus einem
  // frueheren Lauf versehentlich noch einmal bearbeitet wird.
  for (const f of fs.readdirSync(opt.ziel)) {
    if (f.startsWith(`paket-${opt.locale}-`)) fs.unlinkSync(path.join(opt.ziel, f));
  }

  const geschrieben = [];
  for (let i = 0; i < opt.pakete; i++) {
    const teil = liste.slice(i * opt.je, (i + 1) * opt.je);
    if (!teil.length) break;
    const datei = path.join(opt.ziel, `paket-${opt.locale}-${String(i + 1).padStart(2, '0')}.json`);
    fs.writeFileSync(datei, JSON.stringify({
      locale: opt.locale,
      abschnitte: SPRACHEN[opt.locale].abschnitte,
      sprache: SPRACHEN[opt.locale].sprache,
      titel: teil.map((t) => ({
        schluessel: `${t.type}:${t.tmdb_id}`,
        anzeige: `${t.title} (${t.year})`,
        datensatz: datensatz(t, opt.locale),
      })),
    }, null, 2));
    geschrieben.push({ datei, anzahl: teil.length });
  }

  console.log(`${liste.length} offene Titel in ${geschrieben.length} Pakete geschnitten (Sprache ${opt.locale}, Stufe ${opt.stufe}):`);
  for (const g of geschrieben) console.log(`  ${g.anzahl.toString().padStart(3)} Titel  ${g.datei}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
