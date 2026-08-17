/* Onboarding: Antwortmoeglichkeiten, Pruefung, anonyme Zaehler.
   Siehe PLAN-ONBOARDING.md.

   Die Listen stehen HIER und nicht im Frontend: Das Fenster holt sie ueber
   GET /api/onboarding mit. Zwei gepflegte Listen -- eine im Browser, eine zum
   Pruefen -- waeren zwei Listen, die auseinanderlaufen, und der Bruch faellt
   erst auf, wenn eine gueltige Antwort abgelehnt wird.

   Angezeigt werden die Schluessel nicht: Das Frontend uebersetzt sie ueber TXT
   (Schauverhalten) bzw. genreAnzeige() (Genres, Themen). */

// Schritt 2 -- "Wie schaust du?", Mehrfachauswahl, mindestens eine.
export const SCHAUVERHALTEN = ['selten', 'serien', 'kino', 'streaming', 'sammlung', 'klassiker'];

/* Schritt 3 -- Genres. Die Werte sind die deutschen Datenbankfassungen aus
   titles.genres; das Frontend uebersetzt sie mit derselben Funktion wie die
   Genre-Schildchen an den Titelzeilen.

   THEMEN sind keine TMDB-Genres, sondern Schlagwoerter (lib/themen.js) --
   deshalb das Praefix "thema:", damit sie sich spaeter beim Auswerten
   auseinanderhalten lassen und nicht versehentlich als Genre gefiltert werden. */
export const GENRES_HAEUFIG = [
  'Action', 'Komödie', 'Drama', 'Thriller', 'Science Fiction', 'Horror',
  'Liebesfilm', 'Animation', 'Abenteuer', 'Krimi', 'Dokumentarfilm', 'Fantasy',
];
export const GENRES_THEMEN = [
  'thema:TrueCrime', 'thema:NachWahrerBegebenheit', 'thema:Superheld', 'thema:Zeitreise',
];
export const GENRES_WEITERE = [
  'Western', 'Musik', 'Historie', 'Kriegsfilm', 'Mystery', 'Familie', 'TV-Film',
];
export const GENRES_ALLE = [...GENRES_HAEUFIG, ...GENRES_THEMEN, ...GENRES_WEITERE];

// Mindestanzahlen je Schritt. Alle Schritte sind Pflicht -- es gibt keinen
// "Ueberspringen"-Link. Damit "Pflicht" aber keine Sackgasse wird, hat jeder
// Schritt eine gueltige Nein-Antwort (kein Anbieter, kein Kino) und die
// Titelstrecke eine Untergrenze unter ihrem Ziel: Wer 15 unbekannte Titel
// bekommt, kaeme mit "Kenn ich nicht" sonst nie ans Ende.
export const TITEL_ZIEL = 15;
export const TITEL_MINDESTENS = 5;
export const GENRES_MINDESTENS = 3;

// Drei Anlaeufe: der erste direkt nach der Anmeldung, danach zwei
// Wiedervorlagen bei je einer spaeteren Anmeldung.
export const ANLAEUFE_MAX = 3;

export const SCHRITTE_GESAMT = 5;

/* Mindestzahl fuer die AUSWERTUNG der Aggregate (nicht fuer das Zaehlen).
   Gezaehlt wird alles; gezeigt wird erst, was oft genug vorkommt -- dieselbe
   Vorsicht wie bei der Bewertungsstatistik. */
export const AGGREGAT_SCHWELLE = 5;

// Doppelte weg, Reihenfolge der Vorgabelisten behalten, nur Bekanntes durch.
// Unbekannte Werte werden STILL verworfen statt die Anfrage scheitern zu
// lassen: ein alter Browser mit einer veralteten Liste soll nicht blockieren.
function nurBekannte(liste, erlaubt) {
  if (!Array.isArray(liste)) return null;
  const menge = new Set(liste.filter((x) => typeof x === 'string'));
  return erlaubt.filter((x) => menge.has(x));
}

export function sauberSchauverhalten(liste) {
  const raus = nurBekannte(liste, SCHAUVERHALTEN);
  return raus && raus.length ? raus : null;
}

export function sauberGenres(liste) {
  const raus = nurBekannte(liste, GENRES_ALLE);
  return raus && raus.length >= GENRES_MINDESTENS ? raus : null;
}

/* Wie viele Titel jemand in der Strecke bewertet hat -- als Stufe, nicht als
   Zahl. Eine exakte Anzahl waere ein feineres Merkmal, ohne dass die Auswertung
   davon etwas haette. */
export function titelStufe(anzahl) {
  const n = Number(anzahl) || 0;
  if (n < TITEL_MINDESTENS) return 'unter-5';
  if (n < 10) return '5-9';
  if (n < TITEL_ZIEL) return '10-14';
  return '15+';
}

// Region der Person, wie sie in die Aggregat-Zeile geht. Unbekannt -> 'XX'.
export function aggregatRegion(region) {
  return /^[A-Z]{2}$/.test(String(region || '')) ? String(region) : 'XX';
}

/* Zaehler hochsetzen. Eine Antwort = eine Zeile je Monat und Region.
   Aufrufer ist ausschliesslich routes/onboarding.js, und dort nur beim ERSTEN
   Abschluss eines Schritts -- sonst zaehlte jede Korrektur ueber den
   Zurueck-Pfeil doppelt. */
export async function aggregatZaehlen(client, frage, antworten, region) {
  const liste = [...new Set((antworten || []).map(String).filter(Boolean))];
  if (!liste.length) return;
  await client.query(
    `INSERT INTO onboarding_aggregat (frage, antwort, monat, region, anzahl)
     SELECT $1, a, date_trunc('month', now())::date, $3, 1 FROM unnest($2::text[]) AS a
     ON CONFLICT (frage, antwort, monat, region)
     DO UPDATE SET anzahl = onboarding_aggregat.anzahl + 1`,
    [frage, liste, aggregatRegion(region)]
  );
}
