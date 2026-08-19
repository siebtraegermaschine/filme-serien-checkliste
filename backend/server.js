import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from './db/pool.js';
import authRouter from './routes/auth.js';
import titlesRouter from './routes/titles.js';
import progressRouter from './routes/progress.js';
import streamingRouter from './routes/streaming.js';
import feedbackRouter from './routes/feedback.js';
import searchLogRouter from './routes/searchLog.js';
import hiddenTitlesRouter from './routes/hiddenTitles.js';
import cinemaRouter from './routes/cinema.js';
import sportRouter from './routes/sport.js';
import watchProvidersRouter from './routes/watchProviders.js';
import trailersRouter from './routes/trailers.js';
import linksRouter from './routes/links.js';
import kinosRouter from './routes/kinos.js';
import shareRouter, { ladeTitel, ergaenzeBackdrop } from './routes/share.js';
import seoRouter from './routes/seo.js';
import { attrEsc } from './lib/seoRender.js';
import { slugify } from './lib/slug.js';
import { ladeSeoText } from './lib/seoData.js';
import movieNightRouter from './routes/movieNight.js';
import metrikRouter from './routes/metrik.js';
import eventsRouter from './routes/events.js';
import kpiRouter from './routes/kpi.js';
import onboardingRouter from './routes/onboarding.js';
import { anonId } from './middleware/anonId.js';
import { starteKpiSnapshot, starteKpiAufraeumen } from './lib/kpi.js';
import { starteAufraeumen } from './lib/kontoAufraeumen.js';
import { starteFeedbackAufraeumen } from './lib/feedback.js';
import { starteWache, ueberwacheProzess, melde } from './lib/wache.js';
import { starteBenachrichtigung } from './lib/benachrichtigung.js';
import { starteWochenendmail } from './lib/wochenendmail.js';
import { mengenGrenze } from './middleware/rateLimit.js';
import { starteSicherung } from './lib/sicherung.js';
import { starteThemen } from './lib/themen.js';
import { vorwaermen } from './lib/listenCache.js';
import { ladeListe, listenSchluessel } from './routes/titles.js';
import { ladeStreaming, streamingSchluessel } from './routes/streaming.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PgSession = connectPgSimple(session);
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1); // hinter Caddy/Traefik als Reverse Proxy

// So frueh wie moeglich: Faengt unbehandelte Fehler ab, die vor oder neben
// jeder Route auftreten koennen (siehe lib/wache.js).
ueberwacheProzess();

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
}

// /api/titles/bulk-ingest und /api/streaming/ingest bekommen ein hoeheres
// Limit -- seit dem Wegfall der Titel-Obergrenzen (kein STREAM_COUNT-Deckel
// mehr, Discovery-Schwelle auf Bewertung>=5/Stimmen>=100 gesenkt) landen hier
// zehntausende Titel inkl. Cast/Kurzbeschreibung in einem Request (geschaetzt
// 10-20 MB). Alle anderen (oeffentlich erreichbaren) Routen bleiben bewusst
// beim kleinen 1mb-Default als Schutz vor ueberdimensionierten Requests.
// Seit dem Sprachausbau (uebersetzungen-JSONB, 12. August 2026) tragen die
// Ingest-Payloads Titel und Inhaltsangaben in bis zu sieben Sprachen --
// die Limits sind entsprechend gewachsen. cinema/ingest fiel vorher aufs
// 1mb-Default und brach mit PayloadTooLargeError ab.
app.use('/api/titles/bulk-ingest', express.json({ limit: '30mb' }));
app.use('/api/streaming/ingest', express.json({ limit: '60mb' }));
app.use('/api/cinema/ingest', express.json({ limit: '20mb' }));
// Sport: eine Saison aller Wettbewerbe sind ~1.000 kompakte Spielzeilen
// (<1 MB) -- 5mb lassen Luft fuer weitere Wettbewerbe/Sportarten.
app.use('/api/sport/ingest', express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  if (req.path === '/api/titles/bulk-ingest' || req.path === '/api/streaming/ingest'
      || req.path === '/api/cinema/ingest' || req.path === '/api/sport/ingest') return next(); // oben schon geparst
  express.json({ limit: '1mb' })(req, res, next);
});

