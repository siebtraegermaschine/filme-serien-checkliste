// Reihen/Franchises (TMDB-Collections): reine Hilfsfunktionen -- Namen, Slugs,
// Fakten und Redaktionstext. Datenzugriff steht in seoData.js, HTML in seoRender.js.
import { slugify } from './slug.js';

// Eine Reihe bekommt nur dann eine Seite, wenn mindestens so viele ihrer Filme
// im Katalog eine Titelseite haben (darunter 404, nicht in der Sitemap).
export const MIN_TITEL_REIHE = 3;

// TMDB haengt "Filmreihe"/"Collection" an den Namen ("Harry Potter Filmreihe",
// "James Bond Collection"); fuer Anzeige und Slug faellt das Suffix weg.
const SUFFIX = /\s*[-–:]?\s*(Filmreihe|Filmsammlung|Filmserie|Kollektion|Collection)\s*$/i;

export function reihenName(roh) {
  const name = String(roh || '').trim();
  const kurz = name.replace(SUFFIX, '').trim();
  return kurz || name;
}

// reihen: [{ id, name }] (name = Rohname). Liefert Map id -> eindeutiger Slug.
// Bei Kollision behaelt die niedrigste collection_id den Slug, die anderen
// bekommen "-<id>" angehaengt.
export function reihenSlugs(reihen) {
  const sortiert = [...reihen].sort((a, b) => a.id - b.id);
  const vergeben = new Set();
  const karte = new Map();
  for (const r of sortiert) {
    let slug = slugify(reihenName(r.name));
    if (!slug) slug = `reihe-${r.id}`;
    else if (vergeben.has(slug)) slug = `${slug}-${r.id}`;
    vergeben.add(slug);
    karte.set(r.id, slug);
  }
  return karte;
}

// Filme einer Reihe in Erscheinungsreihenfolge: Datum, sonst Jahr, dann TMDB-ID.
export function inErscheinungsreihenfolge(titel) {
  const schluessel = (t) => t.erschienenAm || (t.year ? `${t.year}-12-31` : '9999-12-31');
  return [...titel].sort((a, b) => schluessel(a).localeCompare(schluessel(b)) || a.tmdbId - b.tmdbId);
}

// Kennzahlen aus den Titeln der Reihe; note = gewichtete Bewertung (seoData NOTE_SQL).
export function reihenFakten(titel) {
  const jahre = titel.map((t) => t.year).filter(Boolean);
  const bewertet = titel.filter((t) => t.rating && t.rating > 0);
  const schnitt = bewertet.length
    ? Math.round(bewertet.reduce((s, t) => s + t.rating, 0) / bewertet.length * 10) / 10
    : null;
  // Bestwert nach der angezeigten TMDB-Bewertung (bei Gleichstand die gewichtete Note), sonst
  // stuende "am besten" mit einer niedrigeren Zahl als der Schnitt im Text.
  const nachWert = (a, b) => b.rating - a.rating || (b.note || 0) - (a.note || 0);
  const bester = bewertet.length ? [...bewertet].sort(nachWert)[0] : null;
  const schwaechster = bewertet.length > 1 ? [...bewertet].sort(nachWert).at(-1) : null;
  const geordnet = inErscheinungsreihenfolge(titel);
  const zaehler = new Map();
  for (const t of titel) for (const g of t.genres || []) zaehler.set(g, (zaehler.get(g) || 0) + 1);
  const genres = [...zaehler.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([g]) => g);
  return {
    anzahl: titel.length,
    jahrVon: jahre.length ? Math.min(...jahre) : null,
    jahrBis: jahre.length ? Math.max(...jahre) : null,
    schnitt, bester, schwaechster, genres,
    erster: geordnet[0] || null, letzter: geordnet.length > 1 ? geordnet.at(-1) : null,
  };
}

// Titel in nicht-lateinischer Schrift (Hindi, Koreanisch ...) bleiben im Fliesstext weg.
const lateinisch = (t) => !!t && /^[\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}]+$/u.test(t);
const komma = (n) => String(n).replace('.', ',');
const aufzaehlung = (liste) => (liste.length < 2 ? liste.join('') : `${liste.slice(0, -1).join(', ')} und ${liste[liste.length - 1]}`);

// Deterministischer Text nur aus Katalogfakten. Behauptet nichts ueber die
// erzaehlte Chronologie -- TMDB kennt nur das Erscheinen.
export function bauReihenText(name, fakten) {
  const f = fakten;
  const zeitraum = !f.jahrVon ? ''
    : f.jahrVon === f.jahrBis ? `, erschienen ${f.jahrVon}`
    : `, erschienen zwischen ${f.jahrVon} und ${f.jahrBis}`;
  const absatz1 = `Die Reihe „${name}“ umfasst im MovieMatch-Katalog ${f.anzahl} Filme${zeitraum}. Die Liste führt sie in der Reihenfolge ihres Erscheinens auf — das muss nicht die Reihenfolge der erzählten Handlung sein.`;
  const teile = [];
  if (f.schnitt != null) teile.push(`Im Schnitt liegen die Filme bei ${komma(f.schnitt)} von 10 (TMDB-Bewertung)`);
  if (f.bester && lateinisch(f.bester.title)) teile.push(`${teile.length ? 'am' : 'Am'} besten bewertet ist „${f.bester.title}“ mit ${komma(f.bester.rating)}`);
  if (f.genres.length) teile.push(`${teile.length ? 'die' : 'Die'} häufigsten Genres sind ${aufzaehlung(f.genres)}`);
  const absatz2 = teile.length ? `${teile.join('; ')}.` : '';
  const satz = [];
  const mitJahr = (t) => `„${t.title}“${t.year ? ` (${t.year})` : ''}`;
  if (f.erster && f.letzter && lateinisch(f.erster.title) && lateinisch(f.letzter.title)) {
    satz.push(`Der Auftakt ist ${mitJahr(f.erster)}, der bisher jüngste Teil ${mitJahr(f.letzter)}.`);
  }
  if (f.bester && f.schwaechster && f.bester.rating !== f.schwaechster.rating && lateinisch(f.schwaechster.title)) {
    satz.push(`Die Bewertungen reichen von ${komma(f.schwaechster.rating)} („${f.schwaechster.title}“) bis ${komma(f.bester.rating)}.`);
  }
  return [absatz1, absatz2, satz.join(' ')].filter(Boolean).join('\n\n');
}
