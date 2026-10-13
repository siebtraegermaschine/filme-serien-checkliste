// Baut vollstaendige, eigenstaendige HTML-Dokumente fuer die SEO-Seiten
// (PLAN-SEO.md, Plan "SEO-Seiten: technische Umsetzung"). Kein Splicing wie
// bei der App-OG-Route (server.js) -- jede Funktion hier gibt ein fertiges
// Dokument zurueck. Kein App-JS, eigenes seo.css (Architektur-Entscheidung 1).
import { PERSON_TX } from './seoPersonen.js';
import { hreflangCode, hatSeitenart, localeIndexierbar, sprachVon, regionFuerLocale, textLocale, localesMitText, istDeutsch } from './seoLocale.js';
import { seoTexte, ABSCHNITTE, zahlFormat } from './seoTexte.js';
import { genreAnzeige } from './genreNamen.js';
import { listeSeitenPfad, THEMEN, LAUFZEITEN, STAFFELN } from './seoBestenlisten.js';
import { slugify } from './slug.js';
import { seitenTexte, listeTitelLokal, jahrzehntNameL, themaName, laufzeitKurz, staffelnKurz } from './seoSeitenTexte.js';
import { landAnzeige, sprachAnzeige } from './herkunftsnamen.js';

export const SITE = 'https://movietaste.de';

