/* Herkunft eines Seitenaufrufs als grobe Kategorie (16.09.2026, fuer den
   Analytics-Tab "Herkunft"; uebernommen aus CouchUltras).

   Gespeichert wird NUR die Kategorie -- nie die Adresse aus dem Referer-
   Header. Eine fremde Adresse koennte im Einzelfall auf eine Person
   zurueckfuehren (private Website, Profil-URL); die Frage "kommen die
   Besucher ueber Google, ueber Social Media oder direkt?" beantwortet die
   Kategorie genauso gut. Reine Funktion ohne Request-Objekt, damit sie
   sich ohne Server testen laesst (test/herkunft.test.js). */

export const HERKUNFT_ARTEN = ['direkt', 'intern', 'suche', 'social', 'ki', 'sonstige'];

// Reihenfolge der Pruefung: intern, ki, suche, social. "ki" steht VOR
// "suche", weil gemini.google.com sonst als Google-Suche durchginge.
const KI_RE = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|copilot\.microsoft\.com|gemini\.google\.com|claude\.ai|you\.com|mistral\.ai)$/i;
const SUCHE_RE = /(^|\.)(google\.[a-z.]{2,6}|bing\.com|duckduckgo\.com|ecosia\.org|yahoo\.[a-z.]{2,6}|startpage\.com|qwant\.com|yandex\.[a-z]{2,3}|search\.brave\.com|metager\.de)$/i;
const SOCIAL_RE = /(^|\.)(facebook\.com|fb\.com|instagram\.com|t\.co|twitter\.com|x\.com|reddit\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be|threads\.net|pinterest\.[a-z.]{2,6}|telegram\.org|t\.me|whatsapp\.com|mastodon\.social|bsky\.app|snapchat\.com|discord\.com)$/i;

/** referer: Inhalt des Referer-Headers (oder leer). eigeneHosts: Hostnamen,
 *  die als "intern" gelten (die eigene Domain samt Subdomains). */
export function herkunftKategorie(referer, eigeneHosts = []) {
  const ref = String(referer || '').trim();
  if (!ref) return 'direkt';
  let host;
  try { host = new URL(ref).hostname.toLowerCase(); } catch { return 'sonstige'; }
  if (!host) return 'sonstige';
  for (const e of eigeneHosts) {
    const eigen = String(e || '').trim().toLowerCase();
    if (eigen && (host === eigen || host.endsWith('.' + eigen))) return 'intern';
  }
  if (KI_RE.test(host)) return 'ki';
  if (SUCHE_RE.test(host)) return 'suche';
  if (SOCIAL_RE.test(host)) return 'social';
  return 'sonstige';
}

/* ---- Zwei weitere Merkmale aus dem User-Agent, ebenfalls nur als grobe
   Aufzaehlung, nie der User-Agent selbst. ---- */

export const GERAET_ARTEN = ['ios', 'android', 'desktop'];

/** Geraetetyp wie kpiPlattform() im Frontend: ios | android | desktop. */
export function geraetTyp(ua) {
  const s = String(ua || '');
  if (/iPhone|iPad|iPod/i.test(s)) return 'ios';
  if (/Android/i.test(s)) return 'android';
  return 'desktop';
}

// Crawler und Link-Vorschau-Dienste.
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview/i;
export function istBot(ua) {
  return BOT_RE.test(String(ua || ''));
}
