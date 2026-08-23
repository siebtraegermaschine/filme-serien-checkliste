/*
 * Live-Zwischenstaende fuer den Sport-Bereich (Christian, 23.08.2026):
 * Waehrend Spiele laufen, holt der Server alle 90 Sekunden den Stand von
 * OpenLigaDB und schreibt ihn in sport_matches -- App und SEO-Spielseiten
 * lesen ihn von dort (lib/seoSport.js zeigt "Zwischenstand" von selbst an).
 *
 * Bewusst NUR der Server pollt (nicht die Browser der Besucher): OpenLigaDB
 * ist eine kostenlose Community-API, hunderte Clients im Minutentakt waeren
 * unanstaendig. Und bewusst nur Staende, die OpenLigaDB wirklich gemeldet
 * hat (Tore-Liste bzw. Abpfiff) -- laeuft die Pflege eines Spiels hinterher,
 * bleibt es beim schlichten "Live" statt eines falschen Zwischenstands.
 */
import { pool } from '../db/pool.js';

const OLB = 'https://api.openligadb.de';
const TAKT_MS = 90_000;
// Wie lange nach Anstoss ein Spiel als "laeuft womoeglich noch" gilt:
// 200 Minuten decken Nachspielzeit und Pokal-Verlaengerung samt Elfmeterschiessen.
const FENSTER = '200 minutes';

async function olbSpiel(matchId) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${OLB}/getmatchdata/${matchId}`, {
      signal: ctrl.signal, headers: { Accept: 'application/json' },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* Der belegte Stand eines OpenLigaDB-Spiels -- oder null, wenn (noch) keiner
 * gemeldet ist. Waehrend des Spiels steht der aktuelle Stand am letzten
 * Eintrag der Tore-Liste; nach Abpfiff zaehlt das Endergebnis
 * (resultTypeID 2). Ein leeres goals-Array heisst "0:0 ODER niemand
 * pflegt mit" -- nicht unterscheidbar, deshalb dann kein Stand. */
export function standAusOlbSpiel(m) {
  if (!m || typeof m !== 'object') return null;
  if (m.matchIsFinished) {
    const alle = Array.isArray(m.matchResults) ? m.matchResults : [];
    const ende = alle.find((r) => r.resultTypeID === 2) || alle[alle.length - 1];
    if (!ende || ende.pointsTeam1 == null) return null;
    return { heim: ende.pointsTeam1, gast: ende.pointsTeam2, beendet: true };
  }
  const tore = Array.isArray(m.goals) ? m.goals.filter((g) => g && g.scoreTeam1 != null) : [];
  if (!tore.length) return null;
  const letztes = tore[tore.length - 1];
  return { heim: letztes.scoreTeam1, gast: letztes.scoreTeam2, beendet: false };
}

let laeuft = false;

async function tick() {
  if (laeuft) return;   // ein haengender Lauf soll sich nicht stapeln
  laeuft = true;
  try {
    const { rows } = await pool.query(
      `SELECT external_id FROM sport_matches
        WHERE beendet = false AND anstoss <= now() AND anstoss > now() - $1::interval`,
      [FENSTER]);
    for (const { external_id } of rows) {
      const stand = standAusOlbSpiel(await olbSpiel(external_id));
      if (!stand) continue;
      // Nur schreiben, wenn sich wirklich etwas geaendert hat -- sonst
      // wuerde jede Minute eine leere Schreiblast anfallen.
      await pool.query(
        `UPDATE sport_matches
            SET tore_heim = $2, tore_gast = $3, beendet = $4
          WHERE external_id = $1
            AND (tore_heim IS DISTINCT FROM $2 OR tore_gast IS DISTINCT FROM $3
                 OR beendet IS DISTINCT FROM $4)`,
        [external_id, stand.heim, stand.gast, stand.beendet]);
    }
  } catch (err) {
    console.error('Sport-Live-Ticker:', err.message);
  } finally {
    laeuft = false;
  }
}

export function starteSportLive() {
  setInterval(tick, TAKT_MS);
}
