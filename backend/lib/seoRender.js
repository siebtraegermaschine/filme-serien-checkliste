// Baut vollstaendige, eigenstaendige HTML-Dokumente fuer die SEO-Seiten
// (PLAN-SEO.md, Plan "SEO-Seiten: technische Umsetzung"). Kein Splicing wie
// bei der App-OG-Route (server.js) -- jede Funktion hier gibt ein fertiges
// Dokument zurueck. Kein App-JS, eigenes seo.css (Architektur-Entscheidung 1).
import { hreflangCode } from './seoLocale.js';
import { slugify } from './slug.js';

export const SITE = 'https://movietaste.de';

// Von server.js mitverwendet statt dort dupliziert (frueher server.js
// eigene Kopie).
export function attrEsc(wert) {
  return String(wert == null ? '' : wert)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const BILD_FALLBACK = SITE + '/og-image.png';

// FREIGEGEBEN (Christian, 17.08.2026). Die frühere Gesamtsperre ist entfallen.
//
// Die Regel lautet ab jetzt dauerhaft: Eine Seite wird genau dann indexiert,
// wenn sie eigenen Inhalt hat. Angelegte URLs ohne Inhalt bleiben erreichbar,
// tragen aber "noindex" -- und kippen automatisch auf "index", sobald ein Text
// dafuer vorliegt. Es ist kein weiterer Schalter noetig: Jede Seite kennt ihre
// Indexierbarkeit bereits selbst (seoData.js liefert `indexierbar`, im
// Regelfall = es existiert eine seo_content-Zeile; bei Listen- und
// Personenseiten kommt hinzu, dass auch Eintraege vorhanden sein muessen).
//
// Wer neue Seitentypen ergaenzt, muss `indexierbar` nach derselben Regel
// setzen -- NIE hart auf true.
//
// "follow" steht auch bei noindex, und robots.txt sperrt /de-de/ NICHT: Ein
// Crawler muss die Seite abrufen duerfen, um das noindex ueberhaupt zu lesen.
// Wer beides gleichzeitig macht (Disallow + noindex), erreicht das Gegenteil --
// bereits indexierte Seiten blieben dann im Index stehen.

function kopf({ locale, pfad, titelZeile, beschreibung, indexierbar, bild, jsonLd, alternates }) {
  const url = SITE + pfad;
  const robots = indexierbar ? 'index,follow' : 'noindex,follow';
  const hreflangs = (alternates && alternates.length ? alternates : [{ locale, pfad }])
    .map((a) => `<link rel="alternate" hreflang="${attrEsc(hreflangCode(a.locale))}" href="${attrEsc(SITE + a.pfad)}">`)
    .join('\n  ');
  const ld = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
  return `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${attrEsc(titelZeile)}</title>
  <meta name="description" content="${attrEsc(beschreibung)}">
  <meta name="robots" content="${robots}">
  <link rel="canonical" href="${attrEsc(url)}">
  ${hreflangs}
  <link rel="alternate" hreflang="x-default" href="${attrEsc(url)}">
  <link rel="stylesheet" href="/seo.css">
  <link rel="icon" href="/favicon-32.png">
  <meta property="og:site_name" content="MovieMatch">
  <meta property="og:url" content="${attrEsc(url)}">
  <meta property="og:title" content="${attrEsc(titelZeile)}">
  <meta property="og:description" content="${attrEsc(beschreibung)}">
  <meta property="og:image" content="${attrEsc(bild || BILD_FALLBACK)}">
  ${ld.map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`).join('\n  ')}`;
}

function kopfzeile() {
  return `<header class="seo-kopf">
    <a class="marke" href="${SITE}/">Movie<span>Match</span></a>
    <nav class="seo-nav">
      <a href="${SITE}/">Zur App</a>
    </nav>
  </header>`;
}

function fusszeile() {
  return `<footer>
    <a href="${SITE}/impressum.html">Impressum</a>
    <a href="${SITE}/datenschutz.html">Datenschutz</a>
  </footer>`;
}

function dokument({ locale, pfad, titelZeile, beschreibung, indexierbar, bild, jsonLd, alternates, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="${locale.split('-')[0]}">
<head>
  ${kopf({ locale, pfad, titelZeile, beschreibung, indexierbar, bild, jsonLd, alternates })}
</head>
<body>
  ${kopfzeile()}
  <main>
    ${bodyHtml}
  </main>
  ${fusszeile()}
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

function bewertungsZeile(titel) {
  const teile = [];
  if (titel.rating != null && titel.rating > 0) {
    teile.push('⭐ ' + String(titel.rating).replace('.', ','));
  }
  if (titel.year) teile.push(String(titel.year));
  if (titel.genres && titel.genres.length) teile.push(titel.genres.join(', '));
  return teile.join(' · ');
}

function anbieterHtml(name, anbieterSlug, locale) {
  return anbieterSlug
    ? `<a href="/${locale}/streaming/${anbieterSlug}">${attrEsc(name)}</a>`
    : attrEsc(name);
}

function verfuegbarkeitHtml(streaming, locale) {
  const flatrate = streaming.flatrate || [];
  if (!flatrate.length) return '<p class="hinweis">Aktuell bei keinem bekannten Streaming-Anbieter im Abo verfuegbar.</p>';
  return `<p>Im Abo verfuegbar bei: ${flatrate.map((p) => anbieterHtml(p.name, p.anbieterSlug, locale)).join(', ')}.</p>`;
}

function genreHref(genre, type, locale) {
  return `/${locale}/${type === 'series' ? 'serien' : 'filme'}/${slugify(genre)}`;
}

function genreLinksHtml(genres, type, locale) {
  return (genres || []).map((g) => `<a href="${genreHref(g, type, locale)}">${attrEsc(g)}</a>`).join(', ');
}

// Breadcrumbs dienen der Crawlbarkeit UND dem Nutzer: sichtbare Navigation
// nach oben (Titel -> Genre -> Hub -> Start), zusaetzlich als BreadcrumbList
// strukturierte Daten. `kette` ist [{label, href}], das letzte Glied (die
// aktuelle Seite) traegt kein href.
function brotkrumenHtml(kette) {
  return `<nav class="brotkrumen" aria-label="Brotkrumen">${kette.map((k, i) =>
    (i > 0 ? ' › ' : '') + (k.href ? `<a href="${k.href}">${attrEsc(k.label)}</a>` : `<span>${attrEsc(k.label)}</span>`)
  ).join('')}</nav>`;
}

// Das letzte Glied (aktuelle Seite) braucht laut Google-Vorgabe kein "item" --
// JSON.stringify laesst `undefined`-Werte ohnehin weg.
function brotkrumenJsonLd(kette) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: kette.map((k, i) => ({
      '@type': 'ListItem', position: i + 1, name: k.label,
      item: k.href ? (k.href.startsWith('http') ? k.href : SITE + k.href) : undefined,
    })),
  };
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

function inhaltHtmlBauen(text) {
  const neu = parseNeueAbschnitte(text);
  if (neu) {
    return NEUE_ABSCHNITTE
      .filter((h) => neu[h])
      .map((h) => `<h2>${attrEsc(h)}</h2>${absaetzeHtml(neu[h].split('\n\n').map((p) => p.trim()).filter(Boolean))}`)
      .join('');
  }
  const { worum, warum } = textAbschnitte(text);
  return `<h2>Worum es geht</h2>${worum ? absaetzeHtml(worum) : '<p class="hinweis">Beschreibung folgt in Kuerze.</p>'}`
    + (warum ? `<h2>Warum sich der Titel lohnt</h2>${absaetzeHtml(warum)}` : '');
}

export function seiteTitelDetail(titel, locale) {
  const artWort = titel.type === 'series' ? 'serie' : 'film';
  const listenWort = titel.type === 'series' ? 'serien' : 'filme';
  const hubWort = titel.type === 'series' ? 'Serien' : 'Filme';
  const pfad = `/${locale}/${artWort}/${titel.slug}-${titel.tmdbId}`;
  const titelZeile = `${titel.title}${titel.year ? ' (' + titel.year + ')' : ''} — Stream, Bewertung & Kino | MovieMatch`;
  const beschreibung = kurzfassung(titel.text) || `${titel.title}: Verfuegbarkeit, Bewertung und mehr auf MovieMatch.`;
  const bild = titel.backdropPath
    ? 'https://image.tmdb.org/t/p/w1280' + titel.backdropPath
    : (titel.posterPath ? 'https://image.tmdb.org/t/p/w500' + titel.posterPath : null);
  const erstesGenre = (titel.genres || [])[0];

  const kette = [
    { label: 'Start', href: SITE + '/' },
    { label: hubWort, href: `/${locale}/${listenWort}` },
    ...(erstesGenre ? [{ label: erstesGenre, href: genreHref(erstesGenre, titel.type, locale) }] : []),
    { label: titel.title },
  ];

  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': titel.type === 'series' ? 'TVSeries' : 'Movie',
    name: titel.title,
    datePublished: titel.year ? String(titel.year) : undefined,
    genre: titel.genres,
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
    titel.director ? ['Regie', titel.regisseurPersonId
      ? `<a href="/${locale}/regisseur/${slugify(titel.director)}-${titel.regisseurPersonId}">${attrEsc(titel.director)}</a>`
      : attrEsc(titel.director)] : null,
    (titel.genres || []).length ? ['Genre', genreLinksHtml(titel.genres, titel.type, locale)] : null,
    titel.laufzeitMinuten ? ['Laufzeit', `${titel.laufzeitMinuten} Minuten`] : null,
    titel.erscheinungsdatum ? ['Erscheinungsdatum', titel.erscheinungsdatum] : (titel.year ? ['Jahr', String(titel.year)] : null),
    titel.certification ? ['Altersfreigabe', 'FSK ' + attrEsc(titel.certification)] : null,
    titel.budget ? ['Budget', `${Number(titel.budget).toLocaleString('de-DE')} $`] : null,
    titel.einspielergebnis ? ['Einspielergebnis', `${Number(titel.einspielergebnis).toLocaleString('de-DE')} $`] : null,
    titel.rating != null ? ['TMDB-Bewertung', String(titel.rating).replace('.', ',') + (titel.voteCount ? ` (${titel.voteCount.toLocaleString('de-DE')} Stimmen)` : '')] : null,
    ['Community-Bewertung', titel.communityBewertung
      ? `${String(titel.communityBewertung.durchschnitt).replace('.', ',')} von 10 (${titel.communityBewertung.gesamt} Bewertungen)`
      : '<span class="hinweis">noch unter der Mindestzahl</span>'],
    (titel.streaming.flatrate || []).length
      ? ['Verfügbar bei', titel.streaming.flatrate.map((p) => anbieterHtml(p.name, p.anbieterSlug, locale)).join(', ')]
      : null,
  ].filter(Boolean);
  const faktenHtml = `<table class="fakten">${faktenZeilen.map(([k, v]) => `<tr><th>${attrEsc(k)}</th><td>${v}</td></tr>`).join('')}</table>`;

  // Besetzung MIT Rollennamen, wenn vorhanden (titeldetails.js) -- sonst
  // Ruecksturz auf die reine Namensliste aus titles.cast_names.
  const besetzungHtml = (titel.besetzungRollen && titel.besetzungRollen.length)
    ? `<ul class="besetzung-liste">${titel.besetzungRollen.map((c) => `<li><b>${attrEsc(c.name)}</b>${c.rolle ? ` als ${attrEsc(c.rolle)}` : ''}</li>`).join('')}</ul>`
    : ((titel.castNames || []).length
      ? `<p>${titel.castNames.slice(0, 10).map(attrEsc).join(', ')}</p>`
      : '<p class="hinweis">Keine Besetzung hinterlegt.</p>');

  const trailerHtml = titel.trailerKey
    ? `<h2>Trailer</h2><div class="video-wrapper"><iframe src="https://www.youtube-nocookie.com/embed/${attrEsc(titel.trailerKey)}" title="Trailer zu ${attrEsc(titel.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
    : '';

  const bilderHtml = (titel.bilder || []).length
    ? `<h2>Bilder</h2><div class="galerie">${titel.bilder.map((pfad) => `<img src="https://image.tmdb.org/t/p/w500${attrEsc(pfad)}" alt="${attrEsc(titel.title)}" loading="lazy">`).join('')}</div>`
    : '';

  const regisseurName = titel.regisseurPersonId
    ? `<a href="/${locale}/regisseur/${slugify(titel.director)}-${titel.regisseurPersonId}">${attrEsc(titel.director)}</a>`
    : attrEsc(titel.director);
  const regisseurFilmeHtml = titel.regisseurFilme.length
    ? `<h3>Weitere Filme von ${regisseurName}</h3><div class="raster">${titel.regisseurFilme.map((t) => karte(t, artWort, locale)).join('')}</div>`
    : '';

  const aehnlicheHtml = titel.aehnlicheTitel.length
    ? `<h2>Ähnliche Titel</h2><div class="raster">${titel.aehnlicheTitel.map((t) => karte(t, artWort, locale)).join('')}</div>`
    : '';

  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <div class="detail-kopf">
      ${posterHtml}
      <div>
        <h1>${attrEsc(titel.title)}${titel.year ? ` <span class="hinweis">(${titel.year})</span>` : ''}</h1>
        <div class="meta-zeile">${attrEsc(bewertungsZeile(titel))}</div>
        <a class="cta" href="${SITE}/t/${titel.type}/${titel.tmdbId}">Zur Watchlist hinzufügen</a>
      </div>
    </div>
    <h2>Kurzüberblick</h2>
    ${faktenHtml}
    ${trailerHtml}
    ${inhaltHtmlBauen(titel.text)}
    ${bilderHtml}
    <h2>Besetzung & Stab</h2>
    ${besetzungHtml}
    ${regisseurFilmeHtml}
    ${aehnlicheHtml}
    <h2>Verfügbarkeit</h2>
    ${verfuegbarkeitHtml(titel.streaming, locale)}
  `;

  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: titel.indexierbar, bild, jsonLd, bodyHtml });
}

function textBlock(text) {
  return text
    ? `<div class="seo-text">${text.split('\n\n').map((p) => `<p>${attrEsc(p)}</p>`).join('')}</div>`
    : '<p class="hinweis">Beschreibung folgt in Kuerze.</p>';
}

// Aufrufer geben artWort ('film'|'serie') mit, da eine Trefferliste (Genre/
// Bestenliste) i.d.R. nur einen Typ enthaelt, aber die Kartenfunktion das
// nicht selbst kennt.
function karte(t, artWort, locale) {
  const bild = t.posterPath ? `https://image.tmdb.org/t/p/w342${attrEsc(t.posterPath)}` : '';
  const href = `/${locale}/${artWort}/${attrEsc(t.slug)}-${t.tmdbId}`;
  const bewertung = t.communityBewertung
    ? `⭐ ${String(t.communityBewertung.durchschnitt).replace('.', ',')}`
    : (t.rating ? `⭐ ${String(t.rating).replace('.', ',')}` : '');
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
  const artWort = daten.type === 'series' ? 'serie' : 'film';
  const listenWort = daten.type === 'series' ? 'serien' : 'filme';
  const hubWort = daten.type === 'series' ? 'Serien' : 'Filme';
  const pfad = `/${locale}/${listenWort}/${daten.genreSlug}`;
  const titelZeile = `Beste ${attrEsc(daten.genre)}-${hubWort} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || `Die besten ${daten.genre}-Titel im Überblick, sortiert nach Bewertung.`;
  const kette = [
    { label: 'Start', href: SITE + '/' },
    { label: hubWort, href: `/${locale}/${listenWort}` },
    { label: daten.genre },
  ];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList',
    name: titelZeile,
    itemListElement: daten.titel.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.title })),
  }, brotkrumenJsonLd(kette)];
  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <h1>Beste ${attrEsc(daten.genre)}-${hubWort}</h1>
    <p class="einleitung">${textBlock(daten.text)}</p>
    <div class="raster">${daten.titel.map((t) => karte(t, artWort, locale)).join('')}</div>
    ${seitenNavigation(pfad, daten.seite, daten.seiten)}
  `;
  return dokument({ locale, pfad: daten.seite > 1 ? `${pfad}?seite=${daten.seite}` : pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar && daten.seite === 1, jsonLd, bodyHtml });
}

