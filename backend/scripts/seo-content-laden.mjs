#!/usr/bin/env node
// Spielt NEUE Redaktionstexte aus seo-content-daten.mjs in seo_content ein.
//
// Maßgeblich ist die Datenbank, nicht diese Datei (Christian, 17.09.2026).
// Titeltexte entstehen und ändern sich laengst direkt in seo_content
// (Faecher-Runden, Bereinigungen, Korrekturen). Bis 17.09.2026 hat dieser Lauf
// jede bestehende Zeile mit dem Dateistand ueberschrieben -- 29 Titel waren
// damals in der Datenbank neuer als in der Datei und waeren still auf alte
// Fassungen zurueckgefallen.
//
// Deshalb jetzt:
//   - neue Eintraege werden angelegt,
//   - bestehende Zeilen bleiben unangetastet; abweichende werden nur gemeldet,
//   - ueberschrieben wird ausschliesslich, was ausdruecklich benannt ist
//     (--ueberschreiben movie:123,genre:drama:movie), mit Vorher/Nachher-Anzeige.
//
// Aufruf (im Backend-Container):
//   npm run seo-content
//   npm run seo-content -- --dry-run
//   npm run seo-content -- --ueberschreiben movie:497 [--dry-run]
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';
import { EINTRAEGE } from './seo-content-daten.mjs';

const woerter = (t) => t.replace(/^#{1,6}.*$/gm, '').split(/\s+/).filter(Boolean).length;

function argumente(argv) {
  const i = argv.indexOf('--ueberschreiben');
  const liste = i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '';
  return {
    dryRun: argv.includes('--dry-run'),
    ueberschreiben: new Set(liste.split(',').map((s) => s.trim()).filter(Boolean)),
  };
}

// Eigene Funktion, damit der Test sie ohne Kommandozeile gegen die Datenbank pruefen kann.
export async function ladeEintraege(db, eintraege, { dryRun = false, ueberschreiben = new Set(), log = console.log } = {}) {
  const ergebnis = { neu: 0, gleich: 0, abweichend: [], ueberschrieben: [] };
  for (const e of eintraege) {
    const { rows } = await db.query(
      `SELECT text FROM seo_content WHERE bereich = $1 AND schluessel = $2 AND locale = $3`,
      [e.bereich, e.schluessel, e.locale]
    );
    if (!rows.length) {
      if (!dryRun) {
        await db.query(
          `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ($1, $2, $3, $4)
           ON CONFLICT (bereich, schluessel, locale) DO NOTHING`,
          [e.bereich, e.schluessel, e.locale, e.text]
        );
      }
      ergebnis.neu++;
      continue;
    }
    if (rows[0].text === e.text) { ergebnis.gleich++; continue; }
    if (!ueberschreiben.has(e.schluessel)) { ergebnis.abweichend.push(e.schluessel); continue; }
    log(`\n${e.bereich} ${e.schluessel} (${e.locale}): Datenbank ${woerter(rows[0].text)} Woerter -> Datei ${woerter(e.text)} Woerter`);
    log(`  vorher: ${rows[0].text.slice(0, 200).replace(/\n/g, ' ')} …`);
    log(`  nachher: ${e.text.slice(0, 200).replace(/\n/g, ' ')} …`);
    if (!dryRun) {
      await db.query(
        `UPDATE seo_content SET text = $4, aktualisiert_am = now() WHERE bereich = $1 AND schluessel = $2 AND locale = $3`,
        [e.bereich, e.schluessel, e.locale, e.text]
      );
    }
    ergebnis.ueberschrieben.push(e.schluessel);
  }
  return ergebnis;
}

async function main() {
  const opt = argumente(process.argv.slice(2));
  const r = await ladeEintraege(pool, EINTRAEGE, opt);
  const nichtGefunden = [...opt.ueberschreiben].filter((k) => !EINTRAEGE.some((e) => e.schluessel === k));
  console.log(`\n${opt.dryRun ? 'Probelauf' : 'Ergebnis'}: ${r.neu} neu · ${r.gleich} unveraendert · ${r.ueberschrieben.length} ueberschrieben · ${r.abweichend.length} weichen ab und bleiben (Datenbank ist maßgeblich)`);
  if (r.abweichend.length) console.log(`  abweichend: ${r.abweichend.slice(0, 30).join(', ')}${r.abweichend.length > 30 ? ' …' : ''}`);
  if (nichtGefunden.length) console.log(`  --ueberschreiben ohne passenden Eintrag in der Datei: ${nichtGefunden.join(', ')}`);
  await pool.end();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
