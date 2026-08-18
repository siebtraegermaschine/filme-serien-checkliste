// Prueft die Inhaltsangaben der Tabelle `titles` auf Fragmente und klaert, ob
// sie beim Import abgeschnitten wurden.
//
// Hintergrund (18.08.2026): Rund 18 Prozent der deutschen Inhaltsangaben ueber
// 250 Zeichen enden auf "..." oder ganz ohne Satzzeichen. Der Verdacht war eine
// Kuerzung im Import. Ein Abgleich von 250 Stichproben gegen die TMDB-API hat
// das widerlegt: Die gespeicherten Texte sind zeichengleich mit dem, was TMDB
// heute liefert. Die Auslassungspunkte stehen so in der Quelle -- die
// deutschsprachige TMDB-Gemeinschaft schreibt Inhaltsangaben haeufig als
// Cliffhanger. Ein Nachladen von TMDB aendert daher nichts.
//
// Das Skript bleibt als Beleg und fuer erneute Pruefungen bestehen:
//
//   node scripts/plot-quellen-pruefen.mjs               # Messung ueber alle Titel
//   node scripts/plot-quellen-pruefen.mjs --stichprobe 50   # Abgleich gegen TMDB
//
// Nur lesend -- das Skript schreibt nichts in die Datenbank.

import { pool } from '../db/pool.js';
import { inhaltsangabe, istFragment, SPRACHEN } from './seo-batch.mjs';

const rumpf = (s) => s.replace(/(\.\.\.|…)\s*$/, '').trim();

const HAUPTLAND = { de: 'DE', en: 'US', es: 'ES', fr: 'FR', it: 'IT', nl: 'NL', pt: 'BR' };

async function tmdb(pfad, params = {}) {
  const u = new URL(`https://api.themoviedb.org/3${pfad}`);
  u.searchParams.set('api_key', process.env.TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let versuch = 0; versuch < 5; versuch++) {
    const r = await fetch(u);
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 2000)); continue; }
    if (!r.ok) throw new Error(`TMDB ${r.status} ${pfad}`);
    return r.json();
  }
  throw new Error(`TMDB dauerhaft 429: ${pfad}`);
}

function besteFassung(uebersetzungen, sprache) {
  const k = (uebersetzungen || []).filter((u) => u.iso_639_1 === sprache && u.data && u.data.overview);
  const b = k.find((u) => u.iso_3166_1 === HAUPTLAND[sprache]) || k[0];
  return b ? b.data.overview.trim() : '';
}

// --- Abgleich gegen TMDB ----------------------------------------------------
// Zieht auffaellige Zeilen und vergleicht sie Zeichen fuer Zeichen mit der API.
async function stichprobe(anzahl) {
  if (!process.env.TMDB_API_KEY) { console.error('TMDB_API_KEY fehlt.'); process.exit(1); }
  const { rows } = await pool.query(`
    SELECT id, tmdb_id, type, title, plot, overview_en, uebersetzungen
    FROM titles
    WHERE plot IS NOT NULL AND length(plot) > 250
      AND (plot LIKE '%...' OR plot LIKE '%…' OR right(plot, 1) !~ '[.!?…")»'']')
    ORDER BY md5(id::text) LIMIT $1`, [anzahl]);

  console.log(`${rows.length} auffaellige Zeilen gegen TMDB abgeglichen.\n`);
  const zaehler = {};
  for (const r of rows) {
    const art = r.type === 'series' ? 'tv' : 'movie';
    let d;
    try { d = await tmdb(`/${art}/${r.tmdb_id}`, { language: 'de-DE', append_to_response: 'translations' }); }
    catch (e) { zaehler.FEHLER = (zaehler.FEHLER || 0) + 1; console.log(`FEHLER ${r.tmdb_id}: ${e.message}`); continue; }

    const db = r.plot.trim();
    const de = (d.overview || '').trim();
    let urteil;
    if (de === db) urteil = 'identisch mit TMDB';
    else if (!de) urteil = 'TMDB hat keinen deutschen Text (Zeile haelt Fremdsprache)';
    else if (de.length > db.length && de.startsWith(rumpf(db))) urteil = 'TMDB IST LAENGER -- ZEILE ABGESCHNITTEN';
    else urteil = 'abweichend (TMDB-Text wurde geaendert)';
    zaehler[urteil] = (zaehler[urteil] || 0) + 1;

    if (urteil.includes('ABGESCHNITTEN')) {
      console.log(`${r.type}:${r.tmdb_id} ${r.title}: ${db.length} -> ${de.length} Zeichen`);
    }
  }
  console.log('\n--- Ergebnis ---');
  for (const [k, v] of Object.entries(zaehler).sort((a, b) => b[1] - a[1])) {
    console.log(`${String(v).padStart(5)}  ${k}`);
  }
}

// --- Messung ----------------------------------------------------------------
// Zaehlt nicht die Rohspalten, sondern die Quelle, die der SEO-Generator je
// Titel tatsaechlich waehlt (inhaltsangabe() aus seo-batch.mjs). Nur das
// entscheidet ueber die Qualitaet der erzeugten Texte.
async function messung() {
  const { rows } = await pool.query('SELECT plot, overview_en, uebersetzungen FROM titles');
  console.log(`${rows.length} Titel geladen.\n`);
  console.log('Locale   Quellen>250   fragmentarisch   davon vollstaendig ersetzbar');
  for (const locale of Object.keys(SPRACHEN)) {
    let ueber250 = 0, fragmente = 0, ersetzbar = 0;
    for (const t of rows) {
      const gewaehlt = inhaltsangabe(t, locale);
      if (!gewaehlt || gewaehlt.length <= 250) continue;
      ueber250++;
      if (!istFragment(gewaehlt)) continue;
      fragmente++;
      // Gibt es eine gleich lange (>= 67 Prozent), aber vollstaendige Fassung?
      const alternativen = [t.plot, t.overview_en, ...Object.values(t.uebersetzungen || {}).map((v) => v && v.ov)]
        .filter((s) => s && s.length > 250 && !istFragment(s) && s.length >= gewaehlt.length * 0.67);
      if (alternativen.length) ersetzbar++;
    }
    const anteil = `${(fragmente / ueber250 * 100).toFixed(1)}%`;
    console.log(`${locale}   ${String(ueber250).padStart(9)}   ${String(fragmente).padStart(8)} ${anteil.padStart(6)}   ${String(ersetzbar).padStart(24)}`);
  }
}

const i = process.argv.indexOf('--stichprobe');
if (i !== -1) await stichprobe(Number(process.argv[i + 1] || 50));
else await messung();
await pool.end();
