-- Schema für den Relaunch von "Filme & Serien" als Multi-User-Web-App.
-- Ersetzt die im Client eingebetteten Arrays FILME/SERIEN/DETAILS/CAND sowie
-- den localStorage-basierten Nutzerzustand aus der bisherigen Single-File-App.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS titles (
  id             BIGSERIAL PRIMARY KEY,
  tmdb_id        INTEGER UNIQUE,              -- NULL bei Alt-Titeln ohne bekannte TMDB-ID
  type           TEXT NOT NULL CHECK (type IN ('movie', 'series')),
  title          TEXT NOT NULL,
  original_title TEXT,
  year           INTEGER,
  genres         TEXT[] NOT NULL DEFAULT '{}',
  director       TEXT,
  cast_names     TEXT[] NOT NULL DEFAULT '{}',
  keywords       TEXT[] NOT NULL DEFAULT '{}',
  rating         NUMERIC(3,1),
  plot           TEXT,
  poster_path    TEXT,                        -- TMDB-Pfad, z. B. "/abc123.jpg"
  poster_base64  TEXT,                        -- Fallback für Alt-Poster ohne bekannten TMDB-Pfad
  source         TEXT NOT NULL DEFAULT 'catalog', -- 'catalog' | 'discovery' | 'streaming'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_titles_type ON titles (type);
CREATE INDEX IF NOT EXISTS idx_titles_title_trgm ON titles USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_titles_genres ON titles USING gin (genres);

CREATE TABLE IF NOT EXISTS users (
  id                BIGSERIAL PRIMARY KEY,
  email             CITEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);

-- Ersetzt STORAGE_KEY/WATCH_KEY aus localStorage: Gesehen- und Watchlist-Status
-- je Nutzer und Titel. Ein Nutzer darf ausschließlich eigene Zeilen lesen/schreiben
-- (wird auf API-Ebene erzwungen, s. backend/middleware/requireAuth.js).
CREATE TABLE IF NOT EXISTS user_progress (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id   BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  seen       BOOLEAN NOT NULL DEFAULT false,
  watchlist  BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, title_id)
);

-- Aktuelle Streaming-Verfügbarkeit je Anbieter (ersetzt streaming.json).
-- Eigenständig von `titles`, da es sich um TMDB-Kandidaten handelt, die erst beim
-- Hinzufügen/Watchlisten durch eine:n Nutzer:in in `titles` übernommen werden.
CREATE TABLE IF NOT EXISTS streaming_cache (
  provider_id   TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('movie', 'series')),
  tmdb_id       INTEGER NOT NULL,
  title         TEXT NOT NULL,
  year          INTEGER,
  genres        TEXT[] NOT NULL DEFAULT '{}',
  director      TEXT,
  cast_names    TEXT[] NOT NULL DEFAULT '{}',
  poster_path   TEXT,
  rating        NUMERIC(3,1),
  overview      TEXT,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, type, tmdb_id)
);

-- Von connect-pg-simple genutzte Session-Tabelle (Standard-Schema des Pakets).
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
