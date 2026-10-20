#!/usr/bin/env node
// JSON-LD-Pruefung der SEO-Seiten (Regeln nach den Google-Richtlinien fuer
// Breadcrumb, ItemList, Movie/TVSeries, Person). Zwei Nutzungen:
//  - als Modul: pruefeJsonLd() / seitenart() -- vom Audit und vom Render-Test
//  - als CLI:   node scripts/jsonld-check.mjs [--basis URL] [--url URL ...]
//    ruft je Seitenart eine Probe-Seite aus den Sitemaps ab (1 Req/s).
import { fileURLToPath } from 'node:url';
import { BASIS, hole, parseSeite, drossel, locs, istIndexierbar } from './lib/seo-crawl.mjs';
import { deutschWort } from '../lib/seoPfade.js';

/** Seitenart aus dem Pfad, z. B. '/de-de/film/x-1' -> 'titel'. */
export function seitenart(pfad) {
  const p = pfad.split('?')[0].replace(/\/+$/, '');
  const t = p.split('/').filter(Boolean);
  if (t.length === 0) return 'app';
  if (/\.(html|xml|txt|css|png)$/.test(p)) return 'statisch';
  if (t.length === 1) return 'start';
  const [loc, a0, b, c] = t;
  const a = deutschWort(loc, a0) || a0; // lokales Pfadwort (pt-pt /filme/ = Titel) zurueck ins Deutsche
  if (a === 'film' || a === 'serie') return 'titel';
  if (a === 'filme' || a === 'serien') return b ? 'genre' : 'hub';
  if (a === 'streaming') return b ? 'anbieter' : 'hub';
  if (a === 'beste-filme' || a === 'beste-serien') return b ? 'bestenliste' : 'hub';
  if (a === 'bestenlisten') return 'hub';
  if (a === 'reihen') return b ? 'reihe' : 'hub';
  if (a === 'neu-auf') return b ? 'neu-auf-anbieter' : 'neu-auf';
  if (a === 'kino') return b === 'neustarts' ? 'kino-neustarts' : (b ? 'kino-stadt' : 'hub');
  if (a === 'schauspieler' || a === 'regisseur') return (b || c) ? 'person' : 'hub';
  return 'sonstige';
}

// Erwartete Haupt-Typen je Seitenart (Breadcrumb zusaetzlich, ausser 'start').
const ERWARTET = {
  titel: ['Movie', 'TVSeries'],
  person: ['Person'],
  genre: ['ItemList'], anbieter: ['ItemList'], bestenliste: ['ItemList'],
  'neu-auf-anbieter': ['ItemList'], 'kino-stadt': ['ItemList'], 'kino-neustarts': ['ItemList'],
  'neu-auf': ['ItemList'], reihe: ['CollectionPage'],
  hub: ['ItemList', 'CollectionPage'], start: ['CollectionPage'],
};

