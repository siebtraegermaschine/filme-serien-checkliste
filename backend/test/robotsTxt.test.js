// Sichert robots.txt gegen genau den Fehler ab, der die Indexierung praktisch
// lahmgelegt hat (Christian, 18.09.2026, ueber die Google Search Console
// gefunden): Die Sitemap-Dateien standen in keiner Allow-Regel und fielen
// damit unter das allgemeine "Disallow: /" ganz unten -- Google hat sich
// geweigert, die Sitemap ueberhaupt zu lesen ("Durch robots.txt-Datei
// blockiert"), musste also alle ~20.000 Seiten einzeln ueber Links finden.
//
// Der Test bildet die Google-Regel "laengste passende Regel gewinnt, bei
// Gleichstand Allow" nur so weit nach, wie es fuer robots.txt hier noetig ist
// (Praefix-Match, "*" als Platzhalter, "$" als Ende-Anker) -- kein
// vollstaendiger Parser, aber genug, um genau diese Regression zu fangen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROBOTS_PFAD = path.join(import.meta.dirname, '..', '..', 'robots.txt');
const ROBOTS_TEXT = fs.readFileSync(ROBOTS_PFAD, 'utf8');

function regeln(text) {
  const z = [];
  for (const zeile of text.split('\n')) {
    const m = /^(Allow|Disallow):\s*(\S+)/.exec(zeile.trim());
    if (m) z.push({ typ: m[1], muster: m[2] });
  }
  return z;
}

function musterZuRegex(muster) {
  let endanker = false;
  let m = muster;
  if (m.endsWith('$')) { endanker = true; m = m.slice(0, -1); }
  const quelle = m.split('*').map((teil) => teil.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + quelle + (endanker ? '$' : ''));
}

// Laenge des Musters ohne "*"/"$" -- so bewertet auch Google die Spezifitaet.
const spezifitaet = (muster) => muster.replace(/[*$]/g, '').length;

export function robotsErlaubt(text, pfad) {
  let beste = null;
  for (const regel of regeln(text)) {
    if (!musterZuRegex(regel.muster).test(pfad)) continue;
    const s = spezifitaet(regel.muster);
    if (!beste || s > beste.s || (s === beste.s && regel.typ === 'Allow')) {
      beste = { s, typ: regel.typ };
    }
  }
  return !beste || beste.typ === 'Allow';
}

test('Sitemap-Dateien sind trotz "Disallow: /" erlaubt', () => {
  for (const pfad of [
    '/sitemap-index.xml',
    '/sitemap-de-de-titel.xml',
    '/sitemap-de-de-genre.xml',
    '/sitemap-de-de-anbieter.xml',
    '/sitemap-de-de-hub.xml',
    '/sitemap-de-de-person.xml',
    '/sitemap-de-de-bestenliste.xml',
    '/sitemap-de-de-kino_stadt.xml',
  ]) {
    assert.ok(robotsErlaubt(ROBOTS_TEXT, pfad), `${pfad} sollte erlaubt sein`);
  }
});

test('SEO-Seiten und Startseite bleiben erlaubt', () => {
  for (const pfad of ['/', '/de-de/film/x-1', '/de-de/serie/x-1', '/og-image.png', '/manifest.json',
    '/impressum.html', '/datenschutz.html', '/nutzungsbedingungen.html', '/seo.css', '/consent.js']) {
    assert.ok(robotsErlaubt(ROBOTS_TEXT, pfad), `${pfad} sollte erlaubt sein`);
  }
});

test('App-Pfade und Momentaufnahmen bleiben gesperrt (Absicht)', () => {
  assert.ok(!robotsErlaubt(ROBOTS_TEXT, '/index.html'));
  assert.ok(!robotsErlaubt(ROBOTS_TEXT, '/t/movie/157336'));
  assert.ok(!robotsErlaubt(ROBOTS_TEXT, '/?titel=abc123'));
});
