/*
 * Radio-Reportagen zu den Spielen (Christian, 24.08.2026).
 *
 * Die ARD hat die Hoerfunkrechte an Bundesliga, 2. Liga und DFB-Pokal
 * (Vergabe 12/2024, Saisons 2025/26 bis 2028/29) und stellt JEDES Spiel
 * einzeln als kostenlosen Audiostream bereit. Wir VERLINKEN darauf -- mehr
 * nicht: Die ARD-Nutzungsbedingungen erlauben das Einbetten ausdruecklich nur
 * "zu privaten und nicht-kommerziellen Zwecken", ein eigener Play-Knopf waere
 * davon nicht gedeckt. Schlichtes Verlinken auf ein frei zugaengliches
 * Angebot ist dagegen unstreitig zulaessig.
 *
 * Quelle ist die oeffentliche API der ARD Audiothek. Sie liefert je Spiel
 * Titel, Startzeit (rund 15-20 Minuten vor Anpfiff), Dauer und eine fertige
 * Teilen-Adresse. Die rohen Stream-Adressen taugen NICHT zur Zuordnung: Sie
 * heissen "liga1spiel1" bis "liga1spiel9" und sind Sendeplaetze, die am
 * selben Tag mehrfach neu belegt werden.
 *
 * Zugeordnet wird ueber Anstosszeit UND Vereinsnamen -- die Schreibweisen
 * unterscheiden sich zwischen ARD und OpenLigaDB ("HEBC Hamburg" gegen
 * "Hamburg Eimsbuetteler BC"), deshalb der Wortvergleich unten.
 */

const API = 'https://api.ardaudiothek.de';
const TTL_MS = 60 * 60_000;          // Spielplaene aendern sich nicht stuendlich
const PROGRAMSETS = {
  bl1: '90781750',                   // Sportschau Bundesliga Live
  bl2: '10645071',                   // Sportschau 2. Bundesliga Live
  dfb: '10204177',                   // Sportschau DFB-Pokal Live
};

/* Woerter, die keinen Verein unterscheiden. "borussia" muss dabei sein --
   sonst gaelten Dortmund und Moenchengladbach als dasselbe Team. */
const FUELLWOERTER = new Set([
  'fc', 'sv', 'sc', 'tsv', 'tsg', 'vfl', 'vfb', 'vfr', 'spvgg', 'sg', 'sgd', 'bsc', 'bc',
  'fsv', 'msv', 'ksv', 'kfc', 'ssv', 'svw', 'borussia', 'eintracht', 'fortuna', 'hertha',
  'union', 'werder', 'arminia', 'dynamo', 'energie', 'viktoria', 'preussen', 'rot', 'weiss',
  'weiß', 'rot-weiss', 'rot-weiß', 'ii', 'u21', 'u23', 'und', 'gegen',
]);

export function woerter(name) {
  const alle = String(name || '')
    .toLowerCase()
    .replace(/[.,()]/g, ' ')
    .split(/[\s/-]+/)
    .map((w) => w.trim())
    .filter((w) => w && !/^\d+$/.test(w));
  const ohneFueller = alle.filter((w) => !FUELLWOERTER.has(w));
  /* Manche Vereine bestehen NUR aus Fuellwoertern -- "Hertha BSC" etwa
     schrumpfte damit auf nichts und passte zu keinem Spiel mehr. Dann
     zaehlen alle Woerter (Christian, 24.08.2026). */
  return new Set(ohneFueller.length ? ohneFueller : alle);
}

/* Gleiches Team? Ein gemeinsames unterscheidendes Wort genuegt -- zusammen
   mit der Anstosszeit ist das eindeutig genug. */
export function gleichesTeam(a, b) {
  const wa = woerter(a);
  const wb = woerter(b);
  for (const w of wa) if (wb.has(w)) return true;
  return false;
}

/* "VfL Osnabrück gegen Bayern München" -> ["VfL Osnabrück", "Bayern München"] */
export function titelTeams(titel) {
  const teile = String(titel || '').split(/\s+gegen\s+/i);
  return teile.length === 2 ? teile.map((t) => t.trim()) : null;
}

async function holeProgramSet(id) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${API}/programsets/${id}?limit=40`, {
      signal: ctrl.signal, headers: { Accept: 'application/json' },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const daten = await res.json();
    const nodes = daten?.data?.programSet?.items?.nodes || [];
    return nodes.map((n) => ({
      titel: n.title,
      teams: titelTeams(n.title),
      start: n.publicationStartDateAndTime ? new Date(n.publicationStartDateAndTime) : null,
      dauer: Number(n.duration) || 0,
      url: n.sharingUrl || null,
    })).filter((e) => e.teams && e.start && e.url);
  } catch {
    return [];
  }
}

let cache = { at: 0, eintraege: [] };

export async function audioEintraege() {
  if (Date.now() - cache.at < TTL_MS) return cache.eintraege;
  const listen = await Promise.all(Object.values(PROGRAMSETS).map(holeProgramSet));
  cache = { at: Date.now(), eintraege: listen.flat() };
  return cache.eintraege;
}

/* Passt ein Audio-Eintrag zu diesem Spiel? Die Reportage beginnt vor dem
   Anpfiff (meist 15-20 Minuten); das Fenster ist grosszuegig gewaehlt, damit
   auch Verlegungen um wenige Minuten noch greifen -- die Vereinsnamen
   verhindern Fehlzuordnungen. */
const VORLAUF_MAX_MS = 45 * 60_000;
const NACHLAUF_MAX_MS = 15 * 60_000;

export function passt(eintrag, spiel) {
  const ko = new Date(spiel.anstoss).getTime();
  const start = eintrag.start.getTime();
  if (start < ko - VORLAUF_MAX_MS || start > ko + NACHLAUF_MAX_MS) return false;
  const [a, b] = eintrag.teams;
  return (gleichesTeam(a, spiel.heim) && gleichesTeam(b, spiel.gast))
      || (gleichesTeam(a, spiel.gast) && gleichesTeam(b, spiel.heim));
}

/* Zu jedem uebergebenen Spiel den passenden Audio-Eintrag suchen. Rueckgabe:
   Map external_id -> { start (ISO), ende (ISO), url }. Nur fuer Spiele im
   Zeitfenster der ARD-Liste -- die reicht rund zwei Spieltage voraus. */
export async function audioZuSpielen(spiele) {
  const eintraege = await audioEintraege();
  const treffer = new Map();
  if (!eintraege.length) return treffer;
  for (const spiel of spiele) {
    const e = eintraege.find((x) => passt(x, spiel));
    if (!e) continue;
    treffer.set(String(spiel.external_id), {
      start: e.start.toISOString(),
      ende: new Date(e.start.getTime() + (e.dauer || 2 * 3600) * 1000).toISOString(),
      url: e.url,
    });
  }
  return treffer;
}
