/* Aufnahme-Server fuer die Tour-Screenshots. Liefert die LOKALE index.html
   (also den heutigen Stand der Oberflaeche), reicht aber alle /api-Aufrufe an
   die Produktion durch -- so stehen echte Titel mit echten Postern in den
   Bildern, ohne dass hier eine Datenbank laufen muss.
   /_shot.html ist dieselbe Seite mit einem zusaetzlichen Skript, das die
   jeweilige Ansicht herstellt und die Markierung zeichnet. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ZIEL = 'https://movietaste.de';
const TYPEN = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
                '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const pfad = req.url.split('?')[0];

  if (pfad.startsWith('/api/')) {
    try {
      const koerper = req.method === 'POST'
        ? await new Promise((r) => { let d = ''; req.on('data', (c) => d += c); req.on('end', () => r(d)); })
        : undefined;
      const antwort = await fetch(ZIEL + req.url, {
        method: req.method,
        headers: { 'content-type': 'application/json' },
        body: koerper,
      });
      const text = await antwort.text();
      res.writeHead(antwort.status, { 'Content-Type': 'application/json' });
      res.end(text);
    } catch (e) {
      res.writeHead(502); res.end('{}');
    }
    return;
  }

  if (pfad === '/_shot.html') {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
      .replace('</body>', '<script src="/scripts/tour/aufbau.js"></script></body>');
    res.writeHead(200, { 'Content-Type': TYPEN['.html'] });
    res.end(html);
    return;
  }

  const datei = path.join(ROOT, decodeURIComponent(pfad));
  fs.readFile(datei, (err, buf) => {
    if (err) { res.writeHead(404); res.end('nicht gefunden'); return; }
    res.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(4600, () => console.log('Aufnahme-Server auf http://localhost:4600'));