export function seiteAnbieter(daten, locale) {
  const pfad = `/${locale}/streaming/${daten.anbieterSlug}`;
  const titelZeile = `Filme & Serien auf ${attrEsc(daten.name)} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || `Aktuelle Filme und Serien auf ${daten.name} im Überblick.`;
  const kette = [
    { label: 'Start', href: SITE + '/' },
    { label: 'Streaming', href: `/${locale}/streaming` },
    { label: daten.name },
  ];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: [...daten.filme, ...daten.serien].map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.title })),
  }, brotkrumenJsonLd(kette)];
  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <h1>Filme & Serien auf ${attrEsc(daten.name)}</h1>
    <p class="einleitung">${textBlock(daten.text)}</p>
    <h2>Filme</h2>
    <div class="raster">${daten.filme.map((t) => karte(t, 'film', locale)).join('')}</div>
    <h2>Serien</h2>
    <div class="raster">${daten.serien.map((t) => karte(t, 'serie', locale)).join('')}</div>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteBestenliste(daten, locale) {
  const artWort = daten.type === 'series' ? 'serie' : 'film';
  const wortTyp = daten.type === 'series' ? 'Serien' : 'Filme';
  const listenWort = daten.type === 'series' ? 'beste-serien' : 'beste-filme';
  const bezeichnung = daten.modus === 'jahr' ? String(daten.wert) : attrEsc(daten.wert);
  const pfad = `/${locale}/${listenWort}/${daten.modus}/${daten.wert}`;
  const titelZeile = `Beste ${wortTyp} ${daten.modus === 'jahr' ? bezeichnung : '(' + bezeichnung + ')'} | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || `Die besten ${wortTyp} ${bezeichnung} im Überblick.`;
  const kette = [
    { label: 'Start', href: SITE + '/' },
    { label: `Beste ${wortTyp}`, href: `/${locale}/${listenWort}` },
    { label: bezeichnung },
  ];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: daten.titel.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.title })),
  }, brotkrumenJsonLd(kette)];
  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <h1>Beste ${wortTyp} ${daten.modus === 'jahr' ? bezeichnung : ''}</h1>
    <p class="einleitung">${textBlock(daten.text)}</p>
    <div class="raster">${daten.titel.map((t) => karte(t, artWort, locale)).join('')}</div>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteKinoStadt(daten, locale) {
  const pfad = `/${locale}/kino/${daten.stadtSlug}`;
  const titelZeile = `Kino in ${attrEsc(daten.ort)}: Aktuelle Filme | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || `Aktuelle Kinostarts und Kinos in ${daten.ort} im Überblick.`;
  const kette = [
    { label: 'Start', href: SITE + '/' },
    { label: 'Kino', href: `/${locale}/kino` },
    { label: daten.ort },
  ];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: daten.filme.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.title })),
  }, brotkrumenJsonLd(kette)];
  const kinosHtml = daten.kinos.map((k) =>
    `<li><b>${attrEsc(k.name)}</b>${k.strasse ? `, ${attrEsc(k.strasse)}` : ''}${k.plz ? `, ${attrEsc(k.plz)} ${attrEsc(daten.ort)}` : ''}${k.website ? ` — <a href="${attrEsc(k.website)}">Website</a>` : ''}</li>`
  ).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <h1>Kino in ${attrEsc(daten.ort)}: Aktuelle Filme</h1>
    <p class="einleitung">${textBlock(daten.text)}</p>
    <h2>Aktuell im Kino</h2>
    <div class="raster">${daten.filme.map((t) => karte(t, 'film', locale)).join('')}</div>
    <h2>Kinos in ${attrEsc(daten.ort)}</h2>
    <p class="hinweis">Spielzeiten sind noch nicht verfuegbar.</p>
    <ul>${kinosHtml}</ul>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

function genreListeHtml(genres, type, locale) {
  return `<div class="chips">${genres.map((g) => `<a class="chip" href="${genreHref(g, type, locale)}">${attrEsc(g)}</a>`).join('')}</div>`;
}

export function seiteFilmeSerienHub(daten, locale, art) {
  const hubWort = daten.type === 'series' ? 'Serien' : 'Filme';
  const artWort = daten.type === 'series' ? 'serie' : 'film';
  const pfad = `/${locale}/${art}`;
  const titelZeile = `${hubWort} entdecken — Bewertung, Streaming & mehr | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || `${hubWort} nach Genre, Bewertung und Verfügbarkeit entdecken.`;
  const kette = [{ label: 'Start', href: SITE + '/' }, { label: hubWort }];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: daten.titel.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.title })),
  }, brotkrumenJsonLd(kette)];
  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <h1>${hubWort} entdecken</h1>
    <p class="einleitung">${textBlock(daten.text)}</p>
    <h2>Genres</h2>
    ${genreListeHtml(daten.genres, daten.type, locale)}
    <h2>Beliebte ${hubWort}</h2>
    <div class="raster">${daten.titel.map((t) => karte(t, artWort, locale)).join('')}</div>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteKinoHub(daten, locale) {
  const pfad = `/${locale}/kino`;
  const titelZeile = 'Kino: Aktuelle Filme & Kinos in deiner Stadt | MovieMatch';
  const beschreibung = kurzfassung(daten.text) || 'Aktuelle Kinostarts und Kinos nach Stadt im Überblick.';
  const kette = [{ label: 'Start', href: SITE + '/' }, { label: 'Kino' }];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: daten.staedte.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.ort })),
  }, brotkrumenJsonLd(kette)];
  const staedteHtml = daten.staedte.map((s) => `<a class="chip" href="/${locale}/kino/${s.slug}">${attrEsc(s.ort)}</a>`).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <h1>Kino: Aktuelle Filme & Kinos in deiner Stadt</h1>
    <p class="einleitung">${textBlock(daten.text)}</p>
    <h2>Aktuell im Kino</h2>
    <div class="raster">${daten.filme.map((t) => karte(t, 'film', locale)).join('')}</div>
    <h2>Kinos nach Stadt</h2>
    <div class="chips">${staedteHtml}</div>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteStreamingHub(daten, locale) {
  const pfad = `/${locale}/streaming`;
  const titelZeile = 'Streaming-Anbieter im Überblick | MovieMatch';
  const beschreibung = kurzfassung(daten.text) || 'Filme und Serien nach Streaming-Anbieter im Überblick.';
  const kette = [{ label: 'Start', href: SITE + '/' }, { label: 'Streaming' }];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: titelZeile,
    itemListElement: daten.anbieter.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.name })),
  }, brotkrumenJsonLd(kette)];
  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <h1>Streaming-Anbieter im Überblick</h1>
    <p class="einleitung">${textBlock(daten.text)}</p>
    <ul>${daten.anbieter.map((a) => `<li><a href="/${locale}/streaming/${a.slug}">${attrEsc(a.name)}</a> — ${a.anzahl} Titel</li>`).join('')}</ul>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seiteBestenlisteHub(daten, locale) {
  const wortTyp = daten.type === 'series' ? 'Serien' : 'Filme';
  const listenWort = daten.type === 'series' ? 'beste-serien' : 'beste-filme';
  const pfad = `/${locale}/${listenWort}`;
  const titelZeile = `Beste ${wortTyp}: Bestenlisten nach Jahr & Genre | MovieMatch`;
  const beschreibung = kurzfassung(daten.text) || `Bestenlisten der ${wortTyp} nach Jahr und Genre.`;
  const kette = [{ label: 'Start', href: SITE + '/' }, { label: `Beste ${wortTyp}` }];
  const jsonLd = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: titelZeile }, brotkrumenJsonLd(kette)];
  const jahreHtml = daten.jahre.map((j) => `<a class="chip" href="/${locale}/${listenWort}/jahr/${j}">${j}</a>`).join('');
  const genreHtml = daten.genres.map((g) => `<a class="chip" href="/${locale}/${listenWort}/genre/${slugify(g)}">${attrEsc(g)}</a>`).join('');
  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <h1>Beste ${wortTyp}</h1>
    <p class="einleitung">${textBlock(daten.text)}</p>
    <h2>Nach Jahr</h2>
    <div class="chips">${jahreHtml}</div>
    <h2>Nach Genre</h2>
    <div class="chips">${genreHtml}</div>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

