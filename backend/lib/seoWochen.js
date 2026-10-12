// Reine Logik der Wochen-Seiten ("Neu auf <Anbieter>", "Neu im Kino"): Fenster,
// Schwellen, Importtag-Filter. Kein DB-Zugriff; seoData.js laedt, seoRender.js
// zeigt an. Die Seiten rechnen bei jedem Cache-Aufbau neu, es wird nichts
// gespeichert und kein Cron gebraucht.

export const TAGE_KURZ = 7;
export const TAGE_LANG = 14;
// Streaming: darunter wird das Fenster auf 14 Tage erweitert, danach noindex.
export const MIN_NEU_STREAMING = 5;
// Kino: kleinere Schwelle, es starten pro Woche nur wenige Filme.
export const MIN_NEU_KINO = 3;

// Importtag-Regel: first_seen_at ist DEFAULT now() je Zeile, der Erstimport
// eines Anbieters schreibt tausende Zeilen auf einen Tag (zurueckdatiert oder
// nicht, siehe routes/streaming.js). Ein Tag zaehlt als Import-Artefakt, wenn
// er mehr als 30 % aller Zeilen des Anbieters in der Region traegt UND
// mindestens 50 Zeilen hat (damit ein kleiner Anbieter mit wenigen Zeilen
// nicht wegen eines normalen Tages komplett ausfaellt). Gemessen 12.10.2026:
// Erstimporttage tragen 77-100 %, normale Spitzentage maximal ~5 %.
export const IMPORT_TAG_ANTEIL = 0.3;
export const IMPORT_TAG_MIN_ZEILEN = 50;

export function istImportTag(zeilenAmTag, zeilenGesamt) {
  if (!zeilenGesamt || zeilenAmTag < IMPORT_TAG_MIN_ZEILEN) return false;
  return zeilenAmTag / zeilenGesamt > IMPORT_TAG_ANTEIL;
}

const TAG_MS = 24 * 3_600_000;

// Streaming-Fenster: Eintraege { datum: Date|ms, ... } -> { tage, eintraege,
// indexierbar }. 7 Tage; unter MIN_NEU_STREAMING auf 14 erweitern; bleibt es
// darunter, indexierbar=false (Seite bleibt erreichbar, noindex,follow).
export function streamingFenster(eintraege, jetzt = Date.now(), mindest = MIN_NEU_STREAMING) {
  const jetztMs = +jetzt;
  const imFenster = (tage) => eintraege.filter((e) => {
    const t = +e.datum;
    return t <= jetztMs && t > jetztMs - tage * TAG_MS;
  });
  let tage = TAGE_KURZ;
  let treffer = imFenster(tage);
  if (treffer.length < mindest) { tage = TAGE_LANG; treffer = imFenster(tage); }
  return { tage, eintraege: treffer, indexierbar: treffer.length >= mindest };
}

// Datumsrechnung auf 'YYYY-MM-DD'-Strings (Kalendertage, zeitzonenfrei).
function tagNr(iso) {
  const [j, m, t] = iso.split('-').map(Number);
  return Math.round(Date.UTC(j, m - 1, t) / TAG_MS);
}
export function tageZwischen(vonIso, bisIso) {
  return tagNr(bisIso) - tagNr(vonIso);
}

// Heutiges Datum in Berlin als 'YYYY-MM-DD'.
export function heuteBerlin(jetzt = Date.now()) {
  return new Date(jetzt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

// '2026-10-12' -> '12.10.2026'
export function datumDeutsch(iso) {
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

// Kino: Eintraege { start: 'YYYY-MM-DD', ... }. "Gestartet" = die letzten 7
// Tage inkl. heute (bei weniger als MIN_NEU_KINO: 14 Tage), "naechste Woche" =
// morgen bis in 7 Tagen. Index nur, wenn genug Neustarts dabei sind.
export function kinoFenster(eintraege, heute, mindest = MIN_NEU_KINO) {
  const alter = (e) => tageZwischen(e.start, heute);   // >0 Vergangenheit
  const gestartet = (tage) => eintraege.filter((e) => alter(e) >= 0 && alter(e) < tage);
  let tage = TAGE_KURZ;
  let jetzt = gestartet(tage);
  if (jetzt.length < mindest) { tage = TAGE_LANG; jetzt = gestartet(tage); }
  const bald = eintraege.filter((e) => alter(e) < 0 && alter(e) >= -TAGE_KURZ);
  return { tage, gestartet: jetzt, naechste: bald, indexierbar: jetzt.length >= mindest };
}

export function fensterWort(tage) {
  return tage === TAGE_KURZ ? 'den letzten 7 Tagen' : `den letzten ${tage} Tagen`;
}

export function anzahlWort(n, einzahl, mehrzahl) {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`;
}

// Einleitung "Neu auf <Anbieter>": nur aus berechneten Zahlen, Datum wird
// bei jedem Aufbau frisch eingesetzt.
export function streamingEinleitung({ name, tage, filme, serien, stand }) {
  if (!filme && !serien) {
    return `Stand ${datumDeutsch(stand)}: In den letzten ${tage} Tagen hat MovieMatch bei ${name} keine neuen Titel erkannt.`;
  }
  const teile = [];
  if (filme) teile.push(anzahlWort(filme, 'Film', 'Filme'));
  if (serien) teile.push(anzahlWort(serien, 'Serie', 'Serien'));
  return `Stand ${datumDeutsch(stand)}: In ${fensterWort(tage)} sind bei ${name} ${teile.join(' und ')} neu dazugekommen. `
    + `Als neu gilt ein Titel, den MovieMatch bei diesem Anbieter in Deutschland zum ersten Mal sieht; die Liste ist nach Bewertung sortiert.`;
}

export function kinoEinleitung({ tage, gestartet, naechste, stand }) {
  const teile = [`Stand ${datumDeutsch(stand)}: In ${fensterWort(tage)} sind ${anzahlWort(gestartet, 'Film', 'Filme')} in den deutschen Kinos gestartet`];
  if (naechste) teile.push(`in den nächsten 7 Tagen folgen ${anzahlWort(naechste, 'weiterer Start', 'weitere Starts')}`);
  return teile.join(', ') + '. Grundlage sind die Kinostarttermine in Deutschland, inklusive Wiederaufführungen.';
}
