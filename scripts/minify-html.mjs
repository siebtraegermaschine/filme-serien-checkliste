/* Verkleinert die Inline-<script>- und <style>-Blöcke einer HTML-Datei (nur im
   Docker-Build; die Quelle in Git bleibt lesbar). Top-Level-Namen bleiben
   unangetastet (klassisches Skript, kein Modul), damit onclick="..." und
   globale Funktionen weiter funktionieren. Fehler in einem Block lassen
   diesen Block unverändert. Aufruf: node minify-html.mjs <datei>... */
import fs from 'node:fs';
import { transformSync } from 'esbuild';

const JS_TYPEN = new Set(['', 'text/javascript', 'application/javascript']);

function verkleinere(html) {
  let skripte = 0, stile = 0;
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (ganz, attr, code) => {
    if (/\bsrc\s*=/i.test(attr) || !code.trim()) return ganz;
    const typ = (attr.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [, ''])[1].toLowerCase();
    if (!JS_TYPEN.has(typ)) return ganz;
    try {
      const { code: neu } = transformSync(code, {
        minify: true, legalComments: 'none', target: 'es2019', charset: 'utf8',
      });
      skripte++;
      return `<script${attr}>${neu.trimEnd()}</script>`;
    } catch (e) {
      console.warn('Skript-Block unverändert:', String(e.message).split('\n')[0]);
      return ganz;
    }
  });
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (ganz, attr, css) => {
    try {
      const { code: neu } = transformSync(css, { loader: 'css', minify: true, legalComments: 'none' });
      stile++;
      return `<style${attr}>${neu.trimEnd()}</style>`;
    } catch (e) {
      console.warn('Style-Block unverändert:', String(e.message).split('\n')[0]);
      return ganz;
    }
  });
  return { html, skripte, stile };
}

for (const datei of process.argv.slice(2)) {
  const alt = fs.readFileSync(datei, 'utf8');
  const { html, skripte, stile } = verkleinere(alt);
  fs.writeFileSync(datei, html);
  console.log(`${datei}: ${skripte} Skripte, ${stile} Styles, ${alt.length} -> ${html.length} Zeichen`);
}