// Bereiche der Einstiegsseite. Reihenfolge = Anzeigereihenfolge; der Pfad ist
// zugleich der hub-Schluessel in seo_content (siehe seoSitemap.js).
const START_BEREICHE = [
  { pfad: 'filme', titel: 'Filme', text: 'Alle Filme nach Genre, mit Bewertungen und Verfügbarkeit.' },
  { pfad: 'serien', titel: 'Serien', text: 'Serien nach Genre, von der laufenden Staffel bis zum Abschluss.' },
  { pfad: 'beste-filme', titel: 'Beste Filme', text: 'Bestenlisten nach Jahr und Genre.' },
  { pfad: 'beste-serien', titel: 'Beste Serien', text: 'Die höchstbewerteten Serien nach Jahr und Genre.' },
  { pfad: 'streaming', titel: 'Streaming', text: 'Was bei welchem Anbieter läuft.' },
  { pfad: 'kino', titel: 'Kino', text: 'Aktuelle Kinostarts und Kinos nach Stadt.' },
];

export function seiteStart(daten, locale) {
  const pfad = `/${locale}/`;
  const titelZeile = 'Filme & Serien im Überblick | MovieMatch';
  const beschreibung = kurzfassung(daten.text)
    || 'Filme und Serien nach Genre, Bestenlisten, Streaming-Anbieter und Kinostarts im Überblick.';
  // Kein Breadcrumb: Diese Seite IST die Wurzel des SEO-Baums, eine Kette mit
  // einem einzigen Glied waere weder fuer Nutzer noch fuer Google von Nutzen.
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: titelZeile,
    hasPart: START_BEREICHE.map((b) => ({ '@type': 'WebPage', name: b.titel, url: `${SITE}/${locale}/${b.pfad}` })),
  }];
  const kachelnHtml = START_BEREICHE.map((b) => `<li>
      <a href="/${locale}/${b.pfad}"><strong>${attrEsc(b.titel)}</strong></a>
      <span>${attrEsc(b.text)}</span>
    </li>`).join('');
  const bodyHtml = `
    <h1>Filme &amp; Serien im Überblick</h1>
    <p class="einleitung">${textBlock(daten.text)}</p>
    <ul class="start-bereiche">${kachelnHtml}</ul>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seitePerson(daten, locale) {
  const rolleWort = daten.rolle === 'regisseur' ? 'Regisseur' : 'Schauspieler';
  const pfad = `/${locale}/${daten.rolle}/${daten.slug}-${daten.tmdbPersonId}`;
  const titelZeile = `${daten.name} — Filme & Serien im Überblick | MovieMatch`;
  const beschreibung = kurzfassung(daten.biografie) || `${daten.name}: Filmografie, Bewertungen und Verfügbarkeit auf MovieMatch.`;
  // Keine eigene Hub-Seite fuer Schauspieler/Regisseure in dieser Runde
  // (siehe PLAN-SEO.md 1.5/1.6) -- Breadcrumb bleibt zweistufig.
  const kette = [{ label: 'Start', href: SITE + '/' }, { label: daten.name }];
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'Person', name: daten.name,
    birthDate: daten.geburtstag || undefined,
    image: daten.fotoPfad ? 'https://image.tmdb.org/t/p/w300' + daten.fotoPfad : undefined,
    description: daten.biografie ? kurzfassung(daten.biografie, 300) : undefined,
  }, brotkrumenJsonLd(kette)];

  const fotoHtml = daten.fotoPfad
    ? `<img src="https://image.tmdb.org/t/p/w300${attrEsc(daten.fotoPfad)}" alt="${attrEsc(daten.name)}">`
    : '';
  const bioHtml = daten.biografie
    ? `<div class="seo-text">${daten.biografie.split('\n').map((p) => p.trim()).filter(Boolean).map((p) => `<p>${attrEsc(p)}</p>`).join('')}</div>`
    : '<p class="hinweis">Keine Biografie verfügbar.</p>';

  const bodyHtml = `
    ${brotkrumenHtml(kette)}
    <div class="detail-kopf">
      ${fotoHtml}
      <div>
        <h1>${attrEsc(daten.name)}</h1>
        <div class="meta-zeile">${rolleWort}${daten.geburtstag ? ' · geboren ' + attrEsc(daten.geburtstag) : ''}</div>
      </div>
    </div>
    <h2>Biografie</h2>
    ${bioHtml}
    <h2>Filmografie${rolleWort === 'Regisseur' ? ' (Regie)' : ''}</h2>
    <div class="raster">${daten.filmografie.map((t) => karte(t, t.type === 'series' ? 'serie' : 'film', locale)).join('')}</div>
  `;
  return dokument({ locale, pfad, titelZeile, beschreibung, indexierbar: daten.indexierbar, jsonLd, bodyHtml });
}

export function seite404(locale) {
  return dokument({
    locale,
    pfad: `/${locale}/`,
    titelZeile: 'Seite nicht gefunden | MovieMatch',
    beschreibung: 'Diese Seite gibt es nicht (mehr).',
    indexierbar: false,
    bodyHtml: '<h1>Seite nicht gefunden</h1><p>Vielleicht wurde der Titel/die Seite entfernt.</p>',
  });
}

export { dokument, kurzfassung };