app.use(
  session({
    store: new PgSession({ pool, tableName: 'session' }),
    name: 'fs.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 Tage
    },
  })
);

// Anonyme Geraetekennung (Cookie mt_anon) fuer die KPI-Erfassung -- vor den
// Routen, damit jede davon req.anonId hat (siehe middleware/anonId.js).
app.use('/api', anonId);

app.use('/api/auth', authRouter);
app.use('/api/titles', titlesRouter);
app.use('/api/progress', progressRouter);
app.use('/api/streaming', streamingRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/search-log', searchLogRouter);
app.use('/api/hidden-titles', hiddenTitlesRouter);
app.use('/api/cinema', cinemaRouter);
app.use('/api/sport', sportRouter);
app.use('/api/watch-providers', watchProvidersRouter);
app.use('/api/trailers', trailersRouter);
app.use('/api/links', linksRouter);
app.use('/api/kinos', kinosRouter);
app.use('/api/share', shareRouter);
app.use('/api/movie-night', movieNightRouter);
app.use('/api/metrik', metrikRouter);
app.use('/api/events', eventsRouter);
app.use('/api/kpi', kpiRouter);
app.use('/api/onboarding', onboardingRouter);

// Statisches Frontend (index.html liegt im Repo-Root, eine Ebene über backend/).
const frontendRoot = path.join(__dirname, '..');

/* ---- Geteilte Titel: /t/<art>/<tmdb-id> ----
   Liefert dieselbe index.html aus, nur mit titelspezifischen Open-Graph-Angaben
   im Kopf. Das ist der einzige Weg zu einer brauchbaren Vorschau in WhatsApp,
   iMessage & Co: Deren Vorschau-Roboter laden die Seite, fuehren aber kein
   JavaScript aus -- die Angaben muessen also schon im ausgelieferten HTML
   stehen. Die App selbst liest den Pfad beim Start und oeffnet die Titelkarte.

   Die Datei wird einmal gelesen und im Speicher gehalten; sie aendert sich nur
   beim Deploy, der ohnehin den Prozess neu startet. */
const OG_START = '<!-- og:start';
const OG_ENDE = '<!-- og:end -->';
let indexHtmlCache = null;
function indexHtml() {
  if (indexHtmlCache == null) {
    indexHtmlCache = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf8');
  }
  return indexHtmlCache;
}
// Kurzbeschreibung fuer die Vorschaukarte: Bewertung und Genre vorweg, dann so
// viel Inhaltsangabe wie hineinpasst. WhatsApp kuerzt nach rund 160 Zeichen --
// besser wir kuerzen sauber an einer Wortgrenze als mitten im Wort.
function vorschauText(t) {
  const kopf = [];
  if (t.rating != null && Number(t.rating) > 0) kopf.push('⭐ ' + String(t.rating).replace('.', ','));
  if (t.genres && t.genres[0]) kopf.push(t.genres[0]);
  if (t.year) kopf.push(String(t.year));
  const rest = (t.plot || '').trim();
  let text = kopf.join(' · ');
  if (rest) {
    const platz = 160 - text.length - 3;
    text += ' · ' + (rest.length <= platz ? rest : rest.slice(0, Math.max(0, rest.lastIndexOf(' ', platz))) + ' …');
  }
  return text;
}

// Dieselbe Arbeit wie /api/share/title (ladeTitel + moeglicher TMDB-Abruf),
// deshalb dieselbe Deckelung je IP. Ein Mensch oder ein Vorschau-Roboter oeffnet
// so einen Link selten; das Limit trifft nur das Haemmern ueber viele Kennungen.
app.get('/t/:art/:kennung', mengenGrenze({ name: 'share-page', anzahl: 120, minuten: 1 }), async (req, res, next) => {
  const art = req.params.art;
  if (['id', 'movie', 'series'].indexOf(art) === -1) return next();
  const kennung = Number(req.params.kennung);
  if (!Number.isInteger(kennung) || kennung <= 0) return next();
  let titel = null;
  try {
    titel = await ladeTitel(art, kennung);
  } catch (err) {
    console.error('Teilen-Vorschau fehlgeschlagen:', err);
  }
  // Unbekannter Titel: einfach die normale App ausliefern statt einer
  // Fehlerseite -- der Link soll nie ins Leere laufen.
  if (!titel) return res.type('html').send(indexHtml());

  let backdrop = null;
  try { backdrop = await ergaenzeBackdrop(titel); } catch { /* Poster reicht auch */ }

  const url = 'https://movietaste.de/t/' + art + '/' + kennung;
  const bild = backdrop
    ? 'https://image.tmdb.org/t/p/w1280' + backdrop
    // Letzter Rueckfall (weder Szenenbild noch Poster): dasselbe Querformat-
    // Banner wie auf der Startseite, nicht mehr das quadratische App-Symbol.
    : (titel.poster_path ? 'https://image.tmdb.org/t/p/w500' + titel.poster_path
                         : 'https://movietaste.de/og-image.png');
  const grossesBild = !!backdrop;
  const titelZeile = titel.title + (titel.year ? ' (' + titel.year + ')' : '') + ' – MovieMatch';

  // Canonical auf die volle SEO-Seite (siehe backend/routes/seo.js), falls es
  // fuer diesen Titel schon eine gibt -- verhindert, dass Google diese
  // Vorschauseite und /de-de/film|serie/... als zwei Versionen desselben
  // Inhalts wertet. Nur moeglich, wenn der Titel eine echte titles-Zeile hat
  // (titel.quelle !== 'cinema_cache', siehe ladeTitel in share.js) UND schon
  // eigener SEO-Text existiert (seoData.js: indexierbar erst dann).
  let canonicalTag = '';
  if (titel.quelle !== 'cinema_cache' && titel.tmdb_id) {
    let text = null;
    try { text = await ladeSeoText('titel', `${titel.type}:${titel.tmdb_id}`, 'de-de'); } catch { /* egal, bleibt ohne Canonical */ }
    if (text) {
      const artWort = titel.type === 'series' ? 'serie' : 'film';
      canonicalTag = '<link rel="canonical" href="https://movietaste.de/de-de/' + artWort + '/' + slugify(titel.title) + '-' + titel.tmdb_id + '">';
    }
  }

  const block = [
    canonicalTag,
    '<meta property="og:site_name" content="MovieMatch">',
    '<meta property="og:type" content="video.' + (titel.type === 'series' ? 'tv_show' : 'movie') + '">',
    '<meta property="og:url" content="' + attrEsc(url) + '">',
    '<meta property="og:title" content="' + attrEsc(titelZeile) + '">',
    '<meta property="og:description" content="' + attrEsc(vorschauText(titel)) + '">',
    '<meta property="og:image" content="' + attrEsc(bild) + '">',
    grossesBild ? '<meta property="og:image:width" content="1280">' : '',
    grossesBild ? '<meta property="og:image:height" content="720">' : '',
    '<meta name="twitter:card" content="' + (grossesBild ? 'summary_large_image' : 'summary') + '">',
  ].filter(Boolean).join('\n');

  const html = indexHtml();
  const a = html.indexOf(OG_START);
  const b = html.indexOf(OG_ENDE);
  if (a < 0 || b < 0) return res.type('html').send(html);
  res.type('html').send(html.slice(0, a) + block + html.slice(b + OG_ENDE.length));
});

// Viele Vorschau-Dienste und Browser fragen zuerst /favicon.ico ab, bevor sie
// die <link rel="icon">-Angaben auswerten. Ohne diese Zeile kam dort ein 404,
// und manche zeigten daraufhin ihren eigenen Platzhalter statt des Logos.
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(frontendRoot, 'favicon-32.png')));

