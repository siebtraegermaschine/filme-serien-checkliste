// Absicherung der Catch-all-Route '/:locale' in routes/seo.js.
//
// Hintergrund: '/:locale' passt auf JEDEN einsegmentigen Pfad. Eine erste
// Fassung am 16.08.2026 antwortete bei ungueltigem Locale mit 404 statt mit
// next() -- damit haette sie /seo.css, /robots.txt, /impressum.html und die
// Sitemap abgefangen, bevor express.static sie ausliefern kann. Diese Tests
// halten fest, dass alles ausser einem gueltigen Locale durchgereicht wird.
//
// Bewusst ohne Datenbank: Geprueft wird nur das Routing. Der einzige Pfad, der
// die DB braeuchte (/de-de), wird hier nicht angefragt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import seoRouter from '../routes/seo.js';

function starteServer() {
  const app = express();
  app.use(seoRouter);
  // Steht fuer express.static in server.js: Alles, was der SEO-Router
  // durchreicht, muss hier ankommen.
  app.use((req, res) => res.status(200).send('DURCHGEREICHT'));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('einsegmentige Nicht-Locale-Pfade werden an express.static durchgereicht', async () => {
  const server = await starteServer();
  const { port } = server.address();
  try {
    for (const pfad of ['/seo.css', '/robots.txt', '/impressum.html', '/manifest.json', '/og-image.png', '/kpi.html']) {
      const antwort = await fetch(`http://127.0.0.1:${port}${pfad}`);
      assert.equal(antwort.status, 200, `${pfad} muss durchgereicht werden`);
      assert.equal(await antwort.text(), 'DURCHGEREICHT', `${pfad} darf nicht vom SEO-Router beantwortet werden`);
    }
  } finally {
    server.close();
  }
});

test('die Sitemap wird nicht von /:locale geschluckt', async () => {
  const server = await starteServer();
  const { port } = server.address();
  try {
    // Ungueltiger Bereich -> die Sitemap-Route selbst antwortet mit 404.
    // Entscheidend ist, dass NICHT 'DURCHGEREICHT' und nicht die Startseite
    // kommt: beides hiesse, eine andere Route hat den Pfad abgefangen.
    const antwort = await fetch(`http://127.0.0.1:${port}/sitemap-de-de-unbekannt.xml`);
    assert.equal(antwort.status, 404);
    assert.notEqual(await antwort.text(), 'DURCHGEREICHT');
  } finally {
    server.close();
  }
});

test('unbekanntes Locale mit Unterpfad liefert die SEO-404-Seite', async () => {
  const server = await starteServer();
  const { port } = server.address();
  try {
    const antwort = await fetch(`http://127.0.0.1:${port}/xx-yy/filme`);
    assert.equal(antwort.status, 404);
    assert.notEqual(await antwort.text(), 'DURCHGEREICHT');
  } finally {
    server.close();
  }
});
