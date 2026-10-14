#!/usr/bin/env node
// Kurztexte (ca. 250-500 Zeichen) fuer Titelseiten in en-gb/fr-fr/it-it/nl-nl/pt-pt
// (seo_content, bereich 'titel'), deterministisch aus Katalogfeldern, kein API-Aufruf.
// Gegenstueck zu seo-titel-kurztexte.mjs (de-de). Legt nur FEHLENDE Eintraege an
// (DO NOTHING); der Uebersetzungslauf (seo-uebersetzen.mjs) ersetzt sie spaeter durch Langtexte.
//
// Aufruf (Backend-Container): node scripts/seo-titel-kurztexte-lokal.mjs --locales en-gb,fr-fr [--dry-run] [--zeige 3] [--max N]
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';

const MIN = 250;

const GENRES = {
  Drama: { 'en-gb': 'Drama', 'fr-fr': 'Drame', 'it-it': 'Drammatico', 'nl-nl': 'Drama', 'pt-pt': 'Drama' },
  Komödie: { 'en-gb': 'Comedy', 'fr-fr': 'Comédie', 'it-it': 'Commedia', 'nl-nl': 'Komedie', 'pt-pt': 'Comédia' },
  Dokumentarfilm: { 'en-gb': 'Documentary', 'fr-fr': 'Documentaire', 'it-it': 'Documentario', 'nl-nl': 'Documentaire', 'pt-pt': 'Documentário' },
  Thriller: { 'en-gb': 'Thriller', 'fr-fr': 'Thriller', 'it-it': 'Thriller', 'nl-nl': 'Thriller', 'pt-pt': 'Thriller' },
  Krimi: { 'en-gb': 'Crime', 'fr-fr': 'Policier', 'it-it': 'Giallo', 'nl-nl': 'Misdaad', 'pt-pt': 'Crime' },
  Liebesfilm: { 'en-gb': 'Romance', 'fr-fr': 'Romance', 'it-it': 'Romantico', 'nl-nl': 'Romantiek', 'pt-pt': 'Romance' },
  Action: { 'en-gb': 'Action', 'fr-fr': 'Action', 'it-it': 'Azione', 'nl-nl': 'Actie', 'pt-pt': 'Ação' },
  Animation: { 'en-gb': 'Animation', 'fr-fr': 'Animation', 'it-it': 'Animazione', 'nl-nl': 'Animatie', 'pt-pt': 'Animação' },
  Horror: { 'en-gb': 'Horror', 'fr-fr': 'Horreur', 'it-it': 'Horror', 'nl-nl': 'Horror', 'pt-pt': 'Terror' },
  Familie: { 'en-gb': 'Family', 'fr-fr': 'Famille', 'it-it': 'Famiglia', 'nl-nl': 'Familie', 'pt-pt': 'Família' },
  'TV-Film': { 'en-gb': 'TV movie', 'fr-fr': 'Téléfilm', 'it-it': 'Film TV', 'nl-nl': 'Tv-film', 'pt-pt': 'Filme para TV' },
  Mystery: { 'en-gb': 'Mystery', 'fr-fr': 'Mystère', 'it-it': 'Mistero', 'nl-nl': 'Mysterie', 'pt-pt': 'Mistério' },
  Abenteuer: { 'en-gb': 'Adventure', 'fr-fr': 'Aventure', 'it-it': 'Avventura', 'nl-nl': 'Avontuur', 'pt-pt': 'Aventura' },
  'Science Fiction': { 'en-gb': 'Science fiction', 'fr-fr': 'Science-fiction', 'it-it': 'Fantascienza', 'nl-nl': 'Sciencefiction', 'pt-pt': 'Ficção científica' },
  Fantasy: { 'en-gb': 'Fantasy', 'fr-fr': 'Fantastique', 'it-it': 'Fantasy', 'nl-nl': 'Fantasy', 'pt-pt': 'Fantasia' },
  Reality: { 'en-gb': 'Reality', 'fr-fr': 'Téléréalité', 'it-it': 'Reality', 'nl-nl': 'Reality', 'pt-pt': 'Reality' },
  'Sci-Fi & Fantasy': { 'en-gb': 'Sci-fi and fantasy', 'fr-fr': 'Science-fiction et fantastique', 'it-it': 'Fantascienza e fantasy', 'nl-nl': 'Sciencefiction en fantasy', 'pt-pt': 'Ficção científica e fantasia' },
  'Action & Adventure': { 'en-gb': 'Action and adventure', 'fr-fr': 'Action et aventure', 'it-it': 'Azione e avventura', 'nl-nl': 'Actie en avontuur', 'pt-pt': 'Ação e aventura' },
  Musik: { 'en-gb': 'Music', 'fr-fr': 'Musique', 'it-it': 'Musica', 'nl-nl': 'Muziek', 'pt-pt': 'Música' },
  Historie: { 'en-gb': 'History', 'fr-fr': 'Histoire', 'it-it': 'Storico', 'nl-nl': 'Historisch', 'pt-pt': 'História' },
  Western: { 'en-gb': 'Western', 'fr-fr': 'Western', 'it-it': 'Western', 'nl-nl': 'Western', 'pt-pt': 'Western' },
  Kriegsfilm: { 'en-gb': 'War', 'fr-fr': 'Guerre', 'it-it': 'Guerra', 'nl-nl': 'Oorlog', 'pt-pt': 'Guerra' },
  Kids: { 'en-gb': 'Kids', 'fr-fr': 'Enfants', 'it-it': 'Per bambini', 'nl-nl': 'Kinderen', 'pt-pt': 'Infantil' },
  'War & Politics': { 'en-gb': 'War and politics', 'fr-fr': 'Guerre et politique', 'it-it': 'Guerra e politica', 'nl-nl': 'Oorlog en politiek', 'pt-pt': 'Guerra e política' },
  Talk: { 'en-gb': 'Talk show', 'fr-fr': 'Talk-show', 'it-it': 'Talk show', 'nl-nl': 'Talkshow', 'pt-pt': 'Talk show' },
  Soap: { 'en-gb': 'Soap opera', 'fr-fr': 'Feuilleton', 'it-it': 'Soap opera', 'nl-nl': 'Soap', 'pt-pt': 'Novela' },
  News: { 'en-gb': 'News', 'fr-fr': 'Actualités', 'it-it': 'Notiziario', 'nl-nl': 'Nieuws', 'pt-pt': 'Notícias' },
};

