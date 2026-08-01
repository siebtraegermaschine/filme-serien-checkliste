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
-- TMDB vergibt Film- und Serien-IDs in getrennten, unabhaengigen Nummernkreisen --
-- Film-ID 240 (z.B. "Der Pate - Teil II") und Serien-ID 240 sind zwei voellig
-- verschiedene Titel, die zufaellig dieselbe Nummer tragen. Die urspruengliche
-- UNIQUE(tmdb_id)-Regel behandelte beide faelschlich als denselben Datensatz --
-- der Discovery-Import (ON CONFLICT (tmdb_id)) hat dadurch bei jeder Kollision
-- die Felder des einen Titels mit denen des anderen ueberschrieben (type blieb
-- dabei unveraendert, da nicht Teil des UPDATE SET, daher z.B. ein "movie" mit
-- falscher Serien-Bewertung/-Beschreibung/-Jahr). Betrifft nur source<>'catalog'
-- (die urspruenglich manuell kuratierten 300+300 Katalog-Titel sind TMDB-IDs,
-- die beim Relaunch einzeln zugeordnet wurden und nicht kollidieren).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'titles_tmdb_id_key') THEN
    ALTER TABLE titles DROP CONSTRAINT titles_tmdb_id_key;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'titles_tmdb_id_type_key') THEN
    ALTER TABLE titles ADD CONSTRAINT titles_tmdb_id_type_key UNIQUE (tmdb_id, type);
  END IF;
END $$;

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
-- 1-10-Sterne-Bewertung (aehnlich IMDb), die beim Markieren als "gesehen"
-- abgefragt wird (siehe index.html, openRatingModal). Fliesst gewichtet in den
-- Taste-Score ein (siehe buildProfile/RATING_WEIGHT) -- NULL fuer reine
-- Watchlist-Eintraege oder Alt-Titel von vor dieser Funktion, die zaehlen
-- weiterhin neutral (Gewicht 1).
ALTER TABLE user_progress ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 10);
-- Umstellung von 1-5 auf 1-10 Sterne: bestehende Bewertungen einmalig umrechnen
-- (1->2, 2->4, 3->5, 4->8, 5->10) und die alte 1-5-Constraint durch die neue
-- 1-10-Constraint ersetzen. Erkennt am Constraint-Text, ob die alte 1-5-Grenze
-- noch aktiv ist -- laeuft dadurch nur einmal, auch wenn schema.sql (wie ueblich)
-- bei jedem Deploy erneut komplett ausgefuehrt wird.
DO $$
DECLARE
  old_cons TEXT;
BEGIN
  SELECT conname INTO old_cons FROM pg_constraint
    WHERE conrelid = 'user_progress'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%rating%'
      AND pg_get_constraintdef(oid) LIKE '%<= 5%';
  IF old_cons IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_progress DROP CONSTRAINT %I', old_cons);
    UPDATE user_progress SET rating = CASE rating
      WHEN 1 THEN 2 WHEN 2 THEN 4 WHEN 3 THEN 5 WHEN 4 THEN 8 WHEN 5 THEN 10
      ELSE rating END
      WHERE rating IS NOT NULL;
    ALTER TABLE user_progress ADD CONSTRAINT user_progress_rating_check
      CHECK (rating IS NULL OR rating BETWEEN 1 AND 10);
  END IF;
END $$;

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

-- Aktuelle/kommende Kinostarts (Deutschland) -- analog zu streaming_cache
-- eigenstaendig von `titles`, bis eine Person einen Titel per Watchlist/Gesehen
-- tatsaechlich uebernimmt. category wird beim taeglichen Import aus dem
-- Kinostart-Datum berechnet (siehe cinema-fetch.mjs): 'now' (aktuell im Kino,
-- inkl. neu gestarteter), 'soon' (Start in den naechsten ~4 Wochen), 'later'
-- (Start im naechsten Jahr danach).
CREATE TABLE IF NOT EXISTS cinema_cache (
  tmdb_id       INTEGER NOT NULL,
  title         TEXT NOT NULL,
  year          INTEGER,
  genres        TEXT[] NOT NULL DEFAULT '{}',
  director      TEXT,
  cast_names    TEXT[] NOT NULL DEFAULT '{}',
  poster_path   TEXT,
  rating        NUMERIC(3,1),
  overview      TEXT,
  release_date  DATE,
  category      TEXT NOT NULL CHECK (category IN ('now', 'soon', 'later')),
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tmdb_id)
);
-- Nur bei Wiederauffuehrungen gesetzt (z.B. Klassiker-Reihen): das
-- urspruengliche (globale) Erstveroeffentlichungsdatum, falls es sich vom
-- eigentlichen (deutschen) Kinotermin in release_date im Jahr unterscheidet --
-- siehe cinema-fetch.mjs. NULL bei ganz normalen Neustarts.
ALTER TABLE cinema_cache ADD COLUMN IF NOT EXISTS original_release_date DATE;