// SEO-Seiten (/<locale>/film|serie|filme|... und /sitemap-*.xml) -- eigene,
// von der App getrennte Dokumente (siehe PLAN-SEO-UMSETZUNG). Muss vor
// express.static stehen, sonst faengt dessen SPA-Fallback (index.html mit
// extensions:['html']) diese Pfade zuerst ab.
app.use(seoRouter);

/* frontendRoot ist /app im Image, und dort liegt neben den Frontend-Dateien
   auch das Backend selbst (siehe backend/Dockerfile: COPY backend/ ./backend/).
   Ohne diese Sperre liefert express.static den kompletten Serverquelltext aus --
   am 11.08.2026 nachgewiesen: /backend/server.js, /backend/routes/auth.js und
   /backend/db/schema.sql kamen mit HTTP 200 zurueck.

   Zugangsdaten waren nie betroffen (backend/.env steht in .dockerignore und
   kommt ueber env_file in den Container), aber Quelltext und Datenbankschema
   gehoeren nicht ins Netz -- sie zeigen jedem, wo er ansetzen kann.

   Bewusst vor express.static und nicht als Aenderung am Dockerfile: Das Backend
   MUSS im Image liegen, es soll nur nicht ausgeliefert werden. */
app.use((req, res, next) => {
  if (/^\/backend(\/|$)/i.test(req.path)) return res.status(404).type('txt').send('Not found');
  next();
});