// Satzbausteine je Locale. Jeder Eintrag ist eine Funktion bzw. Textvorlage.
const L = {
  'en-gb': {
    dn: 'en', and: 'and',
    film: 'film', serie: 'series',
    intro: (t, serie, jahr) => `“${t}” is ${serie ? 'a series' : 'a film'}${jahr ? ` from ${jahr}` : ''}`,
    land: (l) => ` (production country: ${l})`,
    genre: (g) => `In the catalogue it is listed under ${g}.`,
    dir: (d, serie) => serie ? `The series was developed by ${d}.` : `It was directed by ${d}.`,
    cast: (c) => `The cast includes ${c}.`,
    staffeln: (n, r) => `The series runs for ${n} ${n === 1 ? 'season' : 'seasons'}${r ? `, with episodes of about ${r} minutes` : ''}.`,
    laufzeit: (r) => `The running time is ${r} ${r === 1 ? 'minute' : 'minutes'}.`,
    sprache: (s) => `The original language is ${s}.`,
    orig: (o) => `The original title is “${o}”.`,
    rating: (r) => `Audiences rate it ${r} out of 10 on average on TMDB.`,
    schluss: (serie) => `On MovieTaste you can add ${serie ? 'the series' : 'the film'} to your watchlist and compare it with your own taste.`,
    zahl: (n) => n.toFixed(1),
  },
  'fr-fr': {
    dn: 'fr', and: 'et',
    intro: (t, serie, jahr) => `« ${t} » est ${serie ? 'une série' : 'un film'}${jahr ? ` de ${jahr}` : ''}`,
    land: (l) => ` (pays de production : ${l})`,
    genre: (g, serie) => `Dans le catalogue, ${serie ? 'elle est classée' : 'il est classé'} dans ${g}.`,
    dir: (d, serie) => serie ? `La série a été créée par ${d}.` : `Le film est réalisé par ${d}.`,
    cast: (c) => `Au casting figurent ${c}.`,
    staffeln: (n, r) => `La série compte ${n} ${n === 1 ? 'saison' : 'saisons'}${r ? `, avec des épisodes d’environ ${r} minutes` : ''}.`,
    laufzeit: (r) => `La durée est de ${r} ${r === 1 ? 'minute' : 'minutes'}.`,
    sprache: (s) => `La langue originale est ${s}.`,
    orig: (o) => `Le titre original est « ${o} ».`,
    rating: (r) => `Sur TMDB, le public lui attribue en moyenne ${r} sur 10.`,
    schluss: (serie) => `Sur MovieTaste, vous pouvez ajouter ${serie ? 'la série' : 'le film'} à votre watchlist et le comparer à vos propres goûts.`,
    zahl: (n) => n.toFixed(1).replace('.', ','),
  },
  'it-it': {
    dn: 'it', and: 'e',
    intro: (t, serie, jahr) => `«${t}» è ${serie ? 'una serie' : 'un film'}${jahr ? ` del ${jahr}` : ''}`,
    land: (l) => ` (paese di produzione: ${l})`,
    genre: (g, serie) => `Nel catalogo è classificat${serie ? 'a' : 'o'} come ${g}.`,
    dir: (d, serie) => serie ? `La serie è stata ideata da ${d}.` : `La regia è di ${d}.`,
    cast: (c) => `Nel cast figurano ${c}.`,
    staffeln: (n, r) => `La serie conta ${n} ${n === 1 ? 'stagione' : 'stagioni'}${r ? `, con episodi di circa ${r} minuti` : ''}.`,
    laufzeit: (r) => `La durata è di ${r} ${r === 1 ? 'minuto' : 'minuti'}.`,
    sprache: (s) => `La lingua originale è ${s}.`,
    orig: (o) => `Il titolo originale è «${o}».`,
    rating: (r) => `Su TMDB il pubblico assegna in media ${r} su 10.`,
    schluss: (serie) => `Su MovieTaste puoi aggiungere ${serie ? 'la serie' : 'il film'} alla watchlist e confrontarlo con i tuoi gusti.`,
    zahl: (n) => n.toFixed(1).replace('.', ','),
  },
  'nl-nl': {
    dn: 'nl', and: 'en',
    intro: (t, serie, jahr) => `‘${t}’ is ${serie ? 'een serie' : 'een film'}${jahr ? ` uit ${jahr}` : ''}`,
    land: (l) => ` (productieland: ${l})`,
    genre: (g) => `In de catalogus staat deze titel onder ${g}.`,
    dir: (d, serie) => serie ? `De serie is bedacht door ${d}.` : `De regie is van ${d}.`,
    cast: (c) => `Tot de cast behoren ${c}.`,
    staffeln: (n, r) => `De serie telt ${n} ${n === 1 ? 'seizoen' : 'seizoenen'}${r ? `, met afleveringen van ongeveer ${r} minuten` : ''}.`,
    laufzeit: (r) => `De speelduur is ${r} ${r === 1 ? 'minuut' : 'minuten'}.`,
    sprache: (s) => `De oorspronkelijke taal is ${s}.`,
    orig: (o) => `De originele titel is ‘${o}’.`,
    rating: (r) => `Het publiek geeft gemiddeld een ${r} uit 10 op TMDB.`,
    schluss: (serie) => `Op MovieTaste voeg je ${serie ? 'de serie' : 'de film'} toe aan je watchlist en vergelijk je hem met je eigen smaak.`,
    zahl: (n) => n.toFixed(1).replace('.', ','),
  },
  'pt-pt': {
    dn: 'pt', and: 'e',
    intro: (t, serie, jahr) => `«${t}» é ${serie ? 'uma série' : 'um filme'}${jahr ? ` de ${jahr}` : ''}`,
    land: (l) => ` (país de produção: ${l})`,
    genre: (g, serie) => `No catálogo, está classificad${serie ? 'a' : 'o'} como ${g}.`,
    dir: (d, serie) => serie ? `A série foi criada por ${d}.` : `A realização é de ${d}.`,
    cast: (c) => `No elenco estão ${c}.`,
    staffeln: (n, r) => `A série tem ${n} ${n === 1 ? 'temporada' : 'temporadas'}${r ? `, com episódios de cerca de ${r} minutos` : ''}.`,
    laufzeit: (r) => `A duração é de ${r} ${r === 1 ? 'minuto' : 'minutos'}.`,
    sprache: (s) => `A língua original é ${s}.`,
    orig: (o) => `O título original é «${o}».`,
    rating: (r) => `O público atribui-lhe, em média, ${r} em 10 no TMDB.`,
    schluss: (serie) => `No MovieTaste pode adicionar ${serie ? 'a série' : 'o filme'} à sua watchlist e compará-lo com o seu gosto.`,
    zahl: (n) => n.toFixed(1).replace('.', ','),
  },
};