// Von server.js mitverwendet statt dort dupliziert (frueher server.js
// eigene Kopie).
export function attrEsc(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const BILD_FALLBACK = SITE + '/og-image.png';

// Jede SEO-Seite mit Eintraegen wird indexiert, auch ohne eigenen Text --
// Texte kommen nach und nach dazu. "noindex" nur fuer Dubletten: Folgeseiten
// (?seite=N), gleichnamige Personen ohne Text, 404. seoData.js liefert
// `indexierbar` je Seite.
//
// "follow" steht auch bei noindex, und robots.txt sperrt /de-de/ NICHT: Ein
// Crawler muss die Seite abrufen duerfen, um das noindex ueberhaupt zu lesen.
// Wer beides gleichzeitig macht (Disallow + noindex), erreicht das Gegenteil --
// bereits indexierte Seiten blieben dann im Index stehen.

function kopf({ locale, pfad, titelZeile, beschreibung, indexierbar, bild, jsonLd, alternates, basis, favicon }) {
  // basis: Ursprung fuer canonical/og/hreflang -- Standard movietaste.de.
  const wurzel = basis || SITE;
  const url = wurzel + pfad;
  const robots = indexierbar ? 'index,follow' : 'noindex,follow';
  // noindex-Locale ohne Gegenseite im Cluster: gar kein hreflang (nichts, worauf es zeigen koennte).
  const ohneHreflang = !(alternates && alternates.length) && !localeIndexierbar(locale);
  const hreflangs = ohneHreflang ? '' : (alternates && alternates.length ? alternates : [{ locale, pfad }])
    .map((a) => `<link rel="alternate" hreflang="${attrEsc(hreflangCode(a.locale))}" href="${attrEsc(wurzel + a.pfad)}">`)
    .join('\n  ');
  // x-default zeigt auf die de-de-Fassung, sofern der Cluster sie kennt.
  const de = (alternates || []).find((a) => a.locale === 'de-de');
  const xDefault = de ? wurzel + de.pfad : url;
  const ld = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${attrEsc(titelZeile)}</title>
  <meta name="description" content="${attrEsc(beschreibung)}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${attrEsc(url)}">
  ${hreflangs}
  ${ohneHreflang ? '' : `<link rel="alternate" hreflang="x-default" href="${attrEsc(xDefault)}">`}
  <link rel="stylesheet" href="/seo.css">
  <script src="/consent.js" defer></script>
  <link rel="icon" href="${attrEsc(favicon || '/favicon-32.png')}">
  <meta property="og:site_name" content="MovieMatch">
  <meta property="og:url" content="${attrEsc(url)}">
  <meta property="og:title" content="${attrEsc(titelZeile)}">
  <meta property="og:description" content="${attrEsc(beschreibung)}">
  <meta property="og:image" content="${attrEsc(bild || BILD_FALLBACK)}">
  ${ld.map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`).join('\n  ')}`;
}

function kopfzeile(locale = 'de-de') {
  return `<header class="seo-kopf">
    <a class="marke" href="${SITE}/">Movie<span>Match</span></a>
    <nav class="seo-nav">
      <a href="${SITE}/?von=app">${attrEsc(seoTexte(locale).zurApp)}</a>
    </nav>
  </header>`;
}

// Uebersichtsseiten im Footer jeder SEO-Seite. Dieselbe Liste steht im
// App-Footer (index.html, .footer-seo); seoRender.test.js prueft die Gleichheit.
export const FOOTER_BEREICHE = [
  ['filme', 'Filme'], ['serien', 'Serien'], ['schauspieler', 'Schauspieler'], ['regisseur', 'Regisseure'],
  ['bestenlisten', 'Bestenlisten'], ['reihen', 'Reihen'], ['streaming', 'Streaming'], ['kino', 'Kino'],
];

function fusszeile(locale) {
  const T = seoTexte(locale);
  const de = istDeutsch(locale);
  // Nicht-de-Locales verlinken nur Bereiche, die dort lokalisiert sind; die Rechtstexte
  // sind dort die englischen Fassungen (imprint/privacy).
  const bereiche = de
    ? FOOTER_BEREICHE.map(([pfad, name]) => [pfad, name])
    : ['filme', 'serien', 'bestenlisten', 'reihen', 'streaming', 'kino'].filter((p) => hatSeitenart(locale, p)).map((p) => [p, T.bereiche[p]]);
  return `<footer>
    ${bereiche.length ? `<nav class="footer-seo" aria-label="${attrEsc(T.uebersichtsseiten)}">
      ${bereiche.map(([pfad, name]) => `<a href="/${locale}/${pfad}">${name}</a>`).join('\n      ')}
    </nav>` : ''}
    <a href="${SITE}/${de ? 'impressum' : 'imprint'}.html">${attrEsc(T.impressum)}</a>
    <a href="${SITE}/${de ? 'datenschutz' : 'privacy'}.html">${attrEsc(T.datenschutz)}</a>
    <a href="#" data-cookie-einstellungen>${attrEsc(T.cookies)}</a>
  </footer>`;
}

export function dokument({ locale, pfad, titelZeile, beschreibung, indexierbar, bild, jsonLd, alternates, bodyHtml, basis, kopfHtml, fussHtml, favicon }) {
  // Nicht freigegebene Locales sind nie im Index, egal was die Seitenfunktion meldet.
  if (!localeIndexierbar(locale)) indexierbar = false;
  return `<!DOCTYPE html>
<html lang="${sprachVon(locale)}">
<head>
  ${kopf({ locale, pfad, titelZeile, beschreibung, indexierbar, bild, jsonLd, alternates, basis, favicon })}
</head>
<body>
  ${kopfHtml || kopfzeile(locale)}
  <main>
    ${bodyHtml}
  </main>
  ${fussHtml || fusszeile(locale)}
</body>
</html>`;
}

// Beschreibung fuers <meta description>/og:description: eigener Redaktions-
// text (seoData.text), gekuerzt auf ~160 Zeichen an einer Wortgrenze -- NIE
// die TMDB-Kurzbeschreibung (das war der urspruengliche Dubletten-Grund).
// Die "### "-Marker des Vier-Abschnitte-Formats und alle Zeilenumbrueche
// fliegen vorher raus: sonst stuende die Gliederungsueberschrift im Snippet.
function kurzfassung(text, laenge = 160) {
  const t = (text || '').replace(/^###.*$/gm, ' ').replace(/\s+/g, ' ').trim();
  if (t.length <= laenge) return t;
  const platz = t.lastIndexOf(' ', laenge - 1);
  return t.slice(0, platz > 0 ? platz : laenge) + '…';
}

function bewertungsZeile(titel, locale = 'de-de') {
  const sprache = sprachVon(locale);
  const teile = [];
  if (titel.rating != null && titel.rating > 0) {
    teile.push('⭐ ' + String(titel.rating).replace('.', sprache === 'en' ? '.' : ','));
  }
  if (titel.year) teile.push(String(titel.year));
  if (titel.genres && titel.genres.length) teile.push(titel.genres.map((g) => genreAnzeige(g, sprache)).join(', '));
  return teile.join(' · ');
}

function anbieterHtml(name, anbieterSlug, locale) {
  return anbieterSlug && hatSeitenart(locale, 'anbieter')
    ? `<a href="/${locale}/streaming/${anbieterSlug}">${attrEsc(name)}</a>`
    : attrEsc(name);
}

function verfuegbarkeitHtml(streaming, locale) {
  const flatrate = streaming.flatrate || [];
  const T = seoTexte(locale);
  if (!flatrate.length) return `<p class="hinweis">${attrEsc(T.keinAbo)}</p>`;
  return `<p>${T.imAbo(flatrate.map((p) => anbieterHtml(p.name, p.anbieterSlug, locale)).join(', '))}</p>`;
}

function genreHref(genre, type, locale) {
  return `/${locale}/${type === 'series' ? 'serien' : 'filme'}/${slugify(genre)}`;
}

// Die Genre-Namen aus der Datenbank sind deutsch; andere Sprachen zeigen die
// Namen aus genreNamen.js. Verlinkt wird nur, wo die Genre-Seite lokalisiert ist.
function genreLinksHtml(genres, type, locale) {
  const sprache = sprachVon(locale);
  return (genres || []).map((g) => {
    const name = attrEsc(genreAnzeige(g, sprache));
    return hatSeitenart(locale, 'genre') ? `<a href="${genreHref(g, type, locale)}">${name}</a>` : name;
  }).join(', ');
}

// Breadcrumbs dienen der Crawlbarkeit UND dem Nutzer: sichtbare Navigation
// nach oben (Titel -> Genre -> Hub -> Start), zusaetzlich als BreadcrumbList
// strukturierte Daten. `kette` ist [{label, href}], das letzte Glied (die
// aktuelle Seite) traegt kein href.
export function brotkrumenHtml(kette, locale = 'de-de') {
  return `<nav class="brotkrumen" aria-label="${attrEsc(seoTexte(locale).brotkrumen)}">${kette.map((k, i) =>
    (i > 0 ? ' › ' : '') + (k.href ? `<a href="${k.href}">${attrEsc(k.label)}</a>` : `<span>${attrEsc(k.label)}</span>`)
  ).join('')}</nav>`;
}

// Das letzte Glied (aktuelle Seite) braucht laut Google-Vorgabe kein "item" --
// JSON.stringify laesst `undefined`-Werte ohnehin weg.
export function brotkrumenJsonLd(kette) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: kette.map((k, i) => ({
      '@type': 'ListItem', position: i + 1, name: k.label,
      item: k.href ? (k.href.startsWith('http') ? k.href : SITE + k.href) : undefined,
    })),
  };
}

// ListItem fuer ItemList-JSON-LD. Google verlangt je Eintrag eine url
// (Karussell-Ergebnisse), nur "name" genuegt nicht.
function listItem(i, name, url) {
  return { '@type': 'ListItem', position: i + 1, name, url };
}
function titelListe(titel, artWort, locale) {
  return titel.map((t, i) => listItem(i, t.title, `${SITE}/${locale}/${artWort}/${t.slug}-${t.tmdbId}`));
}

// Ein Redaktionstext (seo_content.text) traegt zwei Themenbloecke, getrennt
// durch den ersten Absatzumbruch: der erste Absatz ist "Worum es geht", alle
// weiteren "Warum sich der Titel lohnt". Bewusst ueber die Absatzstruktur
// entschieden statt ueber ein zweites Textfeld -- keine Schema-Aenderung
// noetig, und die 3-5 Musterinhalte sind schon genau so geschrieben.
function textAbschnitte(text) {
  if (!text) return { worum: null, warum: null };
  const absaetze = text.split('\n\n').map((p) => p.trim()).filter(Boolean);
  return {
    worum: absaetze[0] || null,
    warum: absaetze.length > 1 ? absaetze.slice(1) : null,
  };
}

function absaetzeHtml(absaetze) {
  return (Array.isArray(absaetze) ? absaetze : [absaetze]).map((p) => `<p>${attrEsc(p)}</p>`).join('');
}

// Neue, erweiterte Textstruktur (siehe Uebergabe-Notiz "Content-Struktur
// v2"): der Redaktionstext traegt eigene "### Ueberschrift"-Marker statt
// sich nur ueber Absatzumbrueche in zwei Teile zu gliedern. Alte Texte ohne
// diese Marker fallen auf die bisherige textAbschnitte()-Logik zurueck, bis
// sie ueberarbeitet sind -- keine Seite bricht durch die Umstellung.
const NEUE_ABSCHNITTE = ['Worum es geht', 'Entstehungsgeschichte', 'Hinter den Kulissen', 'Einordnung & Wirkung'];

// Personentexte (seo-auftrag-personen.md) tragen dieselben "### "-Marker,
// aber ihre eigenen drei Abschnitte -- Ueberschriften-Reihenfolge separat
// von NEUE_ABSCHNITTE, parseNeueAbschnitte() selbst ist generisch genug fuer
// beide Formate.
const PERSON_ABSCHNITTE = ['Werdegang', 'Filmografie bei uns', 'Einordnung'];

function personInhaltHtml(text, locale = 'de-de') {
  const abschnitte = parseNeueAbschnitte(text);
  if (!abschnitte) return null;
  const ueberschriften = PERSON_TX[sprachVon(locale)]?.abschnitte;
  return (istDeutsch(locale) || !ueberschriften ? PERSON_ABSCHNITTE : ueberschriften)
    .filter((h) => abschnitte[h])
    .map((h) => `<h2>${attrEsc(h)}</h2>${absaetzeHtml(abschnitte[h].split('\n\n').map((p) => p.trim()).filter(Boolean))}`)
    .join('');
}

function parseNeueAbschnitte(text) {
  if (!text || !text.includes('###')) return null;
  const teile = text.split(/\n?###\s*/).map((t) => t.trim()).filter(Boolean);
  const ergebnis = {};
  for (const teil of teile) {
    const zeilenumbruch = teil.indexOf('\n');
    const ueberschrift = (zeilenumbruch === -1 ? teil : teil.slice(0, zeilenumbruch)).trim();
    const inhalt = zeilenumbruch === -1 ? '' : teil.slice(zeilenumbruch + 1).trim();
    if (ueberschrift) ergebnis[ueberschrift] = inhalt;
  }
  return Object.keys(ergebnis).length ? ergebnis : null;
}

function inhaltHtmlBauen(text, locale = 'de-de') {
  const T = seoTexte(locale);
  const neu = parseNeueAbschnitte(text);
  if (neu) {
    return (ABSCHNITTE[sprachVon(locale)] || NEUE_ABSCHNITTE)
      .filter((h) => neu[h])
      .map((h) => `<h2>${attrEsc(h)}</h2>${absaetzeHtml(neu[h].split('\n\n').map((p) => p.trim()).filter(Boolean))}`)
      .join('');
  }
  const { worum, warum } = textAbschnitte(text);
  return `<h2>${attrEsc((ABSCHNITTE[sprachVon(locale)] || NEUE_ABSCHNITTE)[0])}</h2>${worum ? absaetzeHtml(worum) : `<p class="hinweis">${attrEsc(T.keineBeschreibung)}</p>`}`
    + (warum ? `<h2>Warum sich der Titel lohnt</h2>${absaetzeHtml(warum)}` : '');
}

export function seiteTitelDetail(titel, locale) {
  const artWort = titel.type === 'series' ? 'serie' : 'film';
  const listenWort = titel.type === 'series' ? 'serien' : 'filme';
  const T = seoTexte(locale);
  const sprache = sprachVon(locale);
  const hubWort = T.bereiche[listenWort];
  const zahl = (n, opt) => zahlFormat(n, locale, opt);
  const dez = (n) => String(n).replace('.', sprache === 'en' ? '.' : ',');
  const pfad = `/${locale}/${artWort}/${titel.slug}-${titel.tmdbId}`;
  const titelZeile = `${titel.title}${titel.year ? ' (' + titel.year + ')' : ''} — ${T.titelSuffix} | MovieMatch`;
  const beschreibung = kurzfassung(titel.text) || T.titelBeschr(titel.title);
  // Nicht-de-Locales: index nur, wenn die Locale freigegeben ist UND ein Text in
  // dieser Sprache existiert -- sonst stuende deutsche/englische Katalogware im Index.
  const indexierbar = textLocale(locale) === 'de-de'
    ? titel.indexierbar
    : !!(titel.indexierbar && localeIndexierbar(locale) && titel.text);
  const bild = titel.backdropPath
    ? 'https://image.tmdb.org/t/p/w1280' + titel.backdropPath
    : (titel.posterPath ? 'https://image.tmdb.org/t/p/w500' + titel.posterPath : null);
  const erstesGenre = (titel.genres || [])[0];

  const kette = [
    { label: T.start, href: SITE + '/' },
    ...(hatSeitenart(locale, 'hub') ? [{ label: hubWort, href: `/${locale}/${listenWort}` }] : []),
    ...(erstesGenre && hatSeitenart(locale, 'genre') ? [{ label: genreAnzeige(erstesGenre, sprache), href: genreHref(erstesGenre, titel.type, locale) }] : []),
    { label: titel.title },
  ];

  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': titel.type === 'series' ? 'TVSeries' : 'Movie',
    name: titel.title,
    datePublished: titel.year ? String(titel.year) : undefined,
    genre: (titel.genres || []).map((g) => genreAnzeige(g, sprache)),
    director: titel.director ? { '@type': 'Person', name: titel.director } : undefined,
    actor: (titel.castNames || []).slice(0, 8).map((n) => ({ '@type': 'Person', name: n })),
    aggregateRating: titel.communityBewertung ? {
      '@type': 'AggregateRating',
      ratingValue: titel.communityBewertung.durchschnitt,
      ratingCount: titel.communityBewertung.gesamt,
      bestRating: 10,
      worstRating: 1,
    } : undefined,
    image: bild || undefined,
  }, brotkrumenJsonLd(kette)];

  const posterHtml = titel.posterPath
    ? `<img src="https://image.tmdb.org/t/p/w500${attrEsc(titel.posterPath)}" alt="${attrEsc(titel.title)}">`
    : '';

  const faktenZeilen = [
    // Bei Serien fuehrt das Feld die Idee/Entwicklung (TMDB created_by), keine Regie.
    titel.director ? [titel.type === 'series' ? T.idee : T.regie, titel.regisseurPersonId && hatSeitenart(locale, 'person')
      ? `<a href="/${locale}/regisseur/${slugify(titel.director, locale)}-${titel.regisseurPersonId}">${attrEsc(titel.director)}</a>`
      : attrEsc(titel.director)] : null,
    (titel.genres || []).length ? [T.genre, genreLinksHtml(titel.genres, titel.type, locale)] : null,
    titel.laufzeitMinuten ? [T.laufzeit, T.minuten(titel.laufzeitMinuten)] : null,
    titel.erscheinungsdatum ? [T.erscheinung, titel.erscheinungsdatum] : (titel.year ? [T.jahr, String(titel.year)] : null),
    titel.certification ? [T.freigabe, attrEsc(T.freigabeWert(titel.certification))] : null,
    titel.budget ? [T.budget, `${zahl(titel.budget)} $`] : null,
    titel.einspielergebnis ? [T.einspiel, `${zahl(titel.einspielergebnis)} $`] : null,
    titel.rating != null ? [T.tmdb, dez(titel.rating) + (titel.voteCount ? ` (${T.stimmen(zahl(titel.voteCount))})` : '')] : null,
    // Vorerst ausgeblendet, solange keine Community-Bewertung vorliegt (Christian,
    // 17.09.2026) -- statt der Platzhalterzeile "noch unter der Mindestzahl" faellt
    // die Zeile ueber .filter(Boolean) einfach weg, wie bei den anderen optionalen Fakten.
    titel.communityBewertung
      ? [T.community, T.communityWert(dez(titel.communityBewertung.durchschnitt), titel.communityBewertung.gesamt)]
      : null,
    (titel.streaming.flatrate || []).length
      ? [T.verfuegbarBei, titel.streaming.flatrate.map((p) => anbieterHtml(p.name, p.anbieterSlug, locale)).join(', ')]
      : null,
  ].filter(Boolean);
  const faktenHtml = `<table class="fakten">${faktenZeilen.map(([k, v]) => `<tr><th>${attrEsc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;

  // Besetzung MIT Rollennamen, wenn vorhanden (titeldetails.js) -- sonst
  // Ruecksturz auf die reine Namensliste aus titles.cast_names.
  const schauspielerIds = titel.schauspielerIds || new Map();
  const schauspielerName = (name) => schauspielerIds.has(name) && hatSeitenart(locale, 'person')
    ? `<a href="/${locale}/schauspieler/${slugify(name, locale)}-${schauspielerIds.get(name)}">${attrEsc(name)}</a>`
    : attrEsc(name);
  const besetzungHtml = (titel.besetzungRollen && titel.besetzungRollen.length)
    ? `<ul class="besetzung-liste">${titel.besetzungRollen.map((c) => `<li><b>${schauspielerName(c.name)}</b>${c.rolle ? ` ${attrEsc(T.als)} ${attrEsc(c.rolle)}` : ''}</li>`).join('')}</ul>`
    : ((titel.castNames || []).length
      ? `<p>${titel.castNames.slice(0, 10).map(schauspielerName).join(', ')}</p>`
      : `<p class="hinweis">${attrEsc(T.keineBesetzung)}</p>`);

  const trailerHtml = titel.trailerKey
    ? `<h2>${attrEsc(T.trailer)}</h2><div class="video-wrapper"><iframe src="https://www.youtube-nocookie.com/embed/${attrEsc(titel.trailerKey)}" title="${attrEsc(T.trailerVon(titel.title))}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
    : '';

  const bilderHtml = (titel.bilder || []).length
    ? `<h2>${attrEsc(T.bilder)}</h2><div class="galerie">${titel.bilder.map((pfad) => `<img src="https://image.tmdb.org/t/p/w500${attrEsc(pfad)}" alt="${attrEsc(titel.title)}" loading="lazy">`).join('')}</div>`
    : '';

  const regisseurName = titel.regisseurPersonId && hatSeitenart(locale, 'person')
    ? `<a href="/${locale}/regisseur/${slugify(titel.director, locale)}-${titel.regisseurPersonId}">${attrEsc(titel.director)}</a>`
    : attrEsc(titel.director);
  const regisseurFilmeHtml = titel.regisseurFilme.length && hatSeitenart(locale, 'titel')
    ? `<h3>${T.weitereVon(regisseurName)}</h3><div class="raster">${titel.regisseurFilme.map((t) => karte(t, artWort, locale)).join('')}</div>`
    : '';

  const reiheHtml = titel.reihe && hatSeitenart(locale, 'reihe')
    ? `<p class="hinweis">${T.reiheTeil(`<a href="/${locale}/reihen/${attrEsc(titel.reihe.slug)}">${attrEsc(titel.reihe.name)}</a>`, titel.reihe.anzahl)}</p>`
    : '';

  const aehnlicheHtml = titel.aehnlicheTitel.length
    ? `<h2>${attrEsc(T.aehnliche)}</h2><div class="raster">${titel.aehnlicheTitel.map((t) => karte(t, artWort, locale)).join('')}</div>`
    : '';

  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <div class="detail-kopf">
      ${posterHtml}
      <div>
        <h1>${attrEsc(titel.title)}${titel.year ? ` <span class="hinweis">(${titel.year})</span>` : ''}</h1>
        <div class="meta-zeile">${attrEsc(bewertungsZeile(titel, locale))}</div>
        <a class="cta" href="${SITE}/t/${titel.type}/${titel.tmdbId}?von=titel">${attrEsc(T.cta)}</a>
      </div>
    </div>
    <h2>${attrEsc(T.kurz)}</h2>
    ${faktenHtml}
    ${trailerHtml}
    ${inhaltHtmlBauen(titel.text, locale)}
    ${bilderHtml}
    <h2>${attrEsc(T.besetzung)}</h2>
    ${besetzungHtml}
    ${regisseurFilmeHtml}
    ${reiheHtml}
    ${aehnlicheHtml}
    <h2>${attrEsc(T.verfuegbarkeit)}</h2>
    ${verfuegbarkeitHtml(titel.streaming, locale)}
  `;

  // hreflang-Cluster: nur indexierbare Locales mit Text; die eigene Seite gehoert nur dazu, wenn sie indexiert wird.
  const alternates = (titel.textLocales || [])
    .filter((l) => localeIndexierbar(l))
    .map((l) => ({ locale: l, pfad: `/${l}/${artWort}/${titel.slug}-${titel.tmdbId}` }));
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar, bild, jsonLd, alternates: alternates.length ? alternates : undefined, bodyHtml });
}

