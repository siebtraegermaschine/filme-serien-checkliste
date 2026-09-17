/* Absicherung: JEDE Seite von movietaste.de bindet /consent.js ein -- und
   keine bindet Google Analytics an der Einwilligung vorbei ein.

   Hintergrund (17.09.2026): Google Analytics darf erst nach "Zustimmen" im
   Cookie-Banner laden (Datenschutzerklaerung Abschnitt 4). Banner und
   Google-Tag stecken deshalb gemeinsam in /consent.js. Diese Tests sorgen
   dafuer, dass das auch fuer kuenftige Seiten gilt:
   - jede HTML-Datei im Repo-Wurzelordner (App, Rechtstexte, Hilfsseiten),
   - das Grundgeruest aller SEO-Seiten (seoRender.dokument),
   - das Docker-Image, das consent.js ausdruecklich mitkopieren muss.
   Wer das Google-Snippet direkt in eine Seite kopiert, faellt hier auf. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dokument } from '../lib/seoRender.js';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EINBINDUNG = '<script src="/consent.js" defer></script>';
const OHNE_EINWILLIGUNG = /googletagmanager\.com|gtag\/js|google-analytics\.com/i;

const htmlDateien = fs.readdirSync(WURZEL).filter((f) => f.endsWith('.html'));

test('es gibt HTML-Seiten im Wurzelordner (sonst prueft der naechste Test nichts)', () => {
  assert.ok(htmlDateien.includes('index.html'));
  assert.ok(htmlDateien.length >= 5);
});

test('jede HTML-Seite im Wurzelordner bindet /consent.js im <head> ein', () => {
  for (const f of htmlDateien) {
    const html = fs.readFileSync(path.join(WURZEL, f), 'utf8');
    const kopf = html.slice(0, html.indexOf('</head>'));
    assert.ok(kopf.includes(EINBINDUNG), `${f}: ${EINBINDUNG} fehlt im <head>`);
  }
});

test('keine HTML-Seite laedt Google direkt, an der Einwilligung vorbei', () => {
  for (const f of htmlDateien) {
    const html = fs.readFileSync(path.join(WURZEL, f), 'utf8');
    // Die Datenschutzerklaerungen verlinken Googles Hinweise -- das sind
    // Links, keine Skripte. Geprueft werden nur <script>-Bloecke.
    const skripte = html.match(/<script\b[\s\S]*?<\/script>/gi) || [];
    for (const s of skripte) {
      assert.ok(!OHNE_EINWILLIGUNG.test(s), `${f}: Google-Skript ausserhalb von consent.js`);
    }
  }
});

test('das Grundgeruest der SEO-Seiten bindet /consent.js ein', () => {
  const html = dokument({
    locale: 'de-de', pfad: '/de-de/test', titelZeile: 'Test', beschreibung: 'Test',
    indexierbar: false, jsonLd: [], bodyHtml: '<p>x</p>',
  });
  const kopf = html.slice(0, html.indexOf('</head>'));
  assert.ok(kopf.includes(EINBINDUNG));
  assert.ok(!OHNE_EINWILLIGUNG.test(html));
  assert.ok(html.includes('data-cookie-einstellungen'), 'Widerrufslink in der Fusszeile fehlt');
});

test('consent.js laedt Google erst nach Zustimmung und liegt im Docker-Image', () => {
  const js = fs.readFileSync(path.join(WURZEL, 'consent.js'), 'utf8');
  assert.match(js, /G-478EZLZ8NV/);
  // Die einzige Stelle, die das Google-Skript nachlaedt, ist gaLaden() --
  // und die wird nur bei stand 'ja' bzw. wahl('ja') aufgerufen.
  assert.equal((js.match(/googletagmanager\.com/g) || []).length, 1);
  assert.match(js, /if \(s === 'ja'\) gaLaden\(\);/);
  assert.match(js, /if \(w === 'ja'\) gaLaden\(\);/);
  const docker = fs.readFileSync(path.join(WURZEL, 'backend', 'Dockerfile'), 'utf8');
  assert.match(docker, /^COPY [^\n]*\bconsent\.js\b/m);
});
