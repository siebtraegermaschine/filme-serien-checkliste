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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PgSession = connectPgSimple(session);
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1); // hinter Caddy/Traefik als Reverse Proxy

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
}

app.use(express.json({ limit: '1mb' }));

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