// Vorlagentexte der Listen-/Hub-/Wochen-/Reihenseiten je Locale (gecacht).
const txCache = new Map();
function TX(locale) {
  if (!txCache.has(locale)) txCache.set(locale, seitenTexte(locale, regionFuerLocale(locale)));
  return txCache.get(locale);
}

// Einleitungsabsatz: de wie bisher (mit Hinweis ohne Text); andere Locales lassen den Absatz ohne Text weg.
function einleitungHtml(text, locale) {
  if (istDeutsch(locale)) return `<p class="einleitung">${textBlock(text)}</p>`;
  return text ? `<p class="einleitung">${textBlock(text, locale)}</p>` : '';
}

function textBlock(text, locale = 'de-de') {
  return text
    ? `<div class="seo-text">${text.split('\n\n').map((p) => `<p>${attrEsc(p)}</p>`).join('')}</div>`
    : `<p class="hinweis">${attrEsc(seoTexte(locale).keineBeschreibung)}</p>`;
}

// Aufrufer geben artWort ('film'|'serie') mit, da eine Trefferliste (Genre/
// Bestenliste) i.d.R. nur einen Typ enthaelt, aber die Kartenfunktion das
// nicht selbst kennt.
function karte(t, artWort, locale) {
  const dez = sprachVon(locale) === 'en' ? '.' : ',';
  const bild = t.posterPath ? `https://image.tmdb.org/t/p/w342${attrEsc(t.posterPath)}` : '';
  const href = `/${locale}/${artWort}/${attrEsc(t.slug)}-${t.tmdbId}`;
  const bewertung = t.communityBewertung
    ? `⭐ ${String(t.communityBewertung.durchschnitt).replace('.', dez)}`
    : (t.rating ? `⭐ ${String(t.rating).replace('.', dez)}` : '');
  return `<a class="karte" href="${href}">
    ${bild ? `<img src="${bild}" alt="${attrEsc(t.title)}" loading="lazy">` : ''}
    <div class="titel">${attrEsc(t.title)}</div>
    <div class="info">${[bewertung, t.year].filter(Boolean).join(' · ')}</div>
  </a>`;
}

