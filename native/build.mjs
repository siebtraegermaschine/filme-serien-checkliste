/* Baut www/ fuer Capacitor aus den Web-Dateien im Repo-Wurzelordner.
   index.html bleibt die einzige Quelle; hier wird nur kopiert und die API-Basis
   aus app.config.json eingesetzt. Aufruf: npm run build (oder sync). */
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const hier = dirname(fileURLToPath(import.meta.url));
const wurzel = join(hier, '..');
const www = join(hier, 'www');
const cfg = JSON.parse(readFileSync(join(hier, 'app.config.json'), 'utf8'));

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

const dateien = ['consent.js', 'moviematch.webp', 'tmdb-logo.svg', 'icon-192.png', 'favicon-32.png', 'apple-touch-icon.png'];
for (const d of dateien) {
  if (!existsSync(join(wurzel, d))) throw new Error('Datei fehlt: ' + d);
  cpSync(join(wurzel, d), join(www, d));
}
cpSync(join(wurzel, 'tour'), join(www, 'tour'), { recursive: true });

const marke = "apiBase: 'https://movietaste.de',";
let html = readFileSync(join(wurzel, 'index.html'), 'utf8');
if (!html.includes(marke)) throw new Error('apiBase-Marke in index.html nicht gefunden');
html = html.replace(marke, `apiBase: ${JSON.stringify(cfg.apiBase)},`);
// Manifest und Web-Icon-Links sind in der App ohne Wirkung; weglassen spart tote Anfragen.
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
writeFileSync(join(www, 'index.html'), html);
// capacitor.config.json wird aus app.config.json erzeugt (Name, IDs an einer Stelle).
const capCfg = {
  appId: cfg.appId,
  appName: cfg.appName,
  webDir: 'www',
  ios: { contentInset: 'never', backgroundColor: '#0e1116' },
  android: { backgroundColor: '#0e1116' },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#0e1116', showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#0e1116' },
  },
};
writeFileSync(join(hier, 'capacitor.config.json'), JSON.stringify(capCfg, null, 2) + '\n');
console.log('www/ gebaut (' + (html.length / 1024).toFixed(0) + ' KB index.html), apiBase ' + cfg.apiBase);