const dnCache = {};
function dn(locale, type) {
  const k = locale + type;
  return (dnCache[k] ||= new Intl.DisplayNames([L[locale].dn], { type }));
}

function aufz(locale, l) {
  if (l.length <= 1) return l.join('');
  return `${l.slice(0, -1).join(', ')} ${L[locale].and} ${l[l.length - 1]}`;
}

function laender(locale, codes) {
  const out = [];
  for (const c of codes || []) {
    try { const n = dn(locale, 'region').of(c); if (n && n !== c) out.push(n); } catch { /* ungueltiger Code */ }
  }
  return out.slice(0, 2);
}

// Titel in Zielsprache: TMDB-Titel aus uebersetzungen, englisch title_en, sonst Originaltitel.
function zielTitel(t, locale) {
  const k = L[locale].dn;
  const u = t.uebersetzungen?.[k]?.t;
  if (u) return u;
  if (k === 'en' && t.title_en) return t.title_en;
  return t.original_title || t.title;
}

// Handlungstext (nur en-gb: overview_en), auf ganze Saetze bis ca. 600 Zeichen gekuerzt; sonst null.
function handlung(t, locale) {
  const o = locale === 'en-gb' ? (t.overview_en || '').replace(/\s+/g, ' ').trim() : '';
  if (o.length < 80) return null;
  if (o.length <= 600) return /[.!?…”"]$/.test(o) ? o : null;
  const teil = o.slice(0, 600);
  const i = Math.max(teil.lastIndexOf('. '), teil.lastIndexOf('! '), teil.lastIndexOf('? '));
  return i >= 80 ? teil.slice(0, i + 1) : null;
}

// null, wenn die Felder fuer MIN Zeichen nicht reichen.
export function bauKurztext(t, locale) {
  const x = L[locale];
  const serie = t.type === 'series';
  const titel = zielTitel(t, locale);
  const genres = (t.genres || []).map((g) => GENRES[g]?.[locale]).filter(Boolean).slice(0, 3);
  const s = [];
  const woher = laender(locale, t.origin_country);
  s.push(x.intro(titel, serie, t.year) + (woher.length ? x.land(aufz(locale, woher)) : '') + '.');
  const hand = handlung(t, locale);
  if (hand) s.push(hand);
  if (genres.length) s.push(x.genre(aufz(locale, genres), serie));
  if (t.director) s.push(x.dir(t.director, serie));
  const cast = (t.cast_names || []).slice(0, 4);
  if (cast.length >= 2) s.push(x.cast(aufz(locale, cast)));
  if (serie && t.seasons) s.push(x.staffeln(t.seasons, t.runtime));
  else if (t.runtime) s.push(x.laufzeit(t.runtime));
  if (t.original_language && t.original_language !== x.dn) {
    let n = null;
    try { n = dn(locale, 'language').of(t.original_language); } catch { /* unbekannt */ }
    if (n && n !== t.original_language) s.push(x.sprache(n));
  }
  if (t.original_title && t.original_title !== titel) s.push(x.orig(t.original_title));
  if (t.rating && (t.vote_count || 0) >= 100) s.push(x.rating(x.zahl(Number(t.rating))));
  s.push(x.schluss(serie));
  const text = s.join(' ');
  return text.length >= MIN ? text : null;
}

async function main() {
  const a = process.argv.slice(2);
  const dryRun = a.includes('--dry-run');
  const zi = a.indexOf('--zeige');
  const zeige = zi >= 0 ? Number(a[zi + 1]) || 3 : 0;
  const mi = a.indexOf('--max');
  const max = mi >= 0 ? Number(a[mi + 1]) : Infinity;
  const li = a.indexOf('--locales');
  const locales = (li >= 0 ? a[li + 1] : Object.keys(L).join(',')).split(',');
  for (const locale of locales) {
    if (!L[locale]) { console.error(`Unbekannte Locale ${locale}`); continue; }
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (t.type, t.tmdb_id) t.type, t.tmdb_id, t.title, t.title_en, t.original_title, t.uebersetzungen,
              t.year, t.genres, t.director, t.cast_names, t.rating, t.vote_count, t.origin_country,
              t.original_language, t.runtime, t.seasons, t.overview_en
         FROM titles t
        WHERE t.tmdb_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM seo_content s WHERE s.bereich = 'titel'
                            AND s.schluessel = t.type || ':' || t.tmdb_id AND s.locale = $1)
        ORDER BY t.type, t.tmdb_id, t.vote_count DESC NULLS LAST`, [locale]);
    let neu = 0, zuKurz = 0, gezeigt = 0;
    for (const t of rows) {
      if (neu >= max) break;
      const text = bauKurztext(t, locale);
      if (!text) { zuKurz++; continue; }
      if (gezeigt < zeige) { gezeigt++; console.log(`\n[${locale}] ${t.type}:${t.tmdb_id} (${text.length} Zeichen):\n${text}`); }
      if (!dryRun) {
        const r = await pool.query(
          `INSERT INTO seo_content (bereich, schluessel, locale, text) VALUES ('titel', $1, $2, $3)
           ON CONFLICT (bereich, schluessel, locale) DO NOTHING`, [`${t.type}:${t.tmdb_id}`, locale, text]);
        if (r.rowCount === 1) neu++;
      } else neu++;
    }
    console.log(`${locale}: Kandidaten ${rows.length}, ${dryRun ? 'Probelauf neu' : 'neu'} ${neu}, zu wenig Fakten (<${MIN}) ${zuKurz}`);
  }
  await pool.end();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