function seitenNavigation(basisPfad, seite, seitenGesamt) {
  if (seitenGesamt <= 1) return '';
  const glieder = [];
  for (let i = 1; i <= seitenGesamt; i++) {
    if (i === seite) glieder.push(`<span class="aktuell">${i}</span>`);
    else glieder.push(`<a href="${basisPfad}?seite=${i}">${i}</a>`);
  }
  return `<nav class="seiten">${glieder.join('')}</nav>`;
}

export function seiteGenre(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const artWort = daten.type === 'series' ? 'serie' : 'film';
  const listenWort = daten.type === 'series' ? 'serien' : 'filme';
  const hubWort = S.bereiche[listenWort];
  const pfad = `/${locale}/${listenWort}/${daten.genreSlug}`;
  const titelZeile = `${T.genreH1(daten.genre, hubWort)} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.genreBeschr(daten.genre);
  const kette = [
    { label: S.start, href: SITE + '/' },
    { label: hubWort, href: `/${locale}/${listenWort}` },
    { label: daten.genre },
  ];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: titelZeile,
    itemListElement: titelListe(daten.titel, artWort, locale),
  }, brotkrumenJsonLd(kette)];
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${T.genreH1(attrEsc(daten.genre), hubWort)}</h1>
    ${einleitungHtml(daten.text, locale)}
    <p class="hinweis"><a href="${listeSeitenPfad(locale, daten.type, 'genre', daten.genreSlug)}">${T.genreListeLink(attrEsc(daten.genre), hubWort)}</a></p>
    <div class="raster">${daten.titel.map((t) => karte(t, artWort, locale)).join('')}</div>
    ${seitenNavigation(pfad, daten.seite, daten.seiten)}
  `;
  return dokument({ locale, pfad: daten.seite > 1 ? `${pfad}?seite=${daten.seite}` : pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar && daten.seite === 1, jsonLd, bodyHtml });
}

