#!/usr/bin/env node
// SEO-Audit gegen die Live-Seite: liest die Sitemaps und prueft je URL Status,
// Weiterleitungen, Canonical, robots-Meta, Duplikate (title/description), H1,
// JSON-LD und interne Links. Nur GET, gedrosselt, keine Anmeldung.
//
//   node scripts/seo-audit.mjs                  Stichprobe (300 URLs)
//   node scripts/seo-audit.mjs --stichprobe=3000 --rate-ms=1000
//   node scripts/seo-audit.mjs --alle           alle Sitemap-URLs
// Optionen: --base=URL  --links=N (Obergrenze interne Link-Pruefung)  --out=Datei
// Exit 1 nur bei harten Fehlern; Bericht (Markdown) auf stdout und in
// $GITHUB_STEP_SUMMARY.
import { appendFileSync, writeFileSync } from 'node:fs';
import { BASIS, hole, parseSeite, drossel, locs, istIndexierbar } from './lib/seo-crawl.mjs';
import { seitenart, pruefeJsonLd } from './jsonld-check.mjs';

const arg = (name, std) => {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return std;
  return a.includes('=') ? a.split('=').slice(1).join('=') : true;
};
const ALLE = arg('alle', false) === true;
const STICHPROBE = Number(arg('stichprobe', 300));
const RATE_MS = Number(arg('rate-ms', 1000));
const LINK_MAX = ALLE ? Infinity : Number(arg('links', 400));
const BASE = String(arg('base', BASIS)).replace(/\/$/, '');
const OUT = arg('out', null);
const warten = drossel(RATE_MS);
const lokal = (u) => u.replace(BASIS, BASE);

/** Gleichmaessig je Sitemap; der Offset nach ISO-Woche wechselt die Abdeckung. */
function stichprobe(proSitemap, gesamtZiel) {
  const summe = proSitemap.reduce((s, x) => s + x.urls.length, 0);
  const woche = Math.floor(Date.now() / (7 * 86400000));
  const aus = [];
  for (const { name, urls } of proSitemap) {
    if (!urls.length) continue;
    const n = ALLE ? urls.length : Math.max(3, Math.min(urls.length, Math.round((gesamtZiel * urls.length) / summe)));
    const schritt = urls.length / n;
    const offset = ALLE ? 0 : (woche * 7) % Math.max(1, Math.floor(schritt));
    for (let i = 0; i < n; i += 1) {
      const u = urls[Math.min(urls.length - 1, Math.floor(i * schritt) + offset)];
      aus.push({ url: u, sitemap: name });
    }
  }
  return [...new Map(aus.map((x) => [x.url, x])).values()];
}

const hart = [];   // { art, url, text }
const weich = [];
const fehler = (liste, art, url, text) => liste.push({ art, url, text });

