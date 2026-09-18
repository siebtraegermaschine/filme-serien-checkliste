#!/usr/bin/env node
// Schneidet priorisierte Personen in Arbeitspakete fuer die redaktionelle
// Texterstellung -- Pendant zu seo-pakete.mjs fuer Titeltexte, siehe
// seo-auftrag-personen.md und STATUS.md.
//
// Eine Person mit Regie- UND Besetzungscredits bekommt zwei Pakete-Eintraege
// (rolle 'regisseur' und 'schauspieler'), je mit ihrer eigenen, rollen-
// gefilterten Filmografie -- identisch zur Aufteilung in ladePersonSeite()
// (lib/seoData.js): zwei getrennte Seiten statt einer mit doppeltem Inhalt.
//
// Schluessel-Format fuer seo_content (bereich 'person'): `${rolle}:${tmdbPersonId}`.
//
// Ausschluesse:
//   - Priorisierungsschwelle: >=2 Titel im Katalog gesamt (STATUS.md, 18.09.2026)
//   - Keine Biografie im Cache -> kein Werdegang-Abschnitt moeglich, ausgelassen
//   - Namenskollisions-Plausibilitaetscheck (STATUS.md): Geburtsjahr nach dem
//     fruehesten Katalog-Titel oder weniger als 5 Jahre davor ist ein harter
//     Widerspruch (Person kann diesen Titel nicht gemacht haben) -- Hinweis auf
//     eine falsch aufgeloeste Person, wird ausgeschlossen statt riskiert.
//   - Bereits vorhandener seo_content-Eintrag fuer denselben Schluessel/Sprache
//
// Aufruf:
//   node scripts/personen-pakete.mjs --pakete 6 --je 15
//   node scripts/personen-pakete.mjs --locale de-de --pakete 8 --je 20 --ziel /tmp/pakete
//
// Optionen:
//   --locale CODE    Zielsprache (Standard de-de)
//   --pakete N       Zahl der Pakete (Standard 6)
//   --je N           Personen-Rollen je Paket (Standard 15)
//   --min-titel N    Priorisierungsschwelle, Titel gesamt (Standard 2)
//   --ziel PFAD      Ablageort (Standard scripts/.personen-pakete)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db/pool.js';
import { datensatzPerson } from './seo-personen-check.mjs';

const NOTE_SQL = `CASE WHEN COALESCE(rating, 0) = 0 THEN 0
  ELSE (COALESCE(vote_count, 0)::float / (COALESCE(vote_count, 0) + 1000)) * rating
     + (1000::float / (COALESCE(vote_count, 0) + 1000)) * 6.76 END`;

function argumente() {
  const a = process.argv.slice(2);
  const hol = (n, s) => { const i = a.indexOf(`--${n}`); return i >= 0 && a[i + 1] && !a[i + 1].startsWith('--') ? a[i + 1] : s; };
  return {
    locale: hol('locale', 'de-de'),
    pakete: Number(hol('pakete', '6')),
    je: Number(hol('je', '15')),
    minTitel: Number(hol('min-titel', '2')),
    ziel: hol('ziel', path.join(import.meta.dirname, '.personen-pakete')),
  };
}

// Personen ueber der Priorisierungsschwelle, mit Biografie im Cache und ohne
// harten Namenskollisions-Widerspruch. Regie-/Besetzungsanzahl getrennt
// mitgezaehlt, damit main() daraus die passenden Rollen-Eintraege bildet.
async function kandidatenPersonen({ minTitel, limit }) {
  const { rows } = await pool.query(
    `WITH regie AS (
       SELECT director AS name, count(*) AS anzahl
         FROM titles WHERE director IS NOT NULL AND director <> '' GROUP BY director
     ),
     besetzung AS (
       SELECT unnest(cast_names) AS name, count(*) AS anzahl
         FROM titles WHERE cast_names IS NOT NULL GROUP BY unnest(cast_names)
     ),
     titelzahl AS (
       SELECT name, sum(anzahl) AS gesamt FROM (
         SELECT * FROM regie UNION ALL SELECT * FROM besetzung
       ) x GROUP BY name
     ),
     fruehestes AS (
       SELECT name, min(year) AS jahr FROM (
         SELECT director AS name, year FROM titles WHERE director IS NOT NULL AND director <> '' AND year IS NOT NULL
         UNION ALL
         SELECT unnest(cast_names) AS name, year FROM titles WHERE cast_names IS NOT NULL AND year IS NOT NULL
       ) x GROUP BY name
     )
     SELECT pr.name, pr.tmdb_person_id AS tmdb_id, pc.biografie, pc.geburtstag,
            coalesce(r.anzahl, 0) AS regie_anzahl, coalesce(b.anzahl, 0) AS besetzung_anzahl
       FROM personen_resolution pr
       JOIN titelzahl t ON t.name = pr.name
       JOIN personen_cache pc ON pc.tmdb_person_id = pr.tmdb_person_id
       LEFT JOIN regie r ON r.name = pr.name
       LEFT JOIN besetzung b ON b.name = pr.name
       LEFT JOIN fruehestes f ON f.name = pr.name
      WHERE pr.tmdb_person_id IS NOT NULL
        AND t.gesamt >= $1
        AND pc.biografie IS NOT NULL AND pc.biografie <> ''
        AND NOT (
              pc.geburtstag IS NOT NULL AND f.jahr IS NOT NULL
              AND (extract(year FROM pc.geburtstag)::int > f.jahr
                   OR f.jahr - extract(year FROM pc.geburtstag)::int < 5)
            )
      ORDER BY pr.tmdb_person_id
      LIMIT $2`,
    [minTitel, limit]
  );
  return rows;
}

