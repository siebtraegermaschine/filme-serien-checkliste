import 'dotenv/config';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PgSession = connectPgSimple(session);
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1); // hinter Caddy/Traefik als Reverse Proxy

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
}

// /api/titles/bulk-ingest und /api/streaming/ingest bekommen ein hoeheres
// Limit -- seit dem Wegfall der Titel-Obergrenzen (kein STREAM_COUNT-Deckel
// mehr, Discovery-Schwelle auf Bewertung>=5/Stimmen>=100 gesenkt) landen hier
// zehntausende Titel inkl. Cast/Kurzbeschreibung in einem Request (geschaetzt
// 10-20 MB). Alle anderen (oeffentlich erreichbaren) Routen bleiben bewusst
// beim kleinen 1mb-Default als Schutz vor ueberdimensionierten Requests.
app.use('/api/titles/bulk-ingest', express.json({ limit: '10mb' }));
app.use('/api/streaming/ingest', express.json({ limit: '30mb' }));
app.use((req, res, next) => {
  if (req.path === '/api/titles/bulk-ingest' || req.path === '/api/streaming/ingest') return next(); // oben schon geparst
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

app.use('/api/auth', authRouter);
app.use('/api/titles', titlesRouter);
app.use('/api/progress', progressRouter);
app.use('/api/streaming', streamingRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api/search-log', searchLogRouter);
app.use('/api/hidden-titles', hiddenTitlesRouter);
app.use('/api/cinema', cinemaRouter);

// Statisches Frontend (index.html liegt im Repo-Root, eine Ebene über backend/).
const frontendRoot = path.join(__dirname, '..');
app.use(express.static(frontendRoot, { index: 'index.html', extensions: ['html'] }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Backend läuft auf Port ${port} (${process.env.NODE_ENV || 'development'})`);
});
