/* Tests fuer lib/herkunft.js: Aus dem Referer-Header wird nur eine grobe
   Kategorie -- und die muss fuer die ueblichen Faelle stimmen, sonst zeigt
   der Analytics-Tab "Herkunft" Unsinn. Dazu die User-Agent-Merkmale
   (Geraetetyp, Crawler) und die cookielose Tageskennung. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { herkunftKategorie, HERKUNFT_ARTEN, geraetTyp, istBot, GERAET_ARTEN } from '../lib/herkunft.js';
import { kennungBilden, heuteBerlin } from '../lib/tageskennung.js';

const EIGENE = ['movietaste.de'];

test('ohne Referer: direkt', () => {
  assert.equal(herkunftKategorie('', EIGENE), 'direkt');
  assert.equal(herkunftKategorie(undefined, EIGENE), 'direkt');
});

test('eigene Domain samt Subdomains: intern', () => {
  assert.equal(herkunftKategorie('https://movietaste.de/de-de/filme', EIGENE), 'intern');
  assert.equal(herkunftKategorie('https://www.movietaste.de/', EIGENE), 'intern');
  assert.equal(herkunftKategorie('https://movietaste.de.example.org/', EIGENE), 'sonstige');
});

test('Suchmaschinen', () => {
  assert.equal(herkunftKategorie('https://www.google.de/', EIGENE), 'suche');
  assert.equal(herkunftKategorie('https://www.google.com/search?q=x', EIGENE), 'suche');
  assert.equal(herkunftKategorie('https://www.bing.com/', EIGENE), 'suche');
  assert.equal(herkunftKategorie('https://duckduckgo.com/', EIGENE), 'suche');
});

test('Social Media und Messenger', () => {
  assert.equal(herkunftKategorie('https://l.facebook.com/', EIGENE), 'social');
  assert.equal(herkunftKategorie('https://t.co/abc', EIGENE), 'social');
  assert.equal(herkunftKategorie('https://www.reddit.com/r/movies', EIGENE), 'social');
  assert.equal(herkunftKategorie('https://www.instagram.com/', EIGENE), 'social');
});

test('KI-Assistenten, auch die von Google, vor der Suche', () => {
  assert.equal(herkunftKategorie('https://chatgpt.com/', EIGENE), 'ki');
  assert.equal(herkunftKategorie('https://gemini.google.com/', EIGENE), 'ki');
  assert.equal(herkunftKategorie('https://www.perplexity.ai/', EIGENE), 'ki');
});

test('alles andere: sonstige, auch kaputte Adressen', () => {
  assert.equal(herkunftKategorie('https://www.filmstarts.de/', EIGENE), 'sonstige');
  assert.equal(herkunftKategorie('kein-url', EIGENE), 'sonstige');
});

test('jede Rueckgabe ist eine bekannte Art', () => {
  for (const r of ['', 'https://movietaste.de/', 'https://google.de/', 'https://x.com/', 'https://claude.ai/', 'https://foo.bar/']) {
    assert.ok(HERKUNFT_ARTEN.includes(herkunftKategorie(r, EIGENE)));
  }
});

test('geraetTyp: iOS, Android, sonst Desktop', () => {
  assert.equal(geraetTyp('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'ios');
  assert.equal(geraetTyp('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'android');
  assert.equal(geraetTyp('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'desktop');
  assert.equal(geraetTyp(''), 'desktop');
  for (const ua of ['iPad', 'Android', 'X11', undefined]) assert.ok(GERAET_ARTEN.includes(geraetTyp(ua)));
});

test('istBot: Crawler und Vorschau-Dienste', () => {
  assert.equal(istBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
  assert.equal(istBot('WhatsApp/2.23.20.0'), true);
  assert.equal(istBot('Mozilla/5.0 (iPhone) Safari/605.1'), false);
  assert.equal(istBot(undefined), false);
});

test('kennungBilden: 24 Hex-Zeichen, deterministisch, ohne die Eingaben zu verraten', () => {
  const a = kennungBilden('geheim', '203.0.113.5', 'Mozilla/5.0 (iPhone)');
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.equal(a, kennungBilden('geheim', '203.0.113.5', 'Mozilla/5.0 (iPhone)'));
  const basis = kennungBilden('geheim', '203.0.113.5', 'UA');
  assert.notEqual(basis, kennungBilden('anders', '203.0.113.5', 'UA'));
  assert.notEqual(basis, kennungBilden('geheim', '203.0.113.6', 'UA'));
  assert.notEqual(basis, kennungBilden('geheim', '203.0.113.5', 'UB'));
  assert.ok(!basis.includes('203'));
});

test('heuteBerlin: Kalendertag in Berliner Zeit als YYYY-MM-DD', () => {
  assert.equal(heuteBerlin(new Date('2026-09-06T22:30:00Z')), '2026-09-07');
  assert.equal(heuteBerlin(new Date('2026-09-06T21:30:00Z')), '2026-09-06');
});
