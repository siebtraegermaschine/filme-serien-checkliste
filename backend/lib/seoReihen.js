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
  const bester = bewertet.length ? [...bewertet].sort((a, b) => (b.note || 0) - (a.note || 0))[0] : null;
  const zaehler = new Map();
  for (const t of titel) for (const g of t.genres || []) zaehler.set(g, (zaehler.get(g) || 0) + 1);
  const genres = [...zaehler.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([g]) => g);
  return {
    anzahl: titel.length,
    jahrVon: jahre.length ? Math.min(...jahre) : null,
    jahrBis: jahre.length ? Math.max(...jahre) : null,
    schnitt, bester, genres,
  };
}

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
  if (f.bester) teile.push(`${teile.length ? 'am' : 'Am'} besten bewertet ist „${f.bester.title}“ mit ${komma(f.bester.rating)}`);
  if (f.genres.length) teile.push(`${teile.length ? 'die' : 'Die'} häufigsten Genres sind ${aufzaehlung(f.genres)}`);
  const absatz2 = teile.length ? `${teile.join('; ')}.` : '';
  return [absatz1, absatz2].filter(Boolean).join('\n\n');
}
