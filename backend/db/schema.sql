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

-- Selbst gewaehlte Streaminganbieter (TMDB-Provider-IDs, siehe Einstellungen ->
-- "Streaminganbieter"). Steuert, welche Anbieter unter Ansehen/Leihen/Kaufen,
-- an den Titelzeilen und im "Nur Streaming"-Filter ueberhaupt auftauchen --
-- ohne diese Einschraenkung listet TMDB je Titel schnell ein Dutzend Anbieter,
-- von denen man die meisten gar nicht nutzt.
--
-- Drei unterscheidbare Zustaende, bewusst als NULL-faehiges Array statt als
-- eigener Tabelle (die Auswahl wird immer komplett gelesen und geschrieben,
-- nie einzeln abgefragt oder gejoint):
--   NULL          -- noch nie konfiguriert; es gelten die vier Anbieter, die
--                    auch der taegliche Streaming-Abgleich kennt (Netflix 8,
--                    Amazon Prime Video 9, Disney+ 337, Apple TV+ 350)
--   leeres Array  -- bewusst nichts ausgewaehlt: dann wird NICHT gefiltert,
--                    also alle Anbieter gezeigt (sonst waere die Anzeige leer
--                    und die Einstellung eine Sackgasse)
--   gefuellt      -- genau diese Anbieter
ALTER TABLE users ADD COLUMN IF NOT EXISTS watch_provider_ids INTEGER[];

-- Anzeigename ("Vorname / Profilname"), sichtbar fuer verknuepfte Profile.
-- Bewusst nur EIN Feld ohne Nachnamen: fuer die Wiedererkennung unter Bekannten
-- reicht das, und es gibt nicht mehr preis als noetig. NULL bei Konten, die vor
-- dieser Funktion angelegt wurden -- die App fragt einmalig nach.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- AKTUELL UNGENUTZT -- bewusst vorgehalten, nicht vergessen.
--
-- Fuer die anonymen Bewertungsstatistiken (Titel + Anzahl + Verteilung, siehe
-- datenschutz.html Abschnitt 8) braucht es keine Einwilligung: solche Aggregate
-- sind keine personenbezogenen Daten mehr. Erst eine personenbezogene
-- Auswertung (zusammenhaengendes Bewertungsprofil) wuerde eine erfordern --
-- diese Entscheidung ist vertagt, die Oberflaeche fragt derzeit nichts ab.
--
-- Bleibt die Frage spaeter aktuell: Gespeichert wuerde der ZEITPUNKT, nicht nur
-- ein Ja/Nein (Art. 7 Abs. 1 verlangt Nachweisbarkeit), und die Einwilligung
-- darf keine Voraussetzung fuer die Nutzung sein -- sonst waere sie nach
-- Art. 7 Abs. 4 voraussichtlich unwirksam und damit wertlos.
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_consent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS data_consent_revoked_at TIMESTAMPTZ;

