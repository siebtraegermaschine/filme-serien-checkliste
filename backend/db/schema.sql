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
  -- Ob DIESE Person den Titel über den Streaming-Tab entdeckt/hinzugefügt hat
  -- (fürs Watchlist-Filtern nach Herkunft). Bewusst hier statt auf titles.source,
  -- da die Herkunft pro Nutzer:in unterschiedlich sein kann -- titles ist ein
  -- geteilter Katalog, user_progress ist es nicht.
  via_stream BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, title_id)
);
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS via_stream BOOLEAN NOT NULL DEFAULT false;
-- 1-5-Sterne-Bewertung, die beim Markieren als "gesehen" abgefragt wird (siehe
-- index.html, openRatingModal). Fliesst gewichtet in den Taste-Score ein (siehe
-- buildProfile/RATING_WEIGHT) -- NULL fuer reine Watchlist-Eintraege oder
-- Alt-Titel von vor dieser Funktion, die zaehlen weiterhin neutral (Gewicht 1).
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

-- Titel, die eine Person per Swipe aus ihrer eigenen Discovery-Ansicht entfernt
-- hat ("Gelöschte Titel" unter Einstellungen). Rein pro Nutzer:in -- der Titel
-- bleibt fuer alle anderen ganz normal in Discovery sichtbar, nur diese Person
-- sieht ihn nicht mehr (bis sie ihn ueber "Zu Discovery hinzufuegen" wieder
-- freigibt). Ueberlebt daher auch kuenftige Discovery-Katalog-Updates, da der
-- Abgleich beim Anzeigen passiert, nicht beim Einspielen neuer Titel.
CREATE TABLE IF NOT EXISTS user_hidden_titles (
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id  BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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
ALTER TABLE streaming_cache ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Protokolliert manuell eingegebene Suchbegriffe (siehe backend/routes/searchLog.js)
-- fuer spaetere Auswertung, welche Titel/Begriffe Nutzer:innen suchen, aber (noch)
-- nicht finden -- Basis fuer Katalog-Erweiterungen. user_email ist NULL, wenn die
-- suchende Person nicht eingeloggt ist.
CREATE TABLE IF NOT EXISTS search_queries (
  id         BIGSERIAL PRIMARY KEY,
  query      TEXT NOT NULL,
  user_email CITEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_queries_created_at ON search_queries (created_at);

-- Von connect-pg-simple genutzte Session-Tabelle (Standard-Schema des Pakets).
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);
