// Gemeinsame Helfer fuer Smoke-Tests (tests/smoke) und SEO-Audit
// (scripts/seo-audit.mjs): gedrosselter Abruf, Redirect-Ketten, HTML-Kopf lesen.
// Ohne Abhaengigkeiten; die SEO-Seiten sind serverseitig erzeugt, einfache
// Regex-Auswertung reicht.

export const BASIS = 'https://movietaste.de';
// "bot" im UA -> die Zaehlung der SEO-Aufrufe (routes/seo.js) wertet es als Crawler.
export const USER_AGENT = 'MovieTasteAudit/1.0 (+https://movietaste.de; bot, Selbsttest)';

const schlafen = (ms) => new Promise((r) => setTimeout(r, ms));

// Drosselung: mindestens `intervallMs` zwischen zwei Abrufen (Standard 700 ms
// = ~1,4 Req/s; die Seiten-Grenze des Servers liegt bei 120/min je IP).
export function drossel(intervallMs = 700) {
  let naechster = 0;
  return async function warten() {
    const jetzt = Date.now();
    const start = Math.max(jetzt, naechster);
    naechster = start + intervallMs;
    if (start > jetzt) await schlafen(start - jetzt);
  };
}

/** Ruft eine URL ab und folgt Redirects von Hand (zaehlt die Spruenge). */
export async function hole(url, { warten = async () => {}, maxSprunge = 5, text = true } = {}) {
  const kette = [];
  let aktuell = url;
  for (let i = 0; i <= maxSprunge; i += 1) {
    let antwort;
    for (let versuch = 0; versuch < 4; versuch += 1) {
      await warten();
      try {
        antwort = await fetch(aktuell, {
          redirect: 'manual',
          headers: { 'user-agent': USER_AGENT, 'accept-language': 'de' },
          signal: AbortSignal.timeout(30000),
        });
      } catch (e) {
        antwort = null;
        if (versuch === 3) return { url, endUrl: aktuell, status: 0, fehler: String(e.message || e), kette, body: '', headers: new Headers() };
        await schlafen(2000 * (versuch + 1));
        continue;
      }
      if (antwort.status === 429 || antwort.status === 503) {
        // Rate-Limit des Servers respektieren, nicht dagegen anrennen.
        await antwort.arrayBuffer().catch(() => {});
        await schlafen(5000 * (versuch + 1));
        continue;
      }
      break;
    }
    if (!antwort) break;
    const ort = antwort.headers.get('location');
    if (antwort.status >= 300 && antwort.status < 400 && ort) {
      await antwort.arrayBuffer().catch(() => {});
      kette.push({ von: aktuell, status: antwort.status });
      aktuell = new URL(ort, aktuell).href;
      continue;
    }
    let body;
    try { body = text ? await antwort.text() : (await antwort.arrayBuffer(), ''); }
    catch (e) { return { url, endUrl: aktuell, status: 0, fehler: String(e.message || e), kette, body: '', headers: antwort.headers }; }
    return { url, endUrl: aktuell, status: antwort.status, kette, body, headers: antwort.headers };
  }
  return { url, endUrl: aktuell, status: 0, fehler: 'zu viele Weiterleitungen', kette, body: '', headers: new Headers() };
}

function entities(s) {
  return String(s)
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function metaInhalt(html, attr, name) {
  for (const m of html.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
    const a = m[1];
    const n = new RegExp(`${attr}\\s*=\\s*"${name}"`, 'i').test(a);
    if (!n) continue;
    const c = /content\s*=\s*"([^"]*)"/i.exec(a);
    return c ? entities(c[1]) : '';
  }
  return null;
}

/** Liest Kopf- und Strukturdaten einer SEO-Seite. */
export function parseSeite(html, basisUrl = BASIS) {
  const kopf = /<head[\s\S]*?<\/head>/i.exec(html)?.[0] || html;
  const titel = /<title>([\s\S]*?)<\/title>/i.exec(kopf);
  const canonical = /<link\s+rel="canonical"\s+href="([^"]*)"/i.exec(kopf);
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => entities(m[1].replace(/<[^>]+>/g, '').trim()));
  const jsonLdRoh = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const body = /<body[\s\S]*<\/body>/i.exec(html)?.[0] || html;
  const links = new Set();
  for (const m of body.matchAll(/<a\s+[^>]*?href="([^"]*)"/gi)) {
    const href = entities(m[1]);
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    try {
      const u = new URL(href, basisUrl);
      u.hash = '';
      links.add(u.href);
    } catch { /* kaputtes href ignorieren */ }
  }
  return {
    title: titel ? entities(titel[1].trim()) : null,
    description: metaInhalt(kopf, 'name', 'description'),
    robots: metaInhalt(kopf, 'name', 'robots'),
    canonical: canonical ? entities(canonical[1]) : null,
    h1,
    jsonLdRoh,
    links: [...links],
  };
}

export const istIndexierbar = (robots) => !robots || !/noindex/i.test(robots);

/** Gesamte URL-Liste einer Sitemap-Datei. */
export function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => entities(m[1].trim()));
}