app.use(express.static(frontendRoot, { index: 'index.html', extensions: ['html'] }));

app.use((err, req, res, next) => {
  console.error(err);
  // Der Fehlerbehandler ist die letzte Stelle, an der ein Fehler ueberhaupt
  // noch auffaellt -- ohne Meldung stuende er nur im Container-Protokoll, das
  // niemand liest. Methode und Pfad reichen zum Wiederfinden; Nutzlast und
  // Zugangsdaten gehoeren ausdruecklich nicht in eine Mail.
  melde('server-fehler', 'Unbehandelter Fehler im Backend',
    `${req.method} ${req.path}\n\n${err && err.stack ? err.stack : String(err)}`).catch(() => {});
  res.status(500).json({ error: 'internal_error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend läuft auf Port ${port} (${process.env.NODE_ENV || 'development'})`);
  // Loescht Konten, deren Widerrufsfrist abgelaufen ist -- beim Start und
  // danach einmal taeglich (siehe lib/kontoAufraeumen.js).
  starteAufraeumen();
  // Loescht Rueckmeldungen nach Ablauf der Aufbewahrung -- die Frist steht in
  // lib/feedback.js und ist in der Datenschutzerklaerung zugesagt.
  starteFeedbackAufraeumen();
  // Taegliche Datenbank-Sicherung, am Monatsersten zusaetzlich eine
  // Vollsicherung (siehe lib/sicherung.js). Laeuft mit dem Container mit,
  // damit dafuer kein Cronjob von Hand eingerichtet werden muss.
  starteSicherung();
  // Taeglich nach den Importen die Themen-Schlagwoerter nachtragen (siehe
  // lib/themen.js) -- Trends wie True Crime kennt TMDB nur als Schlagwort,
  // nicht als Genre, und die Titel der Nacht sollen ihres von selbst bekommen.
  starteThemen();
  // Meldet Stoerungen per Mail -- nur im Fehlerfall, nie "alles in Ordnung"
  // (siehe lib/wache.js). Prueft taeglich, ob die Importe ausgeblieben sind.
  starteWache();
  // Taeglicher Opt-in-Sammelversand "Watchlist-Titel jetzt verfuegbar"
  // (siehe lib/benachrichtigung.js) -- nach den Import-Ketten des Tages.
  starteBenachrichtigung();
  // Donnerstags-Mail "Drei fuer dein Wochenende" -- gebaut, aber der
  // automatische Versand wartet auf WOCHENEND_MAIL_AKTIV=1 (Entscheidung
  // von Christian steht aus; bis dahin nur npm run wochenendmail von Hand).
  starteWochenendmail();
  // Woechentlicher KPI-Snapshot der Vorwoche, montags ab 06:00 Europe/Berlin
  // (siehe lib/kpi.js). Holt verpasste Wochen beim naechsten Start nach.
  starteKpiSnapshot();
  // Loescht Einzelereignisse der Reichweitenmessung nach der in der
  // Datenschutzerklaerung zugesagten Frist (siehe lib/kpi.js).
  starteKpiAufraeumen();
  /* Die beiden grossen Startlisten gleich bauen, statt den ersten Besucher nach
     einem Deploy warten zu lassen. Der Aufruf entspricht genau dem, den die App
     beim Start macht -- steht dort ein anderer Parameter, waermt das hier ins
     Leere und die Liste wird beim ersten Aufruf gebaut (siehe listenCache.js). */
  vorwaermen([
    { schluessel: listenSchluessel({ source: 'catalog,discovery,streaming' }),
      ermitteln: () => ladeListe({ source: 'catalog,discovery,streaming' }) },
    { schluessel: streamingSchluessel('de', 'DE'), ermitteln: () => ladeStreaming('de', 'DE') },
  ]);
});