export function seiteAnbieter(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const pfad = `/${locale}/streaming/${daten.anbieterSlug}`;
  const titelZeile = `${T.anbieterH1(daten.name)} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.anbieterBeschr(daten.name);
  const kette = [
    { label: S.start, href: SITE + '/' },
    { label: S.bereiche.streaming, href: `/${locale}/streaming` },
    { label: daten.name },
  ];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: itemListJsonLd(titelZeile, [[daten.filme, 'film'], [daten.serien, 'serie']], locale).itemListElement,
  }, brotkrumenJsonLd(kette)];
  const name = attrEsc(daten.name);
  const besteLinks = [];
  if (daten.besteListen && daten.besteListen.filme) besteLinks.push(`<a href="${listeSeitenPfad(locale, 'movie', 'anbieter', daten.anbieterSlug)}">${T.besteFilmeAuf(name)}</a>`);
  if (daten.besteListen && daten.besteListen.serien) besteLinks.push(`<a href="${listeSeitenPfad(locale, 'series', 'anbieter', daten.anbieterSlug)}">${T.besteSerienAuf(name)}</a>`);
  besteLinks.push(`<a href="/${locale}/neu-auf/${daten.anbieterSlug}">${T.neuAuf(name)}</a>`);
  const besteHtml = `<p class="hinweis">${besteLinks.join(' · ')}</p>`;
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${T.anbieterH1(name)}</h1>
    ${einleitungHtml(daten.text, locale)}
    ${besteHtml}
    <h2>${attrEsc(S.bereiche.filme)}</h2>
    ${wochenListeHtml(daten.filme, 'film', locale, 'weitere')}
    <h2>${attrEsc(S.bereiche.serien)}</h2>
    ${wochenListeHtml(daten.serien, 'serie', locale, 'weitere')}
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

// Chips-Abschnitte der Bestenlisten-Uebersicht/-Hubs: nur Listen, die es gibt
// (Schwelle erreicht, siehe bestenlistenKatalog in seoData.js).
function listenChips(locale, type, links) {
  return `<div class="chips">${links.map((l) => `<a class="chip" href="${listeSeitenPfad(locale, type, l.modus, l.wert)}">${attrEsc(l.label)}</a>`).join('')}</div>`;
}

// Der Katalog ist locale-neutral (deutsche Namen, Codes); die Namen werden hier in die Sprache der Seite gesetzt.
function listenAbschnitte(katalog, type, locale, ebene = 'h2') {
  const T = TX(locale);
  const sprache = sprachVon(locale);
  const de = sprache === 'de';
  const w = seoTexte(locale).bereiche[type === 'series' ? 'serien' : 'filme'];
  const teile = [];
  const aktuell = [];
  if (katalog.kino) aktuell.push({ label: T.imKino(w), modus: 'kino', wert: 'aktuell' });
  if (katalog.neu) aktuell.push({ label: T.neueTitel(w), modus: 'neu', wert: 'aktuell' });
  if (aktuell.length) teile.push(`<${ebene}>${T.aktuell}</${ebene}>${listenChips(locale, type, aktuell)}`);
  if (katalog.anbieter.length) {
    teile.push(`<${ebene}>${T.nachAnbieter}</${ebene}>${listenChips(locale, type, katalog.anbieter.map((a) => ({ label: a.name, modus: 'anbieter', wert: a.slug })))}`);
  }
  if (katalog.jahrzehnte.length) {
    teile.push(`<${ebene}>${T.nachJahrzehnt}</${ebene}>${listenChips(locale, type, katalog.jahrzehnte.map((j) => ({ label: jahrzehntNameL(j, sprache), modus: 'jahrzehnt', wert: String(j) })))}`);
  }
  if (katalog.themen.length) {
    teile.push(`<${ebene}>${T.nachThema}</${ebene}>${listenChips(locale, type, katalog.themen.map((t) => ({ label: themaName(t, sprache, THEMEN[t].name), modus: 'thema', wert: t })))}`);
  }
  if (katalog.laender.length) {
    teile.push(`<${ebene}>${T.nachLand}</${ebene}>${listenChips(locale, type, katalog.laender.map((l) => ({ label: de ? l.name : landAnzeige(l.code, sprache), modus: 'land', wert: l.slug })))}`);
  }
  if (katalog.sprachen.length) {
    teile.push(`<${ebene}>${T.nachSprache}</${ebene}>${listenChips(locale, type, katalog.sprachen.map((l) => ({ label: de ? l.name : sprachAnzeige(l.code, sprache), modus: 'sprache', wert: l.slug })))}`);
  }
  const laenge = type === 'series'
    ? katalog.staffeln.map((k) => ({ label: `${w} ${staffelnKurz(k, sprache, STAFFELN[k].kurz)}`, modus: 'staffeln', wert: k }))
    : katalog.laufzeit.map((k) => ({ label: `${w} ${laufzeitKurz(k, sprache, LAUFZEITEN[k].kurz)}`, modus: 'laufzeit', wert: k }));
  if (laenge.length) teile.push(`<${ebene}>${type === 'series' ? T.nachStaffeln : T.nachLaufzeit}</${ebene}>${listenChips(locale, type, laenge)}`);
  return teile.join('');
}

export function seiteBestenliste(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const sprache = sprachVon(locale);
  const de = sprache === 'de';
  const artWort = daten.type === 'series' ? 'serie' : 'film';
  const wortTyp = S.bereiche[daten.type === 'series' ? 'serien' : 'filme'];
  const listenWort = daten.type === 'series' ? 'beste-serien' : 'beste-filme';
  const alleWort = daten.type === 'series' ? 'serien' : 'filme';
  const pfad = listeSeitenPfad(locale, daten.type, daten.modus, daten.wert);
  const ueberschrift = daten.ueberschrift;
  const titelZeile = `${ueberschrift} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.listeBeschr(ueberschrift);
  const kette = [
    { label: S.start, href: SITE + '/' },
    { label: S.bereiche.bestenlisten, href: `${SITE}/${locale}/bestenlisten` },
    { label: T.besteWort(wortTyp), href: `/${locale}/${listenWort}` },
    { label: de ? (ueberschrift.replace(/^Beste (Filme|Serien) /, '') || ueberschrift) : ueberschrift },
  ];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: titelListe(daten.titel, artWort, locale),
  }, brotkrumenJsonLd(kette)];

  // Rueckverweise auf die uebergeordneten Seiten (Genre-Liste, Jahrzehnt, Anbieter).
  const [erst, zweit] = String(daten.wert).split('+');
  const lt = (modus, wert, namen) => listeTitelLokal(sprache, daten.type, modus, wert, namen);
  const genreListe = de ? `Beste ${wortTyp} im Genre ${daten.genre}` : null;
  const rueck = [];
  if (daten.modus === 'genre') {
    rueck.push({ href: `/${locale}/${alleWort}/${daten.genreSlug}`, label: T.alleGenre(daten.genre, wortTyp) });
  }
  if (daten.modus === 'genre-jahrzehnt' || daten.modus === 'genre-anbieter') {
    rueck.push({ href: listeSeitenPfad(locale, daten.type, 'genre', erst), label: de ? genreListe : lt('genre', erst, { genre: daten.genre }) });
    rueck.push(daten.modus === 'genre-jahrzehnt'
      ? { href: listeSeitenPfad(locale, daten.type, 'jahrzehnt', zweit), label: de ? `Beste ${wortTyp} der ${jahrzehntNameL(zweit, 'de')}` : lt('jahrzehnt', zweit) }
      : { href: listeSeitenPfad(locale, daten.type, 'anbieter', zweit), label: de ? `Beste ${wortTyp} auf ${daten.anbieter}` : lt('anbieter', zweit, { anbieter: daten.anbieter }) });
  }
  if (daten.modus === 'land-genre') {
    rueck.push({ href: listeSeitenPfad(locale, daten.type, 'land', erst), label: de ? `Beste ${wortTyp} ${daten.landAus}` : lt('land', erst, { land: daten.landAus }) });
    rueck.push({ href: listeSeitenPfad(locale, daten.type, 'genre', zweit), label: de ? genreListe : lt('genre', zweit, { genre: daten.genre }) });
  }
  if (daten.modus === 'anbieter') {
    rueck.push({ href: `/${locale}/streaming/${daten.wert}`, label: T.alleAuf(daten.anbieter) });
  }
  const rueckHtml = rueck.length
    ? `<p class="hinweis">${rueck.map((r) => `<a href="${attrEsc(r.href)}">${attrEsc(r.label)}</a>`).join(' · ')}</p>`
    : '';
  const verwandtHtml = (daten.verwandt || []).map((g) =>
    `<h2>${attrEsc(g.titel)}</h2>${listenChips(locale, daten.type, g.links)}`).join('');

  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${attrEsc(ueberschrift)}</h1>
    ${einleitungHtml(daten.text, locale)}
    ${rueckHtml}
    <div class="raster">${daten.titel.map((t) => karte(t, artWort, locale)).join('')}</div>
    ${verwandtHtml}
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteKinoStadt(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const pfad = `/${locale}/kino/${daten.stadtSlug}`;
  const titelZeile = `${T.kinoStadtTitel(daten.ort)} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.kinoStadtBeschr(daten.ort);
  const kette = [
    { label: S.start, href: SITE + '/' },
    { label: S.bereiche.kino, href: `/${locale}/kino` },
    { label: daten.ort },
  ];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: titelListe(daten.filme, 'film', locale),
  }, brotkrumenJsonLd(kette)];
  const kinosHtml = daten.kinos.map((k) =>
    `<li><b>${attrEsc(k.name)}</b>${k.strasse ? `, ${attrEsc(k.strasse)}` : ''}${k.plz ? `, ${attrEsc(k.plz)} ${attrEsc(daten.ort)}` : ''}${k.website ? ` — <a href="${attrEsc(k.website)}">${T.website}</a>` : ''}</li>`
  ).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${T.kinoStadtTitel(attrEsc(daten.ort))}</h1>
    ${einleitungHtml(daten.text, locale)}
    <p class="hinweis"><a href="/${locale}/kino/neustarts">${T.neustartsLink}</a></p>
    <h2>${T.aktuellKino}</h2>
    <div class="raster">${daten.filme.map((t) => karte(t, 'film', locale)).join('')}</div>
    <h2>${T.kinosIn(attrEsc(daten.ort))}</h2>
    <p class="hinweis">${T.keineSpielzeiten}</p>
    <ul>${kinosHtml}</ul>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

function genreListeHtml(genres, type, locale) {
  const sprache = sprachVon(locale);
  return `<div class="chips">${genres.map((g) => `<a class="chip" href="${genreHref(g, type, locale)}">${attrEsc(genreAnzeige(g, sprache))}</a>`).join('')}</div>`;
}

export function seiteFilmeSerienHub(daten, locale, art) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const hubWort = S.bereiche[daten.type === 'series' ? 'serien' : 'filme'];
  const artWort = daten.type === 'series' ? 'serie' : 'film';
  const pfad = `/${locale}/${art}`;
  const titelZeile = `${T.entdeckenTitel(hubWort)} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.entdeckenBeschr(hubWort);
  const kette = [{ label: S.start, href: SITE + '/' }, { label: hubWort }];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: titelListe(daten.titel, artWort, locale),
  }, brotkrumenJsonLd(kette)];
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${T.entdeckenH1(hubWort)}</h1>
    ${einleitungHtml(daten.text, locale)}
    <h2>${T.genres}</h2>
    ${genreListeHtml(daten.genres, daten.type, locale)}
    <h2>${T.beliebte(hubWort)}</h2>
    <div class="raster">${daten.titel.map((t) => karte(t, artWort, locale)).join('')}</div>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

const PERSONEN_HUB = {
  schauspieler: {
    titel: 'Schauspieler', h1: 'Schauspieler', ueberschrift: 'Häufig gesehene Gesichter',
    titelZeile: 'Schauspieler: Filmografie & bekannteste Rollen | MovieMatch',
    beschreibung: 'Bekannte Schauspielerinnen und Schauspieler mit Filmografie, Bewertungen und Verfügbarkeit.',
  },
  regisseur: {
    titel: 'Regisseure', h1: 'Regisseure', ueberschrift: 'Regisseure mit den meisten Titeln',
    titelZeile: 'Regisseure: Filmografie & bekannteste Filme | MovieMatch',
    beschreibung: 'Bekannte Regisseurinnen und Regisseure mit Filmografie, Bewertungen und Verfügbarkeit.',
  },
};