async function filmografieFuerRolle(name, rolle) {
  const bedingung = rolle === 'regisseur' ? 'director = $1' : '$1 = ANY(cast_names)';
  const { rows } = await pool.query(
    `SELECT title, year, type, genres, rating FROM titles
      WHERE ${bedingung} ORDER BY ${NOTE_SQL} DESC LIMIT 24`,
    [name]
  );
  return rows;
}

async function bereitsVorhanden(schluessel, locale) {
  if (!schluessel.length) return new Set();
  const { rows } = await pool.query(
    `SELECT schluessel FROM seo_content WHERE bereich = 'person' AND locale = $1 AND schluessel = ANY($2)`,
    [locale, schluessel]
  );
  return new Set(rows.map((r) => r.schluessel));
}

async function main() {
  const opt = argumente();
  const gesamt = opt.pakete * opt.je;

  // Grosszuegig ueberziehen: eine Person kann zwei Rollen-Eintraege liefern,
  // und schon vorhandene seo_content-Eintraege fallen danach wieder heraus.
  const personen = await kandidatenPersonen({ minTitel: opt.minTitel, limit: gesamt * 2 });
  if (!personen.length) { console.log('Keine priorisierten Personen ohne Ausschlussgrund gefunden.'); await pool.end(); return; }

  const eintraege = [];
  for (const p of personen) {
    if (p.regie_anzahl > 0) eintraege.push({ p, rolle: 'regisseur' });
    if (p.besetzung_anzahl > 0) eintraege.push({ p, rolle: 'schauspieler' });
  }

  const schluessel = eintraege.map((e) => `${e.rolle}:${e.p.tmdb_id}`);
  const vorhanden = await bereitsVorhanden(schluessel, opt.locale);
  const offen = eintraege.filter((e) => !vorhanden.has(`${e.rolle}:${e.p.tmdb_id}`)).slice(0, gesamt);

  if (!offen.length) { console.log('Alle Kandidaten haben bereits einen seo_content-Eintrag.'); await pool.end(); return; }

  const geburtstagString = (wert) => {
    if (!wert) return null;
    const d = new Date(wert);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  fs.mkdirSync(opt.ziel, { recursive: true });
  for (const f of fs.readdirSync(opt.ziel)) {
    if (f.startsWith(`paket-${opt.locale}-`)) fs.unlinkSync(path.join(opt.ziel, f));
  }

  const geschrieben = [];
  for (let i = 0; i < opt.pakete; i++) {
    const teil = offen.slice(i * opt.je, (i + 1) * opt.je);
    if (!teil.length) break;
    const eintraegeMitDatensatz = [];
    for (const e of teil) {
      const filme = await filmografieFuerRolle(e.p.name, e.rolle);
      const person = {
        name: e.p.name,
        rolle: e.rolle === 'regisseur' ? 'Regisseur/in' : 'Schauspieler/in',
        geburtstag: geburtstagString(e.p.geburtstag),
        biografie: e.p.biografie,
        filmografie: filme.map((f) => ({ title: f.title, year: f.year, type: f.type, genres: f.genres || [], rating: f.rating })),
      };
      eintraegeMitDatensatz.push({
        schluessel: `${e.rolle}:${e.p.tmdb_id}`,
        anzeige: `${e.p.name} (${e.rolle})`,
        datensatz: datensatzPerson(person),
      });
    }
    const datei = path.join(opt.ziel, `paket-${opt.locale}-${String(i + 1).padStart(2, '0')}.json`);
    fs.writeFileSync(datei, JSON.stringify({ locale: opt.locale, personen: eintraegeMitDatensatz }, null, 2));
    geschrieben.push({ datei, anzahl: eintraegeMitDatensatz.length });
  }

  console.log(`${offen.length} offene Personen-Rollen in ${geschrieben.length} Pakete geschnitten (Sprache ${opt.locale}, Schwelle >= ${opt.minTitel} Titel):`);
  for (const g of geschrieben) console.log(`  ${g.anzahl.toString().padStart(3)} Eintraege  ${g.datei}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