-- Verknuepfte Profile ("Ich"-Filter): wer darf mit wem seine Titel abgleichen.
-- Bewusst ZWEI Zeilen je Verknuepfung (A->B und B->A) statt einer mit
-- Sortierregel: so ist jede Abfrage ein simples WHERE user_id = $1, und beim
-- Loesen verschwinden schlicht beide Richtungen. Eine Verknuepfung ist immer
-- gegenseitig -- einseitig gekappt koennte die andere Person weiterhin die
-- eigenen Titel sehen, was niemand erwarten wuerde.
CREATE TABLE IF NOT EXISTS user_links (
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, linked_user_id),
  CHECK (user_id <> linked_user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_links_user ON user_links (user_id);

-- Einladungen zum Verknuepfen. Wie bei password_reset_tokens wird NUR der Hash
-- gespeichert -- wer die Datenbank liest, kann damit keine Einladung einloesen.
-- Einmalig einloesbar (accepted_by) und mit Ablaufdatum, weil ein weitergeleiteter
-- Link sonst dauerhaft Zugriff auf die eigene Titelliste eroeffnen wuerde.
CREATE TABLE IF NOT EXISTS user_link_invites (
  token_hash  TEXT PRIMARY KEY,
  inviter_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_link_invites_inviter ON user_link_invites (inviter_id);

-- Zwei Arten von Einladung, seit es zwei Knoepfe gibt:
--   'share'    -- "Watchliste teilen": loest beim Annehmen eine Verknuepfung
--                 aus, setzt also ein Konto voraus. Laeuft ab.
--   'referral' -- "Personen einladen": weist nur auf die App hin, gibt NICHTS
--                 preis und braucht kein Konto. Laeuft nicht ab.
-- Bestehende Zeilen sind 'share' -- das war das bisherige Verhalten.
ALTER TABLE user_link_invites ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'share';
-- Ohne Ablauf moeglich (referral): expires_at darf NULL sein.
ALTER TABLE user_link_invites ALTER COLUMN expires_at DROP NOT NULL;

-- Mehrfach einloesbar: Wer den Link in eine Gruppe stellt, will nicht, dass nur
-- die erste Person durchkommt. Statt der einzelnen Spalte accepted_by zaehlt
-- jetzt diese Tabelle die Einloesungen. Der Primaerschluessel ueber beide
-- Spalten macht dabei doppelte Klicks derselben Person folgenlos.
-- accepted_by/accepted_at bleiben als Altbestand stehen; gelesen werden sie
-- nicht mehr (die Uebernahme steht direkt darunter).
CREATE TABLE IF NOT EXISTS user_link_invite_uses (
  token_hash  TEXT NOT NULL REFERENCES user_link_invites(token_hash) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (token_hash, user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_link_invite_uses_user ON user_link_invite_uses (user_id);
-- Einmalige Uebernahme der bereits eingeloesten Einladungen.
INSERT INTO user_link_invite_uses (token_hash, user_id, accepted_at)
SELECT token_hash, accepted_by, COALESCE(accepted_at, created_at)
  FROM user_link_invites WHERE accepted_by IS NOT NULL
ON CONFLICT DO NOTHING;

-- Wer hat wen geworben? Wird bei der Registrierung gesetzt, wenn ein
-- Einladungs- oder Teilen-Link im Spiel war. Reine Auswertung -- die
-- Verknuepfung der Listen haengt NICHT daran (die steht in user_links).
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_invited_by ON users (invited_by_user_id);

-- Hinweis fuer die einladende Seite: "X hat deine Einladung angenommen", beim
-- naechsten Oeffnen der App. Steht auf der Zeile der einladenden Person, wird
-- dort gesetzt und nach dem Anzeigen wieder geleert.
ALTER TABLE user_links ADD COLUMN IF NOT EXISTS hinweis_offen BOOLEAN NOT NULL DEFAULT false;

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

-- Bester Trailer je Titel (Quelle: TMDB /videos). Wie watch_providers_cache
-- bewusst erst beim ersten Oeffnen gefuellt statt fuer den ganzen Katalog
-- vorab -- das waere ein Request je Titel.
--
-- video_key ist die YouTube-ID. NULL bedeutet "gesucht, aber nichts Brauchbares
-- gefunden"; die App oeffnet dann ersatzweise eine YouTube-Suche nach
-- "Titel + Trailer". Damit wird nicht bei jedem Oeffnen erneut erfolglos
-- angefragt.
CREATE TABLE IF NOT EXISTS title_videos_cache (
  tmdb_id    INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('movie', 'series')),
  video_key  TEXT,
  video_name TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tmdb_id, type)
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

-- Anzahl der Stimmen hinter der Bewertung ("8,3 (28.300)"). Ohne sie steht eine
-- glatte 8,0 aus EINER Stimme gleichberechtigt neben einer 8,3 aus 28.000 --
-- die Zahl macht erst einschaetzbar, wie belastbar die Bewertung ist.
-- Quelle ist wie die Bewertung selbst TMDB (vote_count), nicht IMDb.
ALTER TABLE titles          ADD COLUMN IF NOT EXISTS vote_count INTEGER;
ALTER TABLE streaming_cache ADD COLUMN IF NOT EXISTS vote_count INTEGER;
ALTER TABLE cinema_cache    ADD COLUMN IF NOT EXISTS vote_count INTEGER;

-- Deutsche Altersfreigabe (FSK): '0', '6', '12', '16', '18' -- NULL, wenn TMDB
-- keine deutsche Angabe kennt. Das ist bei rund einem Drittel der Titel der
-- Fall, weshalb der Filter solche Titel bewusst ausblendet statt sie
-- durchzulassen (siehe Frontend, fskErlaubt).
--
-- Quelle je nach Art unterschiedlich: bei Filmen release_dates (DE-Eintrag,
-- erster nicht leerer certification-Wert), bei Serien content_ratings (rating).
ALTER TABLE titles          ADD COLUMN IF NOT EXISTS certification TEXT;
ALTER TABLE streaming_cache ADD COLUMN IF NOT EXISTS certification TEXT;
ALTER TABLE cinema_cache    ADD COLUMN IF NOT EXISTS certification TEXT;

-- Breitbild-Motiv (TMDB backdrop_path) fuer die Link-Vorschau beim Teilen.
-- Poster sind hochkant und erscheinen in WhatsApp/iMessage nur als kleines,
-- quadratisch beschnittenes Bildchen -- die Vorschaukarte lebt vom Querformat.
-- Wird nicht im Voraus fuer alle ~27.000 Titel geholt, sondern beim ersten
-- Teilen eines Titels nachgeladen und dann dauerhaft gespeichert (siehe
-- backend/routes/share.js). Neue Zeilen bekommen es ueber die taeglichen Jobs.
ALTER TABLE titles          ADD COLUMN IF NOT EXISTS backdrop_path TEXT;
ALTER TABLE cinema_cache    ADD COLUMN IF NOT EXISTS backdrop_path TEXT;

-- Zeitpunkt, zu dem die Loeschung des Kontos beantragt wurde. NULL = kein
-- Antrag. Das Konto bleibt danach 14 Tage vollstaendig erhalten und laesst sich
-- durch erneutes Anmelden widerrufen; erst danach raeumt der Aufraeumlauf im
-- Backend endgueltig ab (siehe backend/lib/kontoAufraeumen.js).
ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

-- Anonyme Bewertungs-Summe je Titel. Wird beim Loeschen eines Kontos gefuellt:
-- Die Sterne-Bewertungen dieser Person werden hier aufaddiert, bevor ihre
-- user_progress-Zeilen verschwinden. Bewusst NUR Anzahl und Summe je Titel --
-- keine Zeitstempel, keine Kennung, kein Bezug zwischen den Zeilen. Damit
-- laesst sich nichts einer Person zuordnen, auch nicht durch Gruppieren.
--
-- Auswertung: Der Gesamtschnitt eines Titels ergibt sich aus dieser Tabelle
-- PLUS den Bewertungen der noch bestehenden Konten in user_progress.
CREATE TABLE IF NOT EXISTS title_rating_stats (
  title_id     BIGINT PRIMARY KEY REFERENCES titles(id) ON DELETE CASCADE,
  anzahl       INTEGER NOT NULL DEFAULT 0,
  summe_sterne INTEGER NOT NULL DEFAULT 0
);

-- Dieselben Bewertungen geloeschter Konten, aber nach Sterne-Stufe getrennt.
-- Noetig, weil die Datenschutzerklaerung (Abschnitt 9) die VERTEILUNG auf die
-- Stufen zusagt ("1.240 Bewertungen, davon 200 mit zehn Sternen") --
-- title_rating_stats kennt nur Anzahl und Summe, daraus laesst sich keine
-- Verteilung zurueckrechnen. Ohne diese Tabelle fehlten die Bewertungen
-- geloeschter Konten in der Verteilung still.
--
-- Auch hier bewusst KEINE Kennung und KEIN Zeitstempel: eine Zeile sagt nur
-- "Titel X hat n Bewertungen mit s Sternen", nicht von wem.
CREATE TABLE IF NOT EXISTS title_rating_stufen (
  title_id BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  sterne   SMALLINT NOT NULL CHECK (sterne BETWEEN 1 AND 10),
  anzahl   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (title_id, sterne)
);

-- Von connect-pg-simple genutzte Session-Tabelle (Standard-Schema des Pakets).
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- Deutsch-Englisch-Paarung der TMDB-Genres. Wird beim Streaming-Import
-- mitgeliefert (siehe stream-fetch.mjs): TMDB gibt dieselbe Genre-Liste je nach
-- Sprachparameter einmal deutsch und einmal englisch aus, verbunden ueber die
-- Genre-ID. Damit kennt die App die englischen Namen, ohne dass jemand sie von
-- Hand pflegen muss -- und sie bleibt richtig, wenn TMDB umbenennt oder ein
-- Genre ergaenzt.
--
-- Hintergrund: Wer "Comedy" suchte, landete auf einer Handvoll Titel, die den
-- englischen Begriff zufaellig als Schlagwort trugen. Das gemeinte "Komödie"
-- (13.162 Titel) fand er nicht.
CREATE TABLE IF NOT EXISTS genre_alias (
  tmdb_genre_id INTEGER NOT NULL,
  art           TEXT    NOT NULL,   -- 'movie' | 'tv'
  name_de       TEXT    NOT NULL,
  name_en       TEXT    NOT NULL,
  PRIMARY KEY (tmdb_genre_id, art)
);

-- ---------------------------------------------------------------------------
-- "Deine Kinos" (siehe PLAN-KINOS.md)
--
-- Drei Tabellen, alle drei unabhaengig davon, woher spaeter einmal die Angabe
-- kommt, WELCHE Filme in einem Kino laufen. Genau das ist der Punkt: Auswahl
-- und Umkreissuche stehen fuer sich, die Spielplan-Quelle kommt daneben.
-- ---------------------------------------------------------------------------

-- Kinos mit Koordinate. Gefuellt aus OpenStreetMap (amenity=cinema) ueber
-- backend/scripts/import-kinos.mjs. `quelle`/`quelle_id` bleiben stehen, damit
-- ein zweiter Bestand (etwa von einem Spielplan-Anbieter) danebengelegt werden
-- kann, ohne die Auswahl der Leute zu verlieren.
CREATE TABLE IF NOT EXISTS kinos (
  id         BIGSERIAL PRIMARY KEY,
  quelle     TEXT NOT NULL,
  quelle_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  strasse    TEXT,
  plz        TEXT,
  ort        TEXT,
  lat        DOUBLE PRECISION NOT NULL,
  lon        DOUBLE PRECISION NOT NULL,
  website    TEXT,
  gesehen_am DATE NOT NULL DEFAULT CURRENT_DATE,  -- letzter Import, der es fand
  UNIQUE (quelle, quelle_id)
);
-- Die Umkreissuche grenzt zuerst ueber ein Rechteck ein und rechnet danach
-- genau -- fuer Entfernungen bis 100 km reicht das ohne PostGIS.
CREATE INDEX IF NOT EXISTS idx_kinos_lat_lon ON kinos (lat, lon);

-- Die Auswahl einer Person. Gehoert ans Konto, nicht ins Geraet: Die Favoriten
-- in der Personenliste liegen nur lokal und gelten deshalb je Geraet -- genau
-- das soll sich hier nicht wiederholen.
CREATE TABLE IF NOT EXISTS user_kinos (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kino_id BIGINT NOT NULL REFERENCES kinos(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, kino_id)
);

-- Postleitzahlen mit Koordinate, einmalig aus dem GeoNames-Abzug (CC-BY 4.0,
-- siehe backend/scripts/import-plz.mjs). Damit braucht die Vervollstaendigung
-- im Betrieb keinen fremden Dienst, und die Umkreissuche hat den Mittelpunkt
-- sofort.
CREATE TABLE IF NOT EXISTS plz (
  id   BIGSERIAL PRIMARY KEY,
  plz  TEXT NOT NULL,
  ort  TEXT NOT NULL,
  land TEXT,
  lat  DOUBLE PRECISION NOT NULL,
  lon  DOUBLE PRECISION NOT NULL,
  UNIQUE (plz, ort)
);
CREATE INDEX IF NOT EXISTS idx_plz_plz ON plz (plz text_pattern_ops);
-- Ortssuche unabhaengig von Gross-/Kleinschreibung, nach Wortanfang.
CREATE INDEX IF NOT EXISTS idx_plz_ort ON plz (lower(ort) text_pattern_ops);

-- ---------------------------------------------------------------------------
-- Rueckmeldungen aus dem Feedback-Formular
--
-- Bis zum oeffentlichen Test ging Feedback ausschliesslich per Mail raus.
-- Schlug der Versand fehl, war die Nachricht weg -- beim Test von Fremden ist
-- sie aber genau das Ergebnis, das man haben will. Deshalb steht sie jetzt
-- zuerst hier und geht erst danach als Mail hinaus.
--
-- `email` ist eine Kopie zum Zeitpunkt des Absendens, kein Verweis: Loescht
-- jemand spaeter sein Konto, soll die Rueckmeldung nicht ins Leere zeigen.
-- Aus demselben Grund SET NULL statt CASCADE -- eine Kontoloeschung darf die
-- Rueckmeldung nicht mitreissen. Sie gehoert zum Betrieb, nicht zum Konto;
-- der Bezug zur Person faellt weg, der Text bleibt.
--
-- Auslesen ueber `npm run feedback` (backend/scripts/feedback-lesen.mjs),
-- bewusst ohne HTTP-Route -- dieselbe Ueberlegung wie bei der
-- Bewertungsstatistik. Aufbewahrung: 12 Monate (Datenschutzerklaerung
-- Abschnitt 10), abgeraeumt vom taeglichen Aufraeumlauf.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
  id          BIGSERIAL PRIMARY KEY,
  nachricht   TEXT   NOT NULL,
  user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  email       TEXT,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Gelesen wird immer das Neueste zuerst, und der Aufraeumlauf sucht das
-- Aelteste -- beides bedient derselbe Index.
CREATE INDEX IF NOT EXISTS idx_feedback_erstellt_am ON feedback (erstellt_am DESC);

-- ---------------------------------------------------------------------------
-- Internationalisierung (EU) -- siehe PLAN-INTERNATIONALISIERUNG.md
--
-- Drei Bausteine:
--   1. Englische Inhaltsdaten (Weg A): title_en/overview_en neben den
--      deutschen Feldern. Gefuellt von den Fetch-Skripten (TMDB liefert die
--      Uebersetzungen im selben Detailaufruf mit, append_to_response=
--      translations) und fuer den Bestand von backfill-english.mjs.
--   2. Altersfreigaben je Land als JSONB ({"DE":"12","AT":"14"}) -- die
--      bisherige Spalte certification bleibt als DE-Wert und Rueckfall
--      bestehen, damit nichts Bestehendes bricht.
--   3. Region-Dimension in streaming_cache und cinema_cache: die
--      Verfuegbarkeit ist je Land verschieden, der Ingest laeuft je Region
--      einmal (TMDB_REGION je Lauf) und schreibt seine Region mit.
-- ---------------------------------------------------------------------------

-- 1. Englische Inhaltsdaten
ALTER TABLE titles          ADD COLUMN IF NOT EXISTS title_en    TEXT;
ALTER TABLE titles          ADD COLUMN IF NOT EXISTS overview_en TEXT;
ALTER TABLE streaming_cache ADD COLUMN IF NOT EXISTS title_en    TEXT;
ALTER TABLE streaming_cache ADD COLUMN IF NOT EXISTS overview_en TEXT;
ALTER TABLE cinema_cache    ADD COLUMN IF NOT EXISTS title_en    TEXT;
ALTER TABLE cinema_cache    ADD COLUMN IF NOT EXISTS overview_en TEXT;

-- 2. Altersfreigaben je Land. Einmalige Uebernahme des vorhandenen DE-Werts,
--    damit der Filter fuer Bestandsdaten sofort funktioniert.
ALTER TABLE titles          ADD COLUMN IF NOT EXISTS certifications JSONB NOT NULL DEFAULT '{}';
ALTER TABLE streaming_cache ADD COLUMN IF NOT EXISTS certifications JSONB NOT NULL DEFAULT '{}';
ALTER TABLE cinema_cache    ADD COLUMN IF NOT EXISTS certifications JSONB NOT NULL DEFAULT '{}';
UPDATE titles          SET certifications = jsonb_build_object('DE', certification)
  WHERE certification IS NOT NULL AND certification <> '' AND NOT certifications ? 'DE';
UPDATE streaming_cache SET certifications = jsonb_build_object('DE', certification)
  WHERE certification IS NOT NULL AND certification <> '' AND NOT certifications ? 'DE';
UPDATE cinema_cache    SET certifications = jsonb_build_object('DE', certification)
  WHERE certification IS NOT NULL AND certification <> '' AND NOT certifications ? 'DE';

-- 3a. Region-Dimension in streaming_cache: Bestandszeilen sind DE. Der
--     Primaerschluessel waechst von (provider_id, type, tmdb_id) auf
--     (provider_id, type, tmdb_id, region) -- erkannt am fehlenden "region"
--     in der bestehenden Definition, laeuft also nur einmal.
ALTER TABLE streaming_cache ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'DE';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'streaming_cache'::regclass AND contype = 'p'
       AND pg_get_constraintdef(oid) NOT LIKE '%region%'
  ) THEN
    ALTER TABLE streaming_cache DROP CONSTRAINT streaming_cache_pkey;
    ALTER TABLE streaming_cache ADD PRIMARY KEY (provider_id, type, tmdb_id, region);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_streaming_cache_region ON streaming_cache (region);

-- 3b. Region-Dimension in cinema_cache: analog, PK von (tmdb_id) auf
--     (tmdb_id, region).
ALTER TABLE cinema_cache ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'DE';
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'cinema_cache'::regclass AND contype = 'p'
       AND pg_get_constraintdef(oid) NOT LIKE '%region%'
  ) THEN
    ALTER TABLE cinema_cache DROP CONSTRAINT cinema_cache_pkey;
    ALTER TABLE cinema_cache ADD PRIMARY KEY (tmdb_id, region);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_cinema_cache_region ON cinema_cache (region);

-- Sprache und Region am Konto: geraeteuebergreifend, gesetzt ueber
-- PUT /api/auth/settings. NULL = noch nie gewaehlt, dann entscheidet das
-- Geraet (localStorage bzw. Browsersprache).
ALTER TABLE users ADD COLUMN IF NOT EXISTS sprache TEXT CHECK (sprache IS NULL OR sprache IN ('de', 'en'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS region  TEXT CHECK (region IS NULL OR region ~ '^[A-Z]{2}$');

-- ---------------------------------------------------------------------------
-- Benachrichtigungen: Opt-in am Konto (Einstellungen), taeglicher
-- Sammelversand per E-Mail (lib/benachrichtigung.js) -- "ein Titel deiner
-- Watchlist ist jetzt bei deinen Streaming-Anbietern" bzw. "laeuft im Kino
-- an". `benachrichtigt` merkt Verschicktes je Person/Titel/Art, damit
-- derselbe Treffer nie zweimal kommt.
ALTER TABLE users ADD COLUMN IF NOT EXISTS benachrichtigung BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS benachrichtigt (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id    BIGINT NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  art         TEXT   NOT NULL CHECK (art IN ('stream', 'kino')),
  gesendet_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, title_id, art)
);

-- Inhaltssprachen ueber Englisch hinaus (Weg A, zweite Stufe): Titel und
-- Inhaltsangabe je Sprache als JSONB {"fr":{"t":"...","ov":"..."},...} --
-- gefuellt von den Fetch-Skripten (append_to_response=translations liefert
-- alle Sprachen ohnehin mit) und backfill-english.mjs. Englisch bleibt in
-- den bestehenden Spalten title_en/overview_en (Rueckfallkette: Wunschsprache
-- -> Englisch -> Deutsch, siehe lib/i18n.js sprachFeld).
ALTER TABLE titles          ADD COLUMN IF NOT EXISTS uebersetzungen JSONB NOT NULL DEFAULT '{}';
ALTER TABLE streaming_cache ADD COLUMN IF NOT EXISTS uebersetzungen JSONB NOT NULL DEFAULT '{}';
ALTER TABLE cinema_cache    ADD COLUMN IF NOT EXISTS uebersetzungen JSONB NOT NULL DEFAULT '{}';

-- Movie Night: Abstimmungsrunden (siehe routes/movieNight.js). Eine Person
-- startet eine Runde aus ihrer aktuellen Liste (bis 30 Kandidaten), teilt
-- den Link, alle stimmen je Titel mit Ja/Nein ab. Runden verfallen nach
-- 48 Stunden (Aufraeumen im Route-Modul beim Anlegen neuer Runden).
CREATE TABLE IF NOT EXISTS movie_night_runden (
  id          BIGSERIAL PRIMARY KEY,
  token       TEXT UNIQUE NOT NULL,
  ersteller_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  titel_ids   BIGINT[] NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS movie_night_stimmen (
  runde_id   BIGINT NOT NULL REFERENCES movie_night_runden(id) ON DELETE CASCADE,
  teilnehmer TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  title_id   BIGINT NOT NULL,
  stimme     BOOLEAN NOT NULL,
  abgegeben_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (runde_id, teilnehmer, title_id)
);

-- Wann wurden die TMDB-Details dieser Zeile (Besetzung, Regie, Freigaben,
-- Uebersetzungen) zuletzt WIRKLICH von TMDB geholt? fetched_at taugt dafuer
-- nicht: Auch magere Laeufe (nur Verfuegbarkeit, siehe Skip-Liste in
-- stream-fetch.mjs und GET /api/streaming/enriched) erneuern fetched_at,
-- lassen die Anreicherung aber unangetastet. NULL = noch nie angereichert
-- (magere Neu-Zeile; wird beim Ingest aus Geschwisterzeilen anderer Regionen
-- befuellt, siehe routes/streaming.js). Beim erstmaligen Anlegen der Spalte
-- erben Bestandszeilen fetched_at -- bis dahin war jeder Lauf ein Voll-Lauf.
-- Der DO-Block erkennt das an der fehlenden Spalte, laeuft also nur einmal.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'streaming_cache' AND column_name = 'enriched_at'
  ) THEN
    ALTER TABLE streaming_cache ADD COLUMN enriched_at TIMESTAMPTZ;
    UPDATE streaming_cache SET enriched_at = fetched_at;
  END IF;
END $$;
