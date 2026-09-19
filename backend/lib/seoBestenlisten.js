// Reine Helfer fuer die Bestenlisten-Seitenarten (kein DB-Zugriff): Modi,
// Schwellen, URL <-> seo_content-Schluessel. Route, Loader, Renderer, Sitemap
// und Textgenerator teilen sich diese eine Quelle.
//
// Schluessel in seo_content (bereich 'bestenliste'): '<modus>:<wert>:<type>',
// z. B. 'jahr:1999:movie', 'genre-jahrzehnt:action+1990:series', 'neu:aktuell:movie'.

// Ab so vielen Titeln lohnt eine eigene Liste; darunter 404 (kein duenner Inhalt).
export const MIN_TITEL = 30;
// Kino: nur Titel, die es in titles gibt (nur die haben eine Seite zum Verlinken).
export const MIN_TITEL_KINO = 10;
// "Neu" = aktuelles und vorheriges Kalenderjahr (titles kennt nur year).
export const NEU_JAHRE = 2;

export const THEMEN = {
  weihnachten: {
    name: 'Weihnachten', keywords: ['Weihnachten', 'Weihnachtsmann', 'Weihnachtsspecial'],
    film: 'Weihnachtsfilme', serie: 'Weihnachtsserien',
  },
  'wahre-begebenheit': {
    name: 'Wahre Begebenheit', keywords: ['NachWahrerBegebenheit', 'WahreBegebenheit', 'WahreGeschichte'],
    film: 'Filme nach wahrer Begebenheit', serie: 'Serien nach wahrer Begebenheit',
  },
};

// URL-Segmente (Modus, Wert, [Modus2, Wert2]) -> { modus, wert } oder null.
export function listeAusPfad(a, b, c, d) {
  const jz = (w) => /^(19[0-9]0|20[0-2]0)$/.test(w);
  const slug = (w) => /^[a-z0-9-]+$/.test(w || '');
  if (!c && !d) {
    if (a === 'jahr' && /^\d{4}$/.test(b)) return { modus: 'jahr', wert: b };
    if (a === 'genre' && slug(b)) return { modus: 'genre', wert: b };
    if (a === 'anbieter' && slug(b)) return { modus: 'anbieter', wert: b };
    if (a === 'jahrzehnt' && jz(b)) return { modus: 'jahrzehnt', wert: b };
    if (a === 'thema' && THEMEN[b]) return { modus: 'thema', wert: b };
    if (a === 'im-kino' && !b) return { modus: 'kino', wert: 'aktuell' };
    if (a === 'neu' && !b) return { modus: 'neu', wert: 'aktuell' };
    return null;
  }
  if (a === 'genre' && slug(b) && c === 'jahrzehnt' && jz(d)) return { modus: 'genre-jahrzehnt', wert: `${b}+${d}` };
  if (a === 'genre' && slug(b) && c === 'anbieter' && slug(d)) return { modus: 'genre-anbieter', wert: `${b}+${d}` };
  return null;
}

// { modus, wert } -> URL-Pfad ab /beste-.../ (ohne fuehrenden Slash).
export function listeZuPfad(modus, wert) {
  if (modus === 'kino') return 'im-kino';
  if (modus === 'neu') return 'neu';
  if (modus === 'genre-jahrzehnt' || modus === 'genre-anbieter') {
    const [g, w] = wert.split('+');
    return `genre/${g}/${modus === 'genre-jahrzehnt' ? 'jahrzehnt' : 'anbieter'}/${w}`;
  }
  return `${modus}/${wert}`;
}

export function listeSeitenPfad(locale, type, modus, wert) {
  return `/${locale}/${type === 'series' ? 'beste-serien' : 'beste-filme'}/${listeZuPfad(modus, wert)}`;
}

// seo_content-Schluessel -> Pfad (Sitemap). null bei unbekannter Form.
export function schluesselZuPfad(schluessel, locale) {
  const [modus, wert, type] = String(schluessel).split(':');
  if (!wert || (type !== 'movie' && type !== 'series')) return null;
  return listeSeitenPfad(locale, type, modus, wert);
}

// Analytics-Typ aus dem Pfad hinter /beste-filme|serien/ ('beste-filme' bleibt
// fuer Hub, Jahr und Genre; die neuen Arten bekommen eigene Typen).
export function analyticsTypFuerListe(teile) {
  const [, a, b, c] = teile;
  if (!a) return null;
  if (a === 'genre' && c === 'jahrzehnt') return 'beste-genre-jahrzehnt';
  if (a === 'genre' && c === 'anbieter') return 'beste-genre-anbieter';
  const map = { anbieter: 'beste-anbieter', jahrzehnt: 'beste-jahrzehnt', thema: 'beste-thema', 'im-kino': 'beste-kino', neu: 'beste-neu' };
  return map[a] || null;
}

export function jahrzehntName(jz) {
  return `${jz}er`;
}

// Anzeigename der Liste ("Beste Filme ...") fuer h1/title. teile: bereits
// aufgeloeste Namen { genre, anbieter } der Werte.
export function listeTitel(type, modus, wert, namen = {}) {
  const w = type === 'series' ? 'Serien' : 'Filme';
  const [, teil2] = String(wert).split('+');
  switch (modus) {
    case 'jahr': return `Beste ${w} ${wert}`;
    case 'genre': return `Beste ${w} im Genre ${namen.genre}`;
    case 'anbieter': return `Beste ${w} auf ${namen.anbieter}`;
    case 'jahrzehnt': return `Beste ${w} der ${jahrzehntName(wert)}`;
    case 'thema': return `Beste ${THEMEN[wert][type === 'series' ? 'serie' : 'film']}`;
    case 'genre-jahrzehnt': return `Beste ${w} im Genre ${namen.genre} der ${jahrzehntName(teil2)}`;
    case 'genre-anbieter': return `Beste ${w} im Genre ${namen.genre} auf ${namen.anbieter}`;
    case 'kino': return `Beste ${w} im Kino`;
    case 'neu': return `Beste neue ${w}`;
    default: return `Beste ${w}`;
  }
}
