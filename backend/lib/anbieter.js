/*
 * Anbieter-Grundlagen: Namensbereinigung, stabile Slugs und der Anbieter-
 * katalog JE REGION.
 *
 * Warum je Region: TMDB (Daten von JustWatch) kennt die Anbieterliste
 * landesweise -- GET /watch/providers/movie|tv?watch_region=XX liefert nur die
 * dort verfuegbaren Dienste, und jeder Eintrag traegt in `display_priorities`
 * eine eigene Sortierempfehlung JE LAND (kleiner = prominenter). Bis zum
 * 16. August 2026 fragte die App diesen Endpunkt ohne Regionsbezug ab und
 * lieferte allen denselben globalen Katalog: Wer aus Brasilien kam, bekam RTL+
 * und WOW zur Auswahl, aber Globoplay und Claro video irgendwo weit hinten.
 *
 * Zweite Falle derselben Stelle: Das Feld `display_priority` auf oberster Ebene
 * ist ein GLOBALER Wert, nicht der des angefragten Landes. Danach sortiert
 * standen Nischenanbieter vorne -- weshalb frueher eine handgepflegte Liste
 * deutscher Dienste gegensteuern musste. Mit `display_priorities[REGION]`
 * (siehe landesPrioritaet) braucht es die nicht mehr, und die Reihenfolge
 * stimmt in allen 41 Regionen.
 */

import { slugify } from './slug.js';

const API = 'https://api.themoviedb.org/3';

// Wie lange ein geladener Regionskatalog als frisch gilt. Die Anbieterliste
// eines Landes aendert sich hoechstens ein paar Mal im Jahr.
const KATALOG_TTL_MS = Number(process.env.PROVIDER_CATALOG_TTL_HOURS || 24) * 3_600_000;

// So viele Anbieter zeigt die Einstellung direkt; der Rest steckt hinter
// "Weitere anzeigen".
export const COMMON_COUNT = 20;

// TMDB fuehrt Tarifstufen und Wiederverkaeufer als eigenstaendige Anbieter --
// "Netflix" UND "Netflix Standard with Ads", "HBO Max" UND "HBO Max Amazon
// Channel". Fuer die Anzeige ist das reines Rauschen (derselbe Dienst, zweimal
// gelistet), deshalb werden diese Zusaetze abgeschnitten und gleichnamige
// Eintraege zusammengefasst.
const VARIANT_SUFFIX = /\s+(?:Amazon Channel|Apple TV Channel|Roku Premium Channel|Standard with Ads|Basic with Ads|with Ads)$/i;

export function basisName(name) {
  let n = String(name || '').trim();
  let prev;
  do { prev = n; n = n.replace(VARIANT_SUFFIX, '').trim(); } while (n !== prev);
  return n;
}

// true, wenn der Name einen Kanal-/Tarifzusatz traegt ("HBO Max Amazon
// Channel"). Solche Eintraege sind eigene TMDB-Anbieter mit eigener ID; fuer
// Auswahl und Import zaehlt jeweils der Eintrag OHNE Zusatz.
export function istVariante(name) {
  const voll = String(name || '').trim();
  return voll !== basisName(voll);
}

// Slug fuer die oeffentlichen SEO-Seiten /<locale>/streaming/<slug> und fuer
// streaming_cache.provider_id.
//
// Die vier Anbieter der ersten Ausbaustufe behalten ihre kurzen Bestands-Slugs:
// An ihnen haengen indexierte URLs, die Eintraege in `seo_content` und die
// Sitemap. Alles Neue wird schlicht aus dem Namen gebildet.
const BESTANDS_SLUGS = {
  'Netflix': 'netflix',
  'Amazon Prime Video': 'amazon',
  'Amazon Prime': 'amazon',
  'Disney Plus': 'disney',
  'Disney+': 'disney',
  'Apple TV': 'apple',
  'Apple TV Plus': 'apple',
  'Apple TV+': 'apple',
};

export function anbieterSlug(name) {
  const basis = basisName(name);
  if (BESTANDS_SLUGS[basis]) return BESTANDS_SLUGS[basis];
  // "+" wird zu "plus", bevor slugify es wegwirft: TMDB wechselt bei diesen
  // Namen regelmaessig die Schreibweise ("Disney+" <-> "Disney Plus",
  // "Apple TV+" <-> "Apple TV"). Ohne das wuerde aus "RTL+" mal 'rtl' und mal
  // 'rtl-plus' -- und eine indexierte SEO-Seite waere ueber Nacht weg.
  return slugify(basis.replace(/\+/g, ' plus '));
}

// Sortierempfehlung des ANGEFRAGTEN Landes; `display_priority` (global) ist nur
// der Rueckfall, falls TMDB fuer das Land nichts angibt.
export function landesPrioritaet(p, region) {
  const jeLand = p.display_priorities || {};
  if (Number.isFinite(jeLand[region])) return jeLand[region];
  return Number.isFinite(p.display_priority) ? p.display_priority : 999;
}