const ENTITY = /&(?:amp|lt|gt|quot|#39|#x27);/;

function leereFelder(wert, pfad, fehler) {
  if (wert === null || wert === undefined) { fehler.push(`leeres Feld ${pfad}`); return; }
  if (typeof wert === 'string') {
    if (!wert.trim()) fehler.push(`leeres Feld ${pfad}`);
    else if (ENTITY.test(wert)) fehler.push(`doppelt escaped (HTML-Entity im Text) ${pfad}: "${wert.slice(0, 60)}"`);
  } else if (Array.isArray(wert)) {
    if (!wert.length) fehler.push(`leeres Array ${pfad}`);
    wert.forEach((w, i) => leereFelder(w, `${pfad}[${i}]`, fehler));
  } else if (typeof wert === 'object') {
    if (!Object.keys(wert).length) fehler.push(`leeres Objekt ${pfad}`);
    for (const [k, v] of Object.entries(wert)) leereFelder(v, `${pfad}.${k}`, fehler);
  }
}

const typen = (knoten) => [].concat(knoten['@type'] || []);
const hatTyp = (knoten, t) => typen(knoten).includes(t);

function urlOk(u) {
  try { return new URL(u).protocol === 'https:'; } catch { return false; }
}

function pruefeListe(liste, pfad, f, urls, { leerErlaubt }) {
  const el = liste.itemListElement;
  if (!Array.isArray(el) || !el.length) {
    if (!leerErlaubt) f.push(`${pfad}: itemListElement fehlt oder ist leer`);
    return;
  }
  const gesehen = new Set();
  el.forEach((it, i) => {
    const p = `${pfad}.itemListElement[${i}]`;
    if (it.position !== i + 1) f.push(`${p}: position ${it.position} statt ${i + 1}`);
    const url = it.url || (it.item && (typeof it.item === 'string' ? it.item : it.item.url || it.item['@id']));
    if (!url) f.push(`${p}: weder url noch item (Google verlangt eine Adresse je Listeneintrag)`);
    else if (!urlOk(url)) f.push(`${p}: ungueltige url "${url}"`);
    else {
      urls.add(url);
      if (gesehen.has(url)) f.push(`${p}: doppelte url ${url}`);
      gesehen.add(url);
    }
    if (!it.name && !it.item?.name) f.push(`${p}: name fehlt`);
  });
}

function pruefeKnoten(k, pfad, f, urls, ctx) {
  if (typeof k !== 'object' || !k) { f.push(`${pfad}: kein Objekt`); return; }
  if (!k['@type']) { f.push(`${pfad}: @type fehlt`); return; }
  for (const t of typen(k)) {
    if (t === 'Movie' || t === 'TVSeries') {
      if (!k.name) f.push(`${pfad}: ${t} ohne name`);
      const r = k.aggregateRating;
      if (r) {
        if (r.ratingValue === undefined) f.push(`${pfad}.aggregateRating: ratingValue fehlt`);
        if (r.ratingCount === undefined && r.reviewCount === undefined) f.push(`${pfad}.aggregateRating: ratingCount/reviewCount fehlt`);
      }
      for (const [feld, v] of [['director', k.director], ['actor', k.actor]]) {
        for (const person of [].concat(v || [])) if (!person.name) f.push(`${pfad}.${feld}: Person ohne name`);
      }
    } else if (t === 'Person') {
      if (!k.name) f.push(`${pfad}: Person ohne name`);
    } else if (t === 'ItemList') {
      pruefeListe(k, pfad, f, urls, { leerErlaubt: !ctx.indexierbar });
    } else if (t === 'BreadcrumbList') {
      const el = k.itemListElement;
      if (!Array.isArray(el) || !el.length) { f.push(`${pfad}: BreadcrumbList ohne Eintraege`); continue; }
      el.forEach((it, i) => {
        if (it.position !== i + 1) f.push(`${pfad}[${i}]: position ${it.position} statt ${i + 1}`);
        if (!it.name) f.push(`${pfad}[${i}]: name fehlt`);
        // Das letzte Glied (aktuelle Seite) darf laut Google ohne item bleiben.
        if (i < el.length - 1 && !it.item) f.push(`${pfad}[${i}]: item (URL) fehlt`);
        if (it.item) { if (!urlOk(it.item)) f.push(`${pfad}[${i}]: ungueltige item-URL`); else urls.add(it.item); }
      });
    } else if (t === 'CollectionPage' || t === 'WebPage') {
      if (!k.name) f.push(`${pfad}: ${t} ohne name`);
      if (k.url) urls.add(k.url);
      if (k.mainEntity) pruefeKnoten(k.mainEntity, `${pfad}.mainEntity`, f, urls, ctx);
      for (const [i, teil] of [].concat(k.hasPart || []).entries()) {
        if (!teil.name || !teil.url) f.push(`${pfad}.hasPart[${i}]: name/url fehlt`);
        else urls.add(teil.url);
      }
    } else {
      f.push(`WARNUNG ${pfad}: unbekannter @type "${t}"`);
    }
  }
}

/**
 * @param {string} art     Ergebnis von seitenart()
 * @param {string[]} roh   Inhalte der application/ld+json-Skripte
 * @param {{indexierbar?: boolean}} ctx
 * @returns {{fehler: string[], warnungen: string[], urls: string[]}}
 */
export function pruefeJsonLd(art, roh, ctx = { indexierbar: true }) {
  const f = [];
  const urls = new Set();
  const knoten = [];
  roh.forEach((text, i) => {
    let json;
    try { json = JSON.parse(text); } catch (e) { f.push(`Block ${i}: kein gueltiges JSON (${e.message})`); return; }
    for (const k of [].concat(json['@graph'] || json)) {
      if ((json['@graph'] ? json : k)['@context'] !== 'https://schema.org') f.push(`Block ${i}: @context ist nicht https://schema.org`);
      leereFelder(k, `Block ${i}`, f);
      pruefeKnoten(k, `Block ${i}(${typen(k).join(',')})`, f, urls, ctx);
      knoten.push(k);
    }
  });
  const erwartet = ERWARTET[art];
  if (erwartet && !knoten.some((k) => erwartet.some((t) => hatTyp(k, t)))) {
    f.push(`erwarteter Typ ${erwartet.join('/')} fehlt (vorhanden: ${knoten.flatMap(typen).join(', ') || 'nichts'})`);
  }
  if (erwartet && art !== 'start' && !knoten.some((k) => hatTyp(k, 'BreadcrumbList'))) f.push('BreadcrumbList fehlt');
  const warnungen = f.filter((x) => x.startsWith('WARNUNG')).map((x) => x.replace('WARNUNG ', ''));
  return { fehler: f.filter((x) => !x.startsWith('WARNUNG')), warnungen, urls: [...urls] };
}

// ---- CLI ------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const basis = (argv.includes('--basis') ? argv[argv.indexOf('--basis') + 1] : BASIS).replace(/\/$/, '');
  const warten = drossel(1000);
  let ziele = argv.flatMap((a, i) => (argv[i - 1] === '--url' ? [a] : []));
  if (!ziele.length) {
    const idx = locs((await hole(`${basis}/sitemap-index.xml`, { warten })).body);
    const proArt = new Map();
    for (const sm of idx) {
      const urls = locs((await hole(sm.replace(BASIS, basis), { warten })).body);
      for (const u of urls) {
        const a = seitenart(new URL(u).pathname);
        if (a === 'statisch' || a === 'app' || a === 'sonstige') continue;
        // Je Art zwei Proben: die erste und eine aus der Mitte der Sitemap.
        const liste = proArt.get(a) || [];
        if (liste.length < 1) liste.push(u);
        proArt.set(a, liste);
      }
      const mitte = urls[Math.floor(urls.length / 2)];
      if (mitte) {
        const a = seitenart(new URL(mitte).pathname);
        const liste = proArt.get(a);
        if (liste && !liste.includes(mitte) && liste.length < 2) liste.push(mitte);
      }
    }
    ziele = [...proArt.values()].flat();
  }
  let fehlerGesamt = 0;
  const linkUrls = new Set();
  console.log('# JSON-LD-Pruefung\n');
  for (const u of ziele) {
    const r = await hole(u.replace(BASIS, basis), { warten });
    const p = parseSeite(r.body);
    const art = seitenart(new URL(u).pathname);
    const erg = pruefeJsonLd(art, p.jsonLdRoh, { indexierbar: istIndexierbar(p.robots) });
    erg.urls.forEach((x) => linkUrls.add(x));
    const kopf = r.status === 200 ? '' : ` (HTTP ${r.status})`;
    console.log(`- ${erg.fehler.length ? 'FEHLER' : 'ok'} \`${art}\` ${u}${kopf}`);
    erg.fehler.forEach((x) => console.log(`    - ${x}`));
    erg.warnungen.forEach((x) => console.log(`    - Warnung: ${x}`));
    fehlerGesamt += erg.fehler.length + (r.status === 200 ? 0 : 1);
  }
  // Adressen aus dem JSON-LD duerfen nicht ins Leere zeigen.
  const interne = [...linkUrls].filter((x) => x.startsWith(BASIS)).slice(0, 150);
  let tot = 0;
  for (const x of interne) {
    const r = await hole(x.replace(BASIS, basis), { warten, text: false });
    if (r.status >= 400 || r.status === 0) { console.log(`- FEHLER JSON-LD-URL ${x} -> HTTP ${r.status}`); tot += 1; }
  }
  console.log(`\n${ziele.length} Seiten, ${interne.length} interne URLs geprueft, ${fehlerGesamt + tot} Fehler.`);
  process.exit(fehlerGesamt + tot ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
