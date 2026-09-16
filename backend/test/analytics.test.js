// Absicherung der Analytics-Ansicht (routes/analytics.js) und des
// SEO-Aufrufzaehlers (routes/seo.js) -- bewusst ohne Datenbank.
//
// 1. Nur das Betreiber-Konto darf die Kennzahlen sehen. Die Regel steckt in
//    istBetreiber(); der Menuepunkt im Frontend ist reiner Komfort.
// 2. Ohne Sitzung antwortet die Route mit 401, bevor sie die Datenbank
//    anfasst -- so laesst sich das Verhalten hier pruefen.
// 3. seoAufrufTyp() entscheidet, was als SEO-Aufruf zaehlt: nur Pfade unter
//    einem gueltigen Locale. index.html, robots.txt und die App-Pfade
//    duerfen nie in der Zaehlung landen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import analyticsRouter, { istBetreiber } from '../routes/analytics.js';
import { seoAufrufTyp } from '../routes/seo.js';

test('istBetreiber erkennt nur die Betreiber-Adresse, unabhaengig von Schreibweise', () => {
  assert.equal(istBetreiber('c.neubauer@digital-wings.com'), true);
  assert.equal(istBetreiber('  C.Neubauer@Digital-Wings.com '), true);
  assert.equal(istBetreiber('jemand@example.com'), false);
  assert.equal(istBetreiber(''), false);
  assert.equal(istBetreiber(null), false);
  assert.equal(istBetreiber(undefined), false);
});

test('GET /api/analytics ohne Sitzung: 401, ohne Datenbankzugriff', async () => {
  const app = express();
  app.use('/api/analytics', analyticsRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port } = server.address();
    const antwort = await fetch(`http://127.0.0.1:${port}/api/analytics`);
    assert.equal(antwort.status, 401);
    assert.deepEqual(await antwort.json(), { error: 'not_authenticated' });
  } finally {
    server.close();
  }
});

test('seoAufrufTyp zaehlt nur Pfade unter einem gueltigen Locale', () => {
  assert.equal(seoAufrufTyp('/de-de'), 'start');
  assert.equal(seoAufrufTyp('/de-de/'), 'start');
  assert.equal(seoAufrufTyp('/de-de/film/interstellar-157336'), 'film');
  assert.equal(seoAufrufTyp('/de-de/serie/dark-70523'), 'serie');
  assert.equal(seoAufrufTyp('/de-de/beste-filme/jahr/2024'), 'beste-filme');
  assert.equal(seoAufrufTyp('/de-de/schauspieler/tom-hanks-31'), 'schauspieler');
  // Alles, was nicht mit einem Locale beginnt, ist keine SEO-Seite.
  for (const pfad of ['/', '/index.html', '/robots.txt', '/kpi.html', '/api/titles', '/t/movie/157336', '/xx-yy/film/a-1', '']) {
    assert.equal(seoAufrufTyp(pfad), null, `${pfad} darf nicht gezaehlt werden`);
  }
});
