#!/usr/bin/env node
// Legt Redaktionstexte fuer alle Reihen (bereich 'reihe') und den Reihen-Hub
// (bereich 'hub', schluessel 'reihen') an. Deterministisch aus DB-Fakten, kein
// API-Aufruf, keine Kosten. Legt nur FEHLENDE Eintraege an.
//
// Aufruf (im Backend-Container):
//   node scripts/seo-reihen-texte.mjs [--dry-run] [--zeige 3]
import 'dotenv/config';
import { pool } from '../db/pool.js';
import { alleReihen } from '../lib/seoData.js';
import { bauReihenText } from '../lib/seoReihen.js';

const LOCALE = 'de-de';

export function bauHubText(anzahl) {
  return `Hier stehen ${anzahl} Filmreihen und Franchises aus dem MovieMatch-Katalog, jeweils mit allen Filmen in Erscheinungsreihenfolge. Zu jedem Film zeigen wir die Bewertung und, wo bekannt, in welchem Streaming-Abo er in Deutschland läuft. Die Reihen stammen aus den Sammlungen von TMDB; die Reihenfolge folgt dem Erscheinungsdatum und nicht zwingend der erzählten Handlung.`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const zi = process.argv.indexOf('--zeige');
  const zeige = zi >= 0 ? Number(process.argv[zi + 1]) || 3 : 0;
  const reihen = await alleReihen(LOCALE);
  let neu = 0, vorhanden = 0, gezeigt = 0;
  for (const r of reihen) {
    if (r.hatText) { vorhanden++; continue; }
    const text = bauReihenText(r.name, r.fakten);
    if (gezeigt < zeige) { gezeigt++; console.log(`\n${r.slug}:\n${text}`); }
    if (!dryRun) {
      await pool.query(
        `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('reihe', $1, $2, $3)
         ON CONFLICT (bereich, schluessel, locale) DO NOTHING`,
        [r.slug, LOCALE, text]
      );
    }
    neu++;
  }
  let hub = false;
  if (reihen.length) {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM seo_content WHERE bereich = 'hub' AND schluessel = 'reihen' AND locale = $1`, [LOCALE]
    );
    if (!rowCount) {
      hub = true;
      if (!dryRun) {
        await pool.query(
          `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('hub', 'reihen', $1, $2)
           ON CONFLICT (bereich, schluessel, locale) DO NOTHING`,
          [LOCALE, bauHubText(reihen.length)]
        );
      }
    }
  }
  console.log(`\nReihen gesamt ${reihen.length}: neu ${neu}${dryRun ? ' (Probelauf)' : ''}, schon mit Text ${vorhanden}, Hub-Text ${hub ? 'neu' : 'vorhanden'}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