// Shops fuers Leihen/Kaufen. Sie muessen in der Vorauswahl stecken, sonst
// bleiben "Leihen" und "Kaufen" in der Detailansicht dauerhaft leer -- zum
// Leihen/Kaufen zaehlen ausschliesslich Shops, und die tragen bei TMDB voellig
// andere IDs als die gleichnamigen Abo-Dienste (Apple TV Store 2 vs. Apple TV+
// 350, Amazon Video 10 vs. Amazon Prime Video 9). Es sind zugleich genau die
// Anbieter, fuer die WATCH_SEARCH_URLS im Frontend einen funktionierenden
// Suchlink kennt. Die IDs sind laenderuebergreifend dieselben.
const SHOP_IDS = [2, 3, 10, 192, 35];

// So viele der prominentesten Dienste eines Landes sind vorausgewaehlt.
const STANDARD_TOP = 10;

// Vorauswahl fuer alle, die noch nichts eingestellt haben: die zehn
// prominentesten Dienste des Landes plus die dortigen Shops. Frueher stand hier
// eine feste deutsche Liste -- in Brasilien waren damit RTL+ und WOW
// vorausgewaehlt und Globoplay gar nicht.
export function standardAnbieterIds(katalog) {
  const oben = katalog.slice(0, STANDARD_TOP).map((p) => p.id);
  const shops = katalog.filter((p) => SHOP_IDS.includes(p.id)).map((p) => p.id);
  return [...new Set([...oben, ...shops])];
}

// Letzter Rueckfall, wenn TMDB nicht erreichbar ist und noch nie ein Katalog
// geladen wurde: die frueheren globalen Standardwerte. Besser eine deutsche
// Vorauswahl als gar keine -- ohne sie waere die Einstellung eine Sackgasse.
export const STANDARD_RUECKFALL = [8, 9, 337, 350, 2, 10, 3, 192];

const katalogCache = new Map();   // region -> { at, liste }
const imBau = new Map();          // region -> Promise

async function tmdbAnbieter(kind, region) {
  const url = new URL(`${API}/watch/providers/${kind}`);
  url.searchParams.set('api_key', process.env.TMDB_API_KEY);
  url.searchParams.set('watch_region', region);
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return (await res.json()).results || [];
}

async function katalogLaden(region) {
  const jeId = new Map();
  for (const kind of ['movie', 'tv']) {
    for (const p of await tmdbAnbieter(kind, region)) {
      const voll = String(p.provider_name || '').trim();
      const name = basisName(voll);
      if (!name) continue;
      const prio = landesPrioritaet(p, region);
      const da = jeId.get(p.provider_id);
      if (da) {
        // Film- und Serienliste koennen fuer denselben Anbieter abweichende
        // Prioritaeten nennen; die bessere zaehlt.
        if (prio < da.priority) da.priority = prio;
        da.arten.add(kind);
        continue;
      }
      jeId.set(p.provider_id, {
        id: p.provider_id,
        name,
        slug: anbieterSlug(name),
        logo: p.logo_path || null,
        priority: prio,
        kanonisch: voll === name,
        arten: new Set([kind]),
      });
    }
  }

  // Gleichnamige Kanal-/Tarifvarianten zu einem Eintrag zusammenfassen.
  const jeName = new Map();
  for (const p of [...jeId.values()].sort((a, b) => a.priority - b.priority)) {
    const da = jeName.get(p.name);
    // Der Eintrag OHNE Zusatz gewinnt, auch wenn er weiter hinten steht: nur zu
    // dessen ID kennen wir ggf. einen Suchlink, und nur er ist das, was man
    // tatsaechlich abonniert.
    if (!da || (p.kanonisch && !da.kanonisch)) jeName.set(p.name, p);
  }

  return [...jeName.values()]
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
    .map((p, i) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      logo: p.logo,
      priority: p.priority,
      kanonisch: p.kanonisch,
      arten: [...p.arten],
      common: i < COMMON_COUNT,
    }));
}

/* Anbieterkatalog einer Region -- nach der Landes-Prioritaet sortiert.
   Prozessintern gecacht (fuer alle Nutzer:innen derselben Region identisch);
   parallele Anfragen in eine kalte Region teilen sich einen Abruf. Faellt TMDB
   aus, gilt lieber ein veralteter Katalog als gar keiner. */
export async function anbieterKatalog(region) {
  const gecacht = katalogCache.get(region);
  if (gecacht && Date.now() - gecacht.at < KATALOG_TTL_MS) return gecacht.liste;
  if (!process.env.TMDB_API_KEY) return gecacht ? gecacht.liste : [];
  if (imBau.has(region)) return imBau.get(region);

  const versprechen = katalogLaden(region)
    .then((liste) => {
      katalogCache.set(region, { at: Date.now(), liste });
      return liste;
    })
    .catch((err) => {
      console.error(`Anbieterkatalog (${region}) nicht abrufbar:`, err.message);
      return gecacht ? gecacht.liste : [];
    })
    .finally(() => imBau.delete(region));

  imBau.set(region, versprechen);
  return versprechen;
}
