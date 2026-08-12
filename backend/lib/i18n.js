/*
 * Gemeinsame Helfer fuer Sprache und Region (siehe PLAN-INTERNATIONALISIERUNG.md).
 *
 * Sprache ('de' | 'en') bestimmt, welche Fassung von Titel/Inhaltsangabe die
 * Antwort traegt -- fehlt die englische, bleibt die deutsche stehen (besser ein
 * deutscher Text als gar keiner, siehe Weg A im Plan).
 *
 * Region (ISO 3166-1, z.B. 'DE'/'AT') bestimmt Streaming-Verfuegbarkeit,
 * Kinostarts und Altersfreigabe. Unbekannte Regionen fallen auf DE zurueck,
 * damit ein manipulierter Parameter nie eine leere/fehlerhafte Antwort erzwingt.
 */

// Regionen, fuer die tatsaechlich Daten eingespielt werden. AT war die
// EU-Blaupause; CH/GB/FR/IT/ES/NL sind nach demselben Muster angebunden
// (Workflow-Matrix, TMDB_CERT_REGIONS, Frontend-Regionsauswahl, PLZ/Kino-
// Importe -- siehe PLAN-INTERNATIONALISIERUNG.md Abschnitt 9).
export const REGIONEN = ['DE', 'AT', 'CH', 'GB', 'FR', 'IT', 'ES', 'NL'];

export function sprachWahl(wert) {
  return wert === 'en' ? 'en' : 'de';
}

export function regionWahl(wert) {
  const r = String(wert || '').toUpperCase();
  return REGIONEN.includes(r) ? r : 'DE';
}

// Titel/Text in der gewuenschten Sprache, mit deutschem Rueckfall.
export function sprachFeld(sprache, deWert, enWert) {
  return sprache === 'en' && enWert ? enWert : deWert;
}

// Altersfreigabe fuer die Region aus der JSONB-Spalte `certifications`;
// Rueckfall auf die alte DE-Spalte `certification`. Fuer Nicht-DE-Regionen
// faellt sie ebenfalls auf den DE-Wert zurueck -- bewusst: "keine Angabe"
// wuerde den Familienfilter sonst fast alles ausblenden lassen, solange der
// Freigaben-Backfill fuer das Land noch laeuft. Passt der DE-Wert nicht ins
// Freigabesystem des Landes (etwa FSK "16" bei GB), behandelt ihn das
// Frontend als fehlende Angabe -- der Filter bleibt also auf der sicheren
// Seite. Der Backfill (backfill-english.mjs --nur-freigaben) schreibt fuer
// "bei TMDB nachgesehen, nichts gefunden" einen Leerstring je Region; der
// ist falsy und faellt hier ebenfalls auf DE zurueck.
export function freigabeFuer(region, certifications, certificationDe) {
  const map = certifications || {};
  return map[region] || map.DE || certificationDe || null;
}