async function main() {
  const t0 = Date.now();
  const idx = await hole(`${BASE}/sitemap-index.xml`, { warten });
  if (idx.status !== 200) throw new Error(`Sitemap-Index: HTTP ${idx.status}`);
  const sitemaps = locs(idx.body);
  const proSitemap = [];
  for (const sm of sitemaps) {
    const r = await hole(lokal(sm), { warten });
    const name = sm.replace(/^.*\//, '').replace(/\.xml$/, '');
    if (r.status !== 200) { fehler(hart, 'sitemap', sm, `Unter-Sitemap HTTP ${r.status}`); continue; }
    const urls = locs(r.body);
    if (!urls.length) fehler(hart, 'sitemap', sm, 'Unter-Sitemap ist leer');
    proSitemap.push({ name, urls });
  }
  const gesamt = proSitemap.reduce((s, x) => s + x.urls.length, 0);
  const ziele = stichprobe(proSitemap, STICHPROBE);
  console.error(`Sitemaps: ${sitemaps.length}, URLs gesamt: ${gesamt}, Pruefung: ${ziele.length}, ${(1000 / RATE_MS).toFixed(1)} Req/s`);

  const titel = new Map();
  const beschr = new Map();
  const seiteVonUrl = new Map(); // fuer Link-Pruefung: bereits geholte Status
  const linkQuellen = new Map(); // Ziel -> erste Quelle
  const zaehl = { status: {}, art: {} };
  let ok = 0;

  for (const [i, { url, sitemap }] of ziele.entries()) {
    if (i && i % 100 === 0) console.error(`  ${i}/${ziele.length}`);
    const pfad = new URL(url).pathname + new URL(url).search;
    const art = seitenart(new URL(url).pathname);
    zaehl.art[art] = (zaehl.art[art] || 0) + 1;
    const r = await hole(lokal(url), { warten });
    zaehl.status[r.status] = (zaehl.status[r.status] || 0) + 1;
    seiteVonUrl.set(url, r.status);
    if (r.status !== 200) { fehler(hart, 'status', url, `HTTP ${r.status}${r.fehler ? ` (${r.fehler})` : ''}`); continue; }
    if (r.kette.length > 1) fehler(hart, 'redirect-kette', url, `${r.kette.length} Spruenge: ${r.kette.map((k) => k.status).join('>')} -> ${r.endUrl}`);
    else if (r.kette.length === 1) fehler(weich, 'redirect', url, `Sitemap-URL leitet weiter nach ${r.endUrl}`);

    const p = parseSeite(r.body);
    const eigene = BASIS + new URL(url).pathname + new URL(url).search;
    if (!p.canonical) fehler(hart, 'canonical', url, 'canonical fehlt');
    else if (p.canonical !== eigene) fehler(hart, 'canonical', url, `canonical ${p.canonical} != ${eigene}`);
    if (!istIndexierbar(p.robots)) fehler(hart, 'noindex-in-sitemap', url, `robots="${p.robots}"`);
    if (!p.h1.length) fehler(hart, 'h1', url, 'H1 fehlt');
    else if (p.h1.length > 1) fehler(weich, 'h1', url, `${p.h1.length} H1`);
    if (!p.title) fehler(hart, 'title', url, '<title> fehlt');
    else {
      if (/&(amp|lt|gt|quot|#39);/.test(p.title)) fehler(hart, 'escape', url, `doppelt escaped im Titel: ${p.title}`);
      (titel.get(p.title) || titel.set(p.title, []).get(p.title)).push(url);
    }
    if (!p.description) fehler(weich, 'description', url, 'meta description fehlt');
    else (beschr.get(p.description) || beschr.set(p.description, []).get(p.description)).push(url);

    const jl = pruefeJsonLd(art, p.jsonLdRoh, { indexierbar: true });
    for (const f of jl.fehler) fehler(hart, 'jsonld', url, f);
    for (const w of jl.warnungen) fehler(weich, 'jsonld', url, w);
    for (const u of jl.urls) if (u.startsWith(BASIS) && !linkQuellen.has(u)) linkQuellen.set(u, `${url} (JSON-LD)`);
    for (const l of p.links) {
      if (!l.startsWith(BASIS) && !l.startsWith(BASE)) continue;
      const u = l.replace(BASE, BASIS);
      const pf = new URL(u);
      if (pf.pathname === '/' || pf.searchParams.has('von') || pf.searchParams.has('titel') || /\.(png|jpg|svg|css|js)$/.test(pf.pathname)) continue;
      pf.search = pf.searchParams.has('seite') ? pf.search : '';
      if (!linkQuellen.has(pf.href)) linkQuellen.set(pf.href, url);
    }
    ok += 1;
  }

  for (const [t, urls] of titel) if (urls.length > 1) fehler(weich, 'doppelter-titel', urls[0], `${urls.length}x "${t.slice(0, 80)}" (z. B. ${urls.slice(1, 3).join(', ')})`);
  for (const [t, urls] of beschr) if (urls.length > 1) fehler(weich, 'doppelte-description', urls[0], `${urls.length}x "${t.slice(0, 60)}" (z. B. ${urls.slice(1, 3).join(', ')})`);

  // Interne Links: bereits geholte Seiten nicht doppelt abrufen.
  const linkZiele = [...linkQuellen.entries()].filter(([u]) => !seiteVonUrl.has(u));
  const gepruefteLinks = linkZiele.slice(0, LINK_MAX);
  console.error(`Interne Links: ${linkQuellen.size} eindeutig, ${gepruefteLinks.length} noch zu pruefen`);
  for (const [u, quelle] of gepruefteLinks) {
    const r = await hole(lokal(u), { warten, text: false });
    if (r.status === 0 || r.status >= 400) fehler(hart, 'kaputter-link', u, `HTTP ${r.status} (verlinkt von ${quelle})`);
    else if (r.kette.length > 1) fehler(weich, 'link-redirect-kette', u, `${r.kette.length} Spruenge (von ${quelle})`);
  }
  for (const [u, s] of seiteVonUrl) if (s !== 200 && linkQuellen.has(u) && linkQuellen.get(u) !== u) { /* schon als Status-Fehler erfasst */ }

  const bericht = baueBericht({ sitemaps: sitemaps.length, gesamt, ziele: ziele.length, ok, links: gepruefteLinks.length, linkGesamt: linkQuellen.size, zaehl, dauer: Math.round((Date.now() - t0) / 1000) });
  console.log(bericht);
  if (OUT) writeFileSync(OUT, bericht);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, bericht + '\n');
  process.exit(hart.length ? 1 : 0);
}

function gruppiere(liste) {
  const g = new Map();
  for (const f of liste) (g.get(f.art) || g.set(f.art, []).get(f.art)).push(f);
  return g;
}

function baueBericht(k) {
  const z = [];
  z.push(`# SEO-Audit ${new Date().toISOString().slice(0, 10)}`, '');
  z.push(`- Basis: ${BASE}, Modus: ${ALLE ? 'alle URLs' : `Stichprobe ${STICHPROBE}`}, ${(1000 / RATE_MS).toFixed(1)} Req/s, Dauer ${k.dauer} s`);
  z.push(`- Sitemaps: ${k.sitemaps}, URLs in den Sitemaps: ${k.gesamt}, geprueft: ${k.ziele} (fehlerfrei geladen: ${k.ok})`);
  z.push(`- Interne Links: ${k.linkGesamt} eindeutig, davon ${k.links} zusaetzlich abgerufen`);
  z.push(`- Status: ${Object.entries(k.zaehl.status).map(([s, n]) => `${s}=${n}`).join(', ')}`);
  z.push(`- Seitenarten: ${Object.entries(k.zaehl.art).map(([s, n]) => `${s}=${n}`).join(', ')}`);
  z.push(`- **Harte Fehler: ${hart.length}**, Warnungen: ${weich.length}`, '');
  for (const [titel, liste] of [['Harte Fehler', hart], ['Warnungen', weich]]) {
    z.push(`## ${titel}`, '');
    if (!liste.length) { z.push('keine', ''); continue; }
    for (const [art, eintraege] of gruppiere(liste)) {
      z.push(`### ${art} (${eintraege.length})`);
      for (const e of eintraege.slice(0, 15)) z.push(`- ${e.url} - ${e.text}`);
      if (eintraege.length > 15) z.push(`- ... und ${eintraege.length - 15} weitere`);
      z.push('');
    }
  }
  return z.join('\n');
}

main().catch((e) => { console.error(e); process.exit(2); });