export function seitePersonenHub(daten, locale) {
  const tx = istDeutsch(locale) ? null : PERSON_TX[sprachVon(locale)];
  const cfg = tx ? tx.hub[daten.rolle] : PERSONEN_HUB[daten.rolle];
  const pfad = `/${locale}/${daten.rolle}`;
  const beschreibung = kurzfassung(daten.text) || cfg.beschreibung;
  const kette = [{ label: tx ? seoTexte(locale).start : 'Start', href: SITE + '/' }, { label: cfg.titel }];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: cfg.titelZeile,
    itemListElement: daten.personen.map((p, i) => listItem(i, p.name, `${SITE}/${locale}/${daten.rolle}/${p.slug}-${p.tmdbPersonId}`)),
  }, brotkrumenJsonLd(kette)];
  const kartenHtml = daten.personen.map((p) => `<a class="karte" href="/${locale}/${daten.rolle}/${p.slug}-${p.tmdbPersonId}">
      ${p.fotoPfad ? `<img src="https://image.tmdb.org/t/p/w300${attrEsc(p.fotoPfad)}" alt="${attrEsc(p.name)}" loading="lazy">` : ''}
      <div class="titel">${attrEsc(p.name)}</div>
      <div class="info">${tx ? tx.titelAnzahl(p.anzahl) : `${p.anzahl} Titel`}</div>
    </a>`).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${cfg.h1 || cfg.titel}</h1>
    ${tx ? einleitungHtml(daten.text, locale) : `<p class="einleitung">${textBlock(daten.text)}</p>`}
    <h2>${cfg.ueberschrift}</h2>
    <div class="raster">${kartenHtml}</div>
  `;
  return dokument({ locale, pfad, titelZeile: cfg.titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteKinoHub(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const pfad = `/${locale}/kino`;
  const titelZeile = `${T.kinoHubTitel} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.kinoHubBeschr;
  const kette = [{ label: S.start, href: SITE + '/' }, { label: S.bereiche.kino }];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: daten.staedte.map((s, i) => listItem(i, s.ort, `${SITE}/${locale}/kino/${s.slug}`)),
  }, brotkrumenJsonLd(kette)];
  const staedteHtml = daten.staedte.map((s) => `<a class="chip" href="/${locale}/kino/${s.slug}">${attrEsc(s.ort)}</a>`).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${T.kinoHubTitel}</h1>
    ${einleitungHtml(daten.text, locale)}
    <p class="hinweis"><a href="/${locale}/kino/neustarts">${T.neustartsLink}</a></p>
    <h2>${T.aktuellKino}</h2>
    <div class="raster">${daten.filme.map((t) => karte(t, 'film', locale)).join('')}</div>
    <h2>${T.kinosNachStadt}</h2>
    <div class="chips">${staedteHtml}</div>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteStreamingHub(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const pfad = `/${locale}/streaming`;
  const titelZeile = `${T.streamingHubTitel} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.streamingHubBeschr;
  const kette = [{ label: S.start, href: SITE + '/' }, { label: S.bereiche.streaming }];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: daten.anbieter.map((a, i) => listItem(i, a.name, `${SITE}/${locale}/streaming/${a.slug}`)),
  }, brotkrumenJsonLd(kette)];
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${T.streamingHubTitel}</h1>
    ${einleitungHtml(daten.text, locale)}
    <p class="hinweis"><a href="/${locale}/neu-auf">${T.neuStreamingLink}</a></p>
    <ul>${daten.anbieter.map((a) => `<li><a href="/${locale}/streaming/${a.slug}">${attrEsc(a.name)}</a> — ${T.titelAnzahl(a.anzahl)}</li>`).join('')}</ul>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteBestenlistenUebersicht(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const pfad = `/${locale}/bestenlisten`;
  const titelZeile = `${T.bestenTitel} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.bestenBeschr;
  const kette = [{ label: S.start, href: SITE + '/' }, { label: S.bereiche.bestenlisten }];
  const eintraege = T.bestenEintraege;
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: eintraege.map((e, i) => listItem(i, e.name, `${SITE}/${locale}/${e.pfad}`)),
  }, brotkrumenJsonLd(kette)];
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${attrEsc(S.bereiche.bestenlisten)}</h1>
    ${einleitungHtml(daten.text, locale)}
    <ul>${eintraege.map((e) => `<li><a href="/${locale}/${e.pfad}">${e.name}</a> — ${e.text}</li>`).join('')}</ul>
    ${daten.katalog ? `<h2>${T.besteWort(S.bereiche.filme)}</h2>${listenAbschnitte(daten.katalog.filme, 'movie', locale, 'h3')}<h2>${T.besteWort(S.bereiche.serien)}</h2>${listenAbschnitte(daten.katalog.serien, 'series', locale, 'h3')}` : ''}
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteBestenlisteHub(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const sprache = sprachVon(locale);
  const wortTyp = S.bereiche[daten.type === 'series' ? 'serien' : 'filme'];
  const listenWort = daten.type === 'series' ? 'beste-serien' : 'beste-filme';
  const pfad = `/${locale}/${listenWort}`;
  const titelZeile = `${T.besteHubTitel(wortTyp)} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.besteHubBeschr(wortTyp);
  const kette = [{ label: S.start, href: SITE + '/' }, { label: S.bereiche.bestenlisten, href: `${SITE}/${locale}/bestenlisten` }, { label: T.besteWort(wortTyp) }];
  const jsonLd = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: titelZeile }, brotkrumenJsonLd(kette)];
  const jahreHtml = daten.jahre.map((j) => `<a class="chip" href="/${locale}/${listenWort}/jahr/${j}">${j}</a>`).join('');
  const genreHtml = daten.genres.map((g) => `<a class="chip" href="/${locale}/${listenWort}/genre/${slugify(g)}">${attrEsc(genreAnzeige(g, sprache))}</a>`).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${T.besteWort(wortTyp)}</h1>
    ${einleitungHtml(daten.text, locale)}
    <h2>${T.nachJahr}</h2>
    <div class="chips">${jahreHtml}</div>
    <h2>${T.nachGenre}</h2>
    <div class="chips">${genreHtml}</div>
    ${daten.katalog ? listenAbschnitte(daten.katalog, daten.type, locale) : ''}
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

function reiheStreamingHtml(flatrate, locale) {
  const T = TX(locale);
  return flatrate.length
    ? T.imAboBei(flatrate.map((p) => anbieterHtml(p.name, p.anbieterSlug, locale)).join(', '))
    : T.keinAboReihe;
}

export function seiteReihe(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const dez = sprachVon(locale) === 'en' ? '.' : ',';
  const pfad = `/${locale}/reihen/${daten.slug}`;
  const ueberschrift = T.reiheH1(daten.name);
  const titelZeile = `${ueberschrift} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.reiheBeschr(ueberschrift, daten.titel.length);
  const kette = [
    { label: S.start, href: SITE + '/' },
    { label: S.bereiche.reihen, href: `${SITE}/${locale}/reihen` },
    { label: daten.name },
  ];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: ueberschrift, url: SITE + pfad,
    mainEntity: {
      '@type': 'ItemList', numberOfItems: daten.titel.length, itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: daten.titel.map((t, i) => ({
        '@type': 'ListItem', position: i + 1, name: t.title, url: `${SITE}/${locale}/film/${t.slug}-${t.tmdbId}`,
      })),
    },
  }, brotkrumenJsonLd(kette)];
  const zeilen = daten.titel.map((t) => {
    const wert = t.communityBewertung ? t.communityBewertung.durchschnitt : t.rating;
    const info = [t.year, wert ? `⭐ ${String(wert).replace('.', dez)}` : null].filter(Boolean).join(' · ');
    return `<li><a href="/${locale}/film/${attrEsc(t.slug)}-${t.tmdbId}">${attrEsc(t.title)}</a>${info ? ` (${info})` : ''}<br><span class="hinweis">${reiheStreamingHtml(t.flatrate, locale)}</span></li>`;
  }).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${attrEsc(ueberschrift)}</h1>
    ${einleitungHtml(daten.text, locale)}
    <div class="raster">${daten.titel.map((t) => karte(t, 'film', locale)).join('')}</div>
    <h2>${T.alleFilmeUeb}</h2>
    <ol>${zeilen}</ol>
    <p class="hinweis">${T.reiheFuss(`<a href="/${locale}/reihen">${T.alleReihen}</a>`)}</p>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteReihenUebersicht(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const pfad = `/${locale}/reihen`;
  const titelZeile = `${T.reihenTitel} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.reihenBeschr;
  const kette = [{ label: S.start, href: SITE + '/' }, { label: S.bereiche.reihen }];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: titelZeile, url: SITE + pfad,
    mainEntity: {
      '@type': 'ItemList', numberOfItems: daten.reihen.length,
      itemListElement: daten.reihen.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.name, url: `${SITE}/${locale}/reihen/${r.slug}` })),
    },
  }, brotkrumenJsonLd(kette)];
  const kachel = (r) => `<a class="karte" href="/${locale}/reihen/${attrEsc(r.slug)}">
    ${r.posterPath ? `<img src="https://image.tmdb.org/t/p/w342${attrEsc(r.posterPath)}" alt="${attrEsc(r.name)}" loading="lazy">` : ''}
    <div class="titel">${attrEsc(r.name)}</div>
    <div class="info">${T.anzahlFilme(r.anzahl)}</div>
  </a>`;
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${attrEsc(T.reihenH1)}</h1>
    ${einleitungHtml(daten.text, locale)}
    <h2>${T.beliebteReihen}</h2>
    <div class="raster">${daten.beliebt.map(kachel).join('')}</div>
    <h2>${T.alleReihenAZ}</h2>
    <ul>${daten.reihen.map((r) => `<li><a href="/${locale}/reihen/${attrEsc(r.slug)}">${attrEsc(r.name)}</a> — ${T.anzahlFilme(r.anzahl)}${r.jahrVon ? ` (${r.jahrVon}${r.jahrBis && r.jahrBis !== r.jahrVon ? '–' + r.jahrBis : ''})` : ''}</li>`).join('')}</ul>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

// Bereiche der Einstiegsseite. Reihenfolge = Anzeigereihenfolge; der Pfad ist
// zugleich der hub-Schluessel in seo_content (siehe seoSitemap.js).
const START_BEREICHE = [
  { pfad: 'filme', titel: 'Filme', text: 'Alle Filme nach Genre, mit Bewertungen und Verfügbarkeit.' },
  { pfad: 'serien', titel: 'Serien', text: 'Serien nach Genre, von der laufenden Staffel bis zum Abschluss.' },
  { pfad: 'bestenlisten', titel: 'Bestenlisten', text: 'Beste Filme und beste Serien nach Jahr und Genre.' },
  { pfad: 'reihen', titel: 'Reihen', text: 'Filmreihen und Franchises mit allen Filmen in Erscheinungsreihenfolge.' },
  { pfad: 'schauspieler', titel: 'Schauspieler', text: 'Bekannte Schauspielerinnen und Schauspieler mit Filmografie.' },
  { pfad: 'regisseur', titel: 'Regisseure', text: 'Regisseurinnen und Regisseure mit ihren Filmen und Serien.' },
  { pfad: 'streaming', titel: 'Streaming', text: 'Was bei welchem Anbieter läuft.' },
  { pfad: 'kino', titel: 'Kino', text: 'Aktuelle Kinostarts und Kinos nach Stadt.' },
  { pfad: 'neu-auf', titel: 'Neu im Streaming', text: 'Neuzugänge der letzten Tage bei Netflix, Prime Video und Co.' },
  { pfad: 'kino/neustarts', titel: 'Neu im Kino', text: 'Kinostarts dieser und der nächsten Woche.' },
];

export function seiteStart(daten, locale) {
  const pfad = `/${locale}/`;
  const T = seoTexte(locale);
  const titelZeile = `${T.startTitel} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || T.startBeschr;
  const indexierbar = textLocale(locale) === 'de-de' ? daten.indexierbar : !!(daten.indexierbar && localeIndexierbar(locale) && daten.text);
  // Kacheln nur fuer Bereiche, die in dieser Locale existieren.
  const bereiche = istDeutsch(locale) ? START_BEREICHE : TX(locale).startKacheln.filter((b) => hatSeitenart(locale, b.pfad.split('/')[0]));
  // Kein Breadcrumb: Diese Seite IST die Wurzel des SEO-Baums, eine Kette mit
  // einem einzigen Glied waere weder fuer Nutzer noch fuer Google von Nutzen.
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: titelZeile,
    ...(bereiche.length ? { hasPart: bereiche.map((b) => ({ '@type': 'WebPage', name: b.titel, url: `${SITE}/${locale}/${b.pfad}` })) } : {}),
  }];
  const kachelnHtml = bereiche.map((b) => `<li>
      <a href="/${locale}/${b.pfad}"><strong>${attrEsc(b.titel)}</strong></a>
      <span>${attrEsc(b.text)}</span>
    </li>`).join('');
  const bodyHtml = `
    <h1>${attrEsc(T.startTitel)}</h1>
    ${einleitungHtml(daten.text, locale)}
    ${kachelnHtml ? `<ul class="start-bereiche">${kachelnHtml}</ul>` : ''}
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar, jsonLd, bodyHtml });
}

// Zwei Saetze nur aus Katalogdaten, fuer Personen ohne Redaktionstext und
// ohne Biografie -- keine erfundenen Fakten, kein Pronomen (Geschlecht unbekannt).
// filmografie ist nach Bewertung sortiert, die ersten Titel sind die besten.
function kurzprofil(daten, rolleWort) {
  const titel = daten.filmografie.slice(0, 3).map((t) => (t.year ? `${t.title} (${t.year})` : t.title));
  const liste = titel.length > 1 ? `${titel.slice(0, -1).join(', ')} und ${titel[titel.length - 1]}` : titel[0];
  const satz1 = `${daten.name} ist ${rolleWort === 'Regisseur' ? 'Regisseur' : 'Schauspieler'}${daten.geburtstag ? `, geboren am ${daten.geburtstag}` : ''}.`;
  const satz2 = titel.length
    ? `Im MovieMatch-Katalog ${titel.length > 1 ? `zählen zu den am besten bewerteten Titeln ${liste}` : `ist ${liste} verzeichnet`}.`
    : '';
  return `${satz1} ${satz2}`.trim();
}

export function seitePerson(daten, locale) {
  const tx = istDeutsch(locale) ? null : PERSON_TX[sprachVon(locale)];
  const rolleWort = tx ? tx.rolle[daten.rolle] : (daten.rolle === 'regisseur' ? 'Regisseur' : 'Schauspieler');
  const pfad = `/${locale}/${daten.rolle}/${daten.slug}-${daten.tmdbPersonId}`;
  const titelZeile = tx ? tx.titelZeile(daten.name) : `${daten.name} — Filme & Serien im Überblick | MovieMatch`;
  const profil = tx ? '' : kurzprofil(daten, rolleWort);
  // Nicht-de: nur mit uebersetztem Text (seoData.js), Biografie/Kurzprofil sind deutsch bzw. englisch und bleiben draussen.
  const beschreibung = kurzfassung(daten.text) || (tx ? '' : kurzfassung(daten.biografie) || kurzfassung(profil));
  const hubTitel = tx ? tx.hub[daten.rolle].titel : PERSONEN_HUB[daten.rolle].titel;
  const kette = [
    { label: tx ? seoTexte(locale).start : 'Start', href: SITE + '/' },
    { label: hubTitel, href: `${SITE}/${locale}/${daten.rolle}` },
    { label: daten.name },
  ];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'Person', name: daten.name,
    birthDate: daten.geburtstag || undefined,
    image: daten.fotoPfad ? 'https://image.tmdb.org/t/p/w300' + daten.fotoPfad : undefined,
    description: tx ? (beschreibung || undefined) : (daten.biografie ? kurzfassung(daten.biografie, 300) : undefined),
  }, brotkrumenJsonLd(kette)];

  const fotoHtml = daten.fotoPfad
    ? `<img src="https://image.tmdb.org/t/p/w300${attrEsc(daten.fotoPfad)}" alt="${attrEsc(daten.name)}">`
    : '';
  const redaktionHtml = personInhaltHtml(daten.text, locale);
  const bioHtml = redaktionHtml || (tx ? '' : daten.biografie
    ? `<h2>Biografie</h2><div class="seo-text">${daten.biografie.split('\n').map((p) => p.trim()).filter(Boolean).map((p) => `<p>${attrEsc(p)}</p>`).join('')}</div>`
    : `<h2>Kurzprofil</h2><div class="seo-text"><p>${attrEsc(profil)}</p></div>`);
  const geboren = tx ? tx.geboren : 'geboren';
  const filmografie = tx ? tx.filmografie : 'Filmografie';
  const regie = tx ? tx.regie : ' (Regie)';

  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <div class="detail-kopf">
      ${fotoHtml}
      <div>
        <h1>${attrEsc(daten.name)}</h1>
        <div class="meta-zeile">${rolleWort}${daten.geburtstag ? ` · ${geboren} ` + attrEsc(daten.geburtstag) : ''}</div>
      </div>
    </div>
    ${bioHtml}
    <h2>${filmografie}${daten.rolle === 'regisseur' ? regie : ''}</h2>
    <div class="raster">${daten.filmografie.map((t) => karte(t, t.type === 'series' ? 'serie' : 'film', locale)).join('')}</div>
  `;
  // hreflang nur zu indexierbaren Gegenstuecken; de-de gibt es immer, sobald die Seite indexiert wird.
  const cluster = [...new Set([...localesMitText(['de-de']), ...(daten.textLocales || [])])].filter((l) => localeIndexierbar(l));
  const alternates = cluster.map((l) => ({ locale: l, pfad: `/${l}/${daten.rolle}/${daten.slug}-${daten.tmdbPersonId}` }));
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, alternates: alternates.length ? alternates : undefined, bodyHtml });
}

