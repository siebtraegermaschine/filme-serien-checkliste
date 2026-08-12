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

// Regionen, fuer die tatsaechlich Daten eingespielt werden. AT ist die
// EU-Blaupause; weitere Laender kommen hier dazu, sobald deren Ingest laeuft.
export const REGIONEN = ['DE', 'AT'];

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
// faellt sie ebenfalls auf den DE-Wert zurueck: die Systeme sind verwandt
// (beide numerisch), und "keine Angabe" wuerde den Familienfilter sonst fast
// alles ausblenden lassen, solange der Backfill fuer das Land noch laeuft.
export function freigabeFuer(region, certifications, certificationDe) {
  const map = certifications || {};
  return map[region] || map.DE || certificationDe || null;
}
