// Regeln fuer lokalisierte Titel ohne offizielle TMDB-Uebersetzung (rein, ohne DB).
// Gelesen wird im Frontend ueber anzeigeTitel (seoData.js): Wunschsprache -> title_en -> title.

export const ZIEL_SPRACHEN = ['fr', 'es', 'it', 'nl', 'pt'];

// Nur lateinische Schrift (inkl. Akzente, Ziffern, Satzzeichen). Gemischt mit
// anderen Schriften -> false, dann entscheidet kein Automatismus.
export function istLateinisch(s) {
  const t = String(s || '').trim();
  if (!t || !/[\p{Script=Latin}\p{N}]/u.test(t)) return false;   // reine Zahlen ("1899", "8½") sind schriftneutral
  return !/[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}]/u.test(t);
}

const leer = (v) => !v || !String(v).trim();

// Deterministischer englischer Titel: gibt es keinen, ist der lateinisch
// geschriebene Originaltitel das, was TMDB selbst fuer en-US anzeigt.
// Bestehende Werte werden nie ersetzt. Rueckgabe: String oder null.
export function englischAusOriginal(zeile) {
  if (!leer(zeile.title_en)) return null;
  const o = String(zeile.original_title || '').trim();
  return istLateinisch(o) ? o : null;
}

// Pruefung eines von Hand/Subagent vorgeschlagenen Titels. Wirft nicht, liefert Grund oder null.
export function vorschlagFehler(wert) {
  if (typeof wert !== 'string') return 'kein Text';
  const t = wert.trim();
  if (!t) return 'leer';
  if (t.length > 200) return 'zu lang';
  if (!istLateinisch(t)) return 'nicht lateinisch';
  if (/[<>]/.test(t)) return 'Markup';
  return null;
}
