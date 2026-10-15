// Konsistenzpruefung gegen die Live-Seite (nur HTTP GET): Sitemap-URLs und hreflang.
// Aufruf: node backend/scripts/seo-konsistenz-live.mjs [Basis] [Stichprobe je Datei]
const BASIS = (process.argv[2] || 'https://movietaste.de').replace(/\/$/, '');
const N = Number(process.argv[3] || 8);
const fehler = [];
const zaehlung = {};
const meldung = (m) => { fehler.push(m); console.log('FEHLER', m); };

let nr = 0;
async function holen(url) {
  const t0 = Date.now();
  const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'seo-konsistenz-live' } });
  const html = await r.text();
  return { status: r.status, html, ms: Date.now() - t0, location: r.headers.get('location') };
}
const robots = (h) => (h.match(/<meta name="robots" content="([^"]*)">/) || [])[1];
const canonical = (h) => (h.match(/<link rel="canonical" href="([^"]*)">/) || [])[1];
const locs = (xml) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const stichprobe = (liste, n) => {
  if (liste.length <= n) return liste;
  const schritt = liste.length / n;
  return Array.from({ length: n }, (_, i) => liste[Math.floor(i * schritt)]);
};

const index = await holen(`${BASIS}/sitemap-index.xml`);
if (index.status !== 200) { console.log('Sitemap-Index nicht erreichbar', index.status); process.exit(1); }
const dateien = locs(index.html);
console.log(`${dateien.length} Sitemap-Dateien`);

let langsam = 0;
for (const datei of dateien) {
  const m = /sitemap-([a-z]{2}-[a-z]{2})-([a-z_]+?)(?:-\d+)?\.xml$/.exec(datei);
  const schluessel = m ? `${m[1]}:${m[2]}` : datei;
  const s = await holen(datei.replace('https://movietaste.de', BASIS));
  if (s.status !== 200) { meldung(`${datei}: ${s.status}`); continue; }
  const urls = locs(s.html);
  zaehlung[schluessel] = (zaehlung[schluessel] || 0) + urls.length;
  const hreflangPruefen = m && m[2] === 'hub';
  for (const loc of stichprobe(urls, N)) {
    const pfad = loc.replace('https://movietaste.de', '');
    const r = await holen(BASIS + pfad);
    if (r.ms > 3000) langsam++;
    if (r.status !== 200) { meldung(`${loc}: ${r.status}`); continue; }
    if (robots(r.html) !== 'index,follow') meldung(`${loc}: robots ${robots(r.html)}`);
    if (canonical(r.html) !== loc) meldung(`${loc}: canonical ${canonical(r.html)}`);
    if (hreflangPruefen) await hreflangPruefung(pfad, r.html);
  }
}

async function hreflangPruefung(pfad, html) {
  const ziele = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((x) => ({ code: x[1], href: x[2] }));
  const echte = ziele.filter((z) => z.code !== 'x-default');
  const xd = ziele.find((z) => z.code === 'x-default');
  if (echte.length < 2 && xd) meldung(`${pfad}: x-default ohne Cluster`);
  for (const z of echte) {
    const p = z.href.replace('https://movietaste.de', '');
    const r = await holen(BASIS + p);
    if (r.status !== 200) meldung(`${pfad} -> ${z.href}: ${r.status}`);
    else if (robots(r.html) !== 'index,follow') meldung(`${pfad} -> ${z.href}: noindex`);
    else if (!r.html.includes(`href="https://movietaste.de${pfad}"`)) meldung(`${z.href}: kein Rueck-Link auf ${pfad}`);
  }
}

// Stichproben aus dem Plan
async function erwarte(pfad, pruefung, text) {
  const r = await holen(BASIS + pfad);
  if (!pruefung(r)) meldung(`Stichprobe ${pfad}: ${text} (Status ${r.status}${r.location ? ' -> ' + r.location : ''})`);
  else console.log('ok  ', pfad, '-', text);
}
await erwarte('/international', (r) => r.status === 200 && robots(r.html) === 'index,follow' && (r.html.match(/hreflang="(?!x-default)/g) || []).length === 13 && r.html.includes('hreflang="x-default" href="https://movietaste.de/international"'), '13 hreflang + x-default auf sich');
await erwarte('/', (r) => r.status === 200 && robots(r.html) === 'noindex,follow', 'App-Start noindex');
await erwarte('/de-de/', (r) => r.html.includes('hreflang="x-default" href="https://movietaste.de/international"'), 'Start-x-default = /international');
await erwarte('/de-de/streaming', (r) => r.status === 200 && !r.html.includes('hreflang="x-default"') && r.html.includes('hreflang="de-DE"'), 'Streaming ohne Cluster, kein x-default');
await erwarte('/en-gb/streaming', (r) => r.status === 200 && !r.html.includes('hreflang="x-default"'), 'Streaming en-gb ohne x-default');
await erwarte('/de-at/kino', (r) => r.status === 200 && !r.html.includes('hreflang="x-default"'), 'de-at Kino ohne x-default (falls indexierbar, sonst noindex)');
await erwarte('/de-at/kino/berlin', (r) => r.status === 404, 'Kinoort nur DE: 404');
await erwarte('/en-gb/cinema/neustarts', (r) => r.status === 301 && /new-releases/.test(r.location || ''), '301 auf new-releases');
await erwarte('/robots.txt', (r) => r.html.includes('Allow: /international$') && r.html.includes('/sprachhinweis.js'), 'robots erlaubt /international und Skript');
await erwarte('/sprachhinweis.js', (r) => r.status === 200 && r.html.includes('mt.sprachhinweis'), 'Skript ausgeliefert');

console.log('\nURLs je Locale:Bereich');
for (const [k, v] of Object.entries(zaehlung).sort()) console.log(' ', k, v);
console.log(`\nLangsame Antworten (>3 s): ${langsam}`);
console.log(fehler.length ? `\n${fehler.length} FEHLER` : '\nAlles konsistent.');
process.exit(fehler.length ? 1 : 0);