// ---- Wochen-Seiten (zeitabhaengig, Daten aus seoData.js, Regeln in seoWochen.js).

// Titel mit eigener Seite als Karte, die uebrigen als einfache Liste ohne Link
// (ein Link auf sie waere ein 404). ohneWort: 'weitere' | 'neue' | null (dann je nach Karten).
function wochenListeHtml(eintraege, artWort, locale, ohneWort = null) {
  const mit = eintraege.filter((e) => e.hatSeite);
  const ohne = eintraege.filter((e) => !e.hatSeite);
  return (mit.length ? `<div class="raster">${mit.map((t) => karte(t, artWort, locale)).join('')}</div>` : '')
    + (ohne.length
      ? `<p class="hinweis">${TX(locale).ohneSeite(ohneWort || (mit.length ? 'weitere' : 'neue'))}</p><ul>${ohne.map((t) => `<li>${attrEsc(t.title)}${t.year ? ` (${t.year})` : ''}</li>`).join('')}</ul>`
      : '');
}

// gruppen: [[eintraege, artWort], ...]. Nur Titel mit eigener Seite haben eine url.
function itemListJsonLd(name, gruppen, locale) {
  const mitSeite = gruppen.flatMap(([liste, art]) => liste.filter((e) => e.hatSeite).map((e) => [e, art]));
  return { '@context': 'https://schema.org', '@type': 'ItemList', name,
    itemListElement: mitSeite.map(([t, art], i) => listItem(i, t.title, `${SITE}/${locale}/${art}/${t.slug}-${t.tmdbId}`)) };
}