-- Streamen/Leihen/Kaufen-Verfuegbarkeit je Titel (Quelle: TMDB, Daten von
-- JustWatch) -- Grundlage fuer die Ansehen/Leihen/Kaufen-Buttons in der
-- Detailansicht. Bewusst NICHT taeglich fuer den gesamten Katalog vorbefuellt
-- (das waere ein TMDB-Request pro Titel, also zehntausende pro Lauf), sondern
-- on demand beim ersten Oeffnen eines Titels; danach gilt der Eintrag als
-- gueltig, bis er aelter als WATCH_PROVIDERS_TTL_HOURS ist (siehe
-- backend/routes/watchProviders.js).
--
-- Ergaenzt streaming_cache, ersetzt es nicht: streaming_cache beantwortet
-- "welche Titel laufen bei Anbieter X?" (Basis fuer den Streaming-Filter und
-- vorab per GitHub Action befuellt), diese Tabelle beantwortet umgekehrt
-- "wo laeuft Titel Y?" -- inkl. Leihen/Kaufen, die streaming_cache gar nicht
-- kennt (stream-fetch.mjs fragt nur flatrate ab).
--
-- flatrate/rent/buy sind JSONB-Arrays von {id, name, logo} -- bewusst als
-- JSONB statt eigener Zeilen pro Anbieter: die Daten werden immer komplett
-- am Stueck geschrieben und gelesen, nie einzeln abgefragt oder gejoint.
CREATE TABLE IF NOT EXISTS watch_providers_cache (
  tmdb_id    INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('movie', 'series')),
  region     TEXT NOT NULL DEFAULT 'DE',
  flatrate   JSONB NOT NULL DEFAULT '[]',
  rent       JSONB NOT NULL DEFAULT '[]',
  buy        JSONB NOT NULL DEFAULT '[]',
  -- TMDB-Watch-Seite des Titels. Wird derzeit nicht angezeigt (die App verlinkt
  -- als Quellenangabe JustWatch), aber mitgespeichert -- ohne erneuten Abruf
  -- nicht wiederherstellbar.
  link       TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tmdb_id, type, region)
);

-- Nachtraeglich per TMDB-Suche (Titel+Jahr+Typ) ermittelte TMDB-IDs fuer die
-- 600 urspruenglich manuell kuratierten Katalog-Titel, die alle tmdb_id NULL
-- haben. Ohne diese Zuordnung koennten sie die Ansehen/Leihen/Kaufen-Buttons
-- nicht nutzen (mehr als die Haelfte aller Titel unter Filme/Serien).
--
-- Bewusst eine EIGENE Tabelle, statt titles.tmdb_id zu befuellen: die Suche ist
-- eine Heuristik und kann danebenliegen. Ein Fehltreffer wuerde in titles einen
-- kuratierten Katalog-Eintrag dauerhaft mit fremden Daten verknuepfen (und ueber
-- UNIQUE (tmdb_id, type) auch noch mit einem echten Discovery-Titel kollidieren
-- koennen). Hier bleibt er folgenlos korrigierbar: Zeile loeschen genuegt.
--
-- tmdb_id IS NULL bedeutet "gesucht, aber nichts Passendes gefunden" -- damit
-- wird nicht bei jedem Oeffnen des Titels erneut erfolglos gesucht.
CREATE TABLE IF NOT EXISTS title_tmdb_resolution (
  title_id    BIGINT PRIMARY KEY REFERENCES titles(id) ON DELETE CASCADE,
  tmdb_id     INTEGER,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
