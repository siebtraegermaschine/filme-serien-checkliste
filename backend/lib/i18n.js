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
// EU-Blaupause; alle weiteren sind nach demselben Muster angebunden
// (Workflow-Matrix, TMDB_CERT_REGIONS, Frontend-Regionsauswahl, PLZ/Kino-
// Importe -- siehe PLAN-INTERNATIONALISIERUNG.md Abschnitt 9). Streaming
// (streaming.yml) und Kino (cinema.yml) laufen TAEGLICH fuer alle Regionen
// in je einer Kette -- moeglich, seit stream-fetch.mjs bereits frisch
// angereicherte Titel per Skip-Liste ueberspringt. Fuer die Laender
// ausserhalb des EWR (US/CA/AU/NZ/MX/AR/CL/CO) steht die rechtliche
// Klaerung noch aus, siehe PLAN-INTERNATIONALISIERUNG.md Abschnitt 4.
export const REGIONEN = [
  'DE', 'AT', 'CH', 'GB', 'FR', 'IT', 'ES', 'NL',
  'PT', 'PL', 'DK', 'SE', 'NO', 'FI', 'BE', 'IE',
  'CZ', 'GR', 'HU', 'RO', 'BG', 'HR', 'SI', 'SK',
  'LT', 'LV', 'EE', 'LU', 'MT', 'CY', 'US', 'IS',
  'LI', 'CA', 'AU', 'NZ', 'MX', 'AR', 'CL', 'CO', 'BR',
];

// Sprachen, in denen Inhaltsdaten (Titel/Inhaltsangaben) vorliegen koennen:
// Deutsch in den Stammspalten, Englisch in title_en/overview_en, der Rest im
// JSONB `uebersetzungen`. Muss zu INHALTS_SPRACHEN in den Fetch-Skripten
// passen (pt liegt schon in den Daten, die Oberflaeche folgt).
export const INHALTS_SPRACHEN = ['de', 'en', 'fr', 'es', 'it', 'nl', 'pt'];

export function sprachWahl(wert) {
  return INHALTS_SPRACHEN.includes(wert) ? wert : 'de';
}

export function regionWahl(wert) {
  const r = String(wert || '').toUpperCase();
  return REGIONEN.includes(r) ? r : 'DE';
}

// Titel/Text in der gewuenschten Sprache. Rueckfallkette fuer alle
// Nicht-de-Sprachen: Wunschsprache (aus dem JSONB `uebersetzungen`,
// feld 't' oder 'ov') -> Englisch -> Deutsch. Die beiden letzten Parameter
// sind optional -- Aufrufer ohne JSONB-Spalte verhalten sich wie bisher
// (Englisch oder Deutsch).
export function sprachFeld(sprache, deWert, enWert, uebersetzungen, feld) {
  if (sprache === 'de') return deWert;
  const u = uebersetzungen && uebersetzungen[sprache];
  if (sprache !== 'en' && u && feld && u[feld]) return u[feld];
  return enWert || deWert;
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