export function seiteNeuAufUebersicht(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const pfad = `/${locale}/neu-auf`;
  const titelZeile = `${T.neuUebTitel} | MovieMatch`;
  const beschreibung = T.neuUebBeschr(daten.stand);
  const kette = [{ label: S.start, href: SITE + '/' }, { label: S.bereiche.streaming, href: `/${locale}/streaming` }, { label: T.neuStreaming }];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: daten.anbieter.map((a, i) => listItem(i, T.neuAuf(a.name), `${SITE}/${locale}/neu-auf/${a.slug}`)),
  }, brotkrumenJsonLd(kette)];
  const zeilen = daten.anbieter.map((a) => {
    const n = a.filme.length + a.serien.length;
    return `<li><a href="/${locale}/neu-auf/${a.slug}">${T.neuAuf(attrEsc(a.name))}</a> — ${T.neuZeile(n, a.tage)}</li>`;
  }).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${T.neuStreaming}</h1>
    <p class="einleitung">${attrEsc(T.neuUebEinleitung(daten.stand))}</p>
    <ul>${zeilen}</ul>
    <p class="hinweis"><a href="/${locale}/streaming">${T.alleAnbieter}</a> · <a href="/${locale}/kino/neustarts">${T.neuImKino}</a></p>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteNeuAufAnbieter(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const pfad = `/${locale}/neu-auf/${daten.slug}`;
  const zeitraum = T.zeitraumStreaming(daten.tage);
  const titelZeile = `${T.neuAnbTitel(daten.name, zeitraum)} | MovieMatch`;
  const n = daten.filme.length + daten.serien.length;
  const einleitung = T.streamingEinleitung({ name: daten.name, tage: daten.tage, filme: daten.filme.length, serien: daten.serien.length, stand: daten.stand });
  const beschreibung = kurzfassung(einleitung);
  const kette = [
    { label: S.start, href: SITE + '/' },
    { label: T.neuStreaming, href: `/${locale}/neu-auf` },
    { label: daten.name },
  ];
  const jsonLd = [itemListJsonLd(titelZeile, [[daten.filme, 'film'], [daten.serien, 'serie']], locale), brotkrumenJsonLd(kette)];
  const chips = [];
  if (daten.filme.length) chips.push(`<a class="chip" href="#filme">${T.chipFilme(daten.filme.length)}</a>`);
  if (daten.serien.length) chips.push(`<a class="chip" href="#serien">${T.chipSerien(daten.serien.length)}</a>`);
  const andere = (daten.andere || []).map((a) => `<a class="chip" href="/${locale}/neu-auf/${a.slug}">${attrEsc(a.name)}</a>`).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${T.neuAuf(attrEsc(daten.name))}</h1>
    <p class="einleitung">${attrEsc(einleitung)}</p>
    ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
    ${daten.filme.length ? `<h2 id="filme">${T.neueFilme}</h2>${wochenListeHtml(daten.filme, 'film', locale)}` : ''}
    ${daten.serien.length ? `<h2 id="serien">${T.neueSerien}</h2>${wochenListeHtml(daten.serien, 'serie', locale)}` : ''}
    <p class="hinweis"><a href="/${locale}/streaming/${daten.slug}">${T.alleTitelAuf(attrEsc(daten.name))}</a> · <a href="/${locale}/neu-auf">${T.neuBeiAllen}</a></p>
    ${andere ? `<h2>${T.neuBeiAnderen}</h2><div class="chips">${andere}</div>` : ''}
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar && n > 0, jsonLd, bodyHtml });
}

export function seiteKinoNeustarts(daten, locale) {
  const S = seoTexte(locale);
  const T = TX(locale);
  const pfad = `/${locale}/kino/neustarts`;
  const titelZeile = `${T.kinoNeuTitel(T.zeitraumKino(daten.tage))} | MovieMatch`;
  const einleitung = T.kinoEinleitung({ tage: daten.tage, gestartet: daten.gestartet.length, naechste: daten.naechste.length, stand: daten.stand });
  const beschreibung = kurzfassung(einleitung);
  const kette = [{ label: S.start, href: SITE + '/' }, { label: S.bereiche.kino, href: `/${locale}/kino` }, { label: T.neustarts }];
  const jsonLd = [itemListJsonLd(titelZeile, [[daten.gestartet, 'film'], [daten.naechste, 'film']], locale), brotkrumenJsonLd(kette)];
  // Starttag je Titel sichtbar: "Start 08.10." -- die Seite zeigt so selbst, was "neu" heisst.
  const mitStart = (liste) => liste.map((t) => ({ ...t, year: t.year }));
  const staedteHtml = daten.staedte.map((s) => `<a class="chip" href="/${locale}/kino/${s.slug}">${attrEsc(s.ort)}</a>`).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette, locale)}
    <h1>${T.neuImKino}</h1>
    <p class="einleitung">${attrEsc(einleitung)}</p>
    <h2>${T.gestartetH2(daten.tage)}</h2>
    ${daten.gestartet.length ? wochenListeHtml(mitStart(daten.gestartet), 'film', locale) : `<p class="hinweis">${T.keineNeustarts}</p>`}
    ${daten.naechste.length ? `<h2>${T.naechsteWoche}</h2>${wochenListeHtml(mitStart(daten.naechste), 'film', locale)}` : ''}
    <p class="hinweis"><a href="/${locale}/kino">${T.kinoUebersicht}</a> · <a href="/${locale}/beste-filme/im-kino">${T.besteImKino}</a> · <a href="/${locale}/neu-auf">${T.neuStreaming}</a></p>
    ${staedteHtml ? `<h2>${T.kinosNachStadt}</h2><div class="chips">${staedteHtml}</div>` : ''}
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seite404(locale) {
  const T = seoTexte(locale);
  return dokument({
    locale,
    pfad: `/${locale}/`,
    titelZeile: `${T.nf404Titel} | MovieMatch`,
    beschreibung: T.nf404Beschr,
    indexierbar: false,
    bodyHtml: `<h1>${attrEsc(T.nf404Titel)}</h1><p>${attrEsc(T.nf404Text)}</p>`,
  });
}

export { kurzfassung };
