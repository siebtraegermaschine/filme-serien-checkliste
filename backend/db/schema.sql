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
-- Mit Ablaufdatum, weil ein weitergeleiteter Link sonst dauerhaft Zugriff auf
-- die eigene Titelliste eroeffnen wuerde. Einmalig einloesbar waren sie nur bis
-- zum 13. August 2026 (accepted_by); seitdem zaehlt user_link_invite_uses die
-- Einloesungen, siehe unten.
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

-- Verknuepfungs-Anfragen (19. August 2026). Sie gehoeren zum Knopf
-- "Mit X verknuepfen" in der Kopfzeile einer geteilten Ansicht (?titel=TOKEN).
--
-- Warum eine Anfrage und nicht gleich eine Verknuepfung: Bei einem
-- Einladungslink hat die teilende Person vorher ausdruecklich zugestimmt (der
-- Text vor dem Erstellen sagt, was sichtbar wird). Beim Ansicht-Link hat sie
-- das NICHT -- sie wollte eine Liste zeigen, nicht ihre ganze Watchlist samt
-- Bewertungen oeffnen. Ein Klick der Gegenseite darf das deshalb nicht allein
-- ausloesen; die Verknuepfung entsteht erst mit dem Annehmen (routes/links.js).
--
-- Eine Zeile je Richtung. Liegt die Gegenanfrage schon vor, sind beide
-- Zustimmungen da und die Verknuepfung entsteht sofort.
CREATE TABLE IF NOT EXISTS user_link_anfragen (
  von_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  an_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (von_id, an_id),
  CHECK (von_id <> an_id)
);
CREATE INDEX IF NOT EXISTS idx_user_link_anfragen_an ON user_link_anfragen (an_id);

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

-- Zustand eines mehrteiligen Streaming-Imports (seit 20.08.2026).
--
-- Der Ingest bekam eine ganze Region in EINEM Request. Der spanische Lauf kam
-- am 19.08.2026 auf 64 MB und lief gegen das 60-MB-Limit von express.json --
-- PayloadTooLargeError, drei Stunden Arbeit verworfen, ES blieb zwei Tage alt.
-- Gemessen an den echten Daten sind es im Rumpffall (alle Titel uebersprungen)
-- 25,7 MB fuer ES und 30,6 MB fuer US, mit vollen Details 64,0 bzw. 74,8 MB.
-- Das Limit einfach anzuheben schied aus: Die Maschine hat 1,9 GB RAM, und
-- express.json puffert erst den Rohtext und baut daraus ein Objektgeflecht von
-- mehrfacher Groesse.
--
-- Seither schickt stream-fetch.mjs die Region in Stapeln (wie
-- /api/titles/bulk-ingest es laengst tut). Diese Tabelle haelt zusammen, was
-- ueber die Stapel hinweg gleich bleiben muss:
--
--   started_at        Startzeit des LAUFS, nicht des Stapels. Der Aufraeum-
--                     DELETE am Ende loescht daran, was der Lauf nicht
--                     angefasst hat. Server-seitig per clock_timestamp()
--                     gebildet -- siehe den Kommentar in routes/streaming.js,
--                     warum now() hier schon einmal den Bestand geloescht hat.
--   bekannte_anbieter Anbieter, die die Region VOR dem Lauf kannte. Nur damit
--                     bleibt die Rueckdatierung von first_seen_at richtig:
--                     Ohne diese Liste haette Stapel 2 die von Stapel 1 neu
--                     eingefuegten Anbieter als "bekannt" gesehen und deren
--                     Titel faelschlich als Neuzugang gemeldet.
--   geliefert         Titel des Laufs, ueber alle Stapel summiert. Die
--                     Plausibilitaetspruefung (mindestens 70 Prozent des
--                     Bestands) kann erst am Ende urteilen, nicht je Stapel.
CREATE TABLE IF NOT EXISTS streaming_ingest_run (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region            TEXT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL,
  bekannte_anbieter TEXT[] NOT NULL DEFAULT '{}',
  geliefert         INTEGER NOT NULL DEFAULT 0,
  angelegt_am       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Abgebrochene Laeufe (Netzwerkfehler, Timeout) hinterlassen sonst Zeilen. Der
-- Ingest raeumt beim Anlegen eines neuen Laufs alles Aeltere weg; der Index
-- macht das billig.
CREATE INDEX IF NOT EXISTS idx_streaming_ingest_run_alter ON streaming_ingest_run (angelegt_am);

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

-- TMDB-Anbieternummer je Feed-Zeile. provider_id ist und bleibt der Slug
-- ('netflix', 'amazon', ...) -- daran haengen die oeffentlichen SEO-Seiten
-- /<locale>/streaming/<slug> und die Eintraege in seo_content. Die Auswahl in
-- der App arbeitet dagegen mit TMDB-Nummern (users.watch_provider_ids), und
-- die sind je Land verschieden (Amazon Prime Video ist 9 in DE, aber 119 in
-- BR/PL). Frueher lag diese Zuordnung als feste Vierer-Tabelle im Frontend
-- (STREAM_FEED_TMDB_IDS) und in wochenendmail.js; mit einem je Region
-- dynamisch bestimmten Anbieterumfang traegt sie jetzt die Zeile selbst.
-- Bestandszeilen bleiben NULL, bis der naechste Import-Lauf sie ueberschreibt.
ALTER TABLE streaming_cache ADD COLUMN IF NOT EXISTS tmdb_provider_id INTEGER;

-- Einmalige Uebernahme fuer den Bestand der vier Anbieter der ersten
-- Ausbaustufe, damit Anbieter-Schildchen, Filter und Wochenend-Mail nicht bis
-- zum ersten neuen Import-Lauf jeder Region blind sind. Netflix/Disney+/Apple
-- TV+ tragen weltweit dieselbe Nummer; Amazon Prime Video laeuft nur in
-- DE, AT, GB und US unter 9 und ueberall sonst unter 119 (am 16. August 2026
-- fuer alle 41 Regionen bei TMDB nachgesehen). Durch `tmdb_provider_id IS
-- NULL` laeuft dieses UPDATE genau einmal.
UPDATE streaming_cache SET tmdb_provider_id = CASE provider_id
    WHEN 'netflix' THEN 8
    WHEN 'disney'  THEN 337
    WHEN 'apple'   THEN 350
    WHEN 'amazon'  THEN CASE WHEN region IN ('DE','AT','GB','US') THEN 9 ELSE 119 END
  END
 WHERE tmdb_provider_id IS NULL
   AND provider_id IN ('netflix', 'disney', 'apple', 'amazon');

-- Zugriff ueber (type, tmdb_id) -- also "wo laeuft dieser Titel ueberall?".
-- Der Primaerschluessel beginnt mit provider_id und hilft dafuer nicht. Drei
-- Stellen brauchen genau diesen Weg: der Ingest, wenn er die Anreicherung
-- einer neu aufgetauchten Zeile aus einer Geschwisterzeile kopiert, sowie die
-- Benachrichtigungs- und die Wochenend-Mail, die Watchlist-Titel gegen den
-- Streaming-Bestand halten. Ohne den Index lief das auf einen Sortierlauf
-- ueber die ganze Tabelle hinaus (Stand 16. August 2026: 745.000 Zeilen, mit
-- dem Anbieterausbau ueber eine Million).
CREATE INDEX IF NOT EXISTS idx_streaming_cache_titel ON streaming_cache (type, tmdb_id);

-- Anonyme Trichter-Zaehler (IDEEN-WACHSTUM.md, Abschnitt 3): je Tag und
-- Schritt EINE Zahl. Bewusst keine Kennungen, keine IP-Adressen, keine
-- Zeitstempel unterhalb des Tages -- aus diesen Zeilen laesst sich keine
-- Person rekonstruieren. Geschrieben von lib/metrik.js, gelesen nur von
-- npm run metrik (keine Lese-Route, wie bei der Bewertungsstatistik).
CREATE TABLE IF NOT EXISTS metrik_tage (
  tag     DATE NOT NULL,
  schritt TEXT NOT NULL,
  anzahl  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (tag, schritt)
);
-- Merker je Konto: Der Trichter-Schritt "zehn Titel erreicht" soll genau
-- einmal zaehlen, auch wenn jemand Markierungen entfernt und neu setzt.
ALTER TABLE users ADD COLUMN IF NOT EXISTS metrik_zehn BOOLEAN NOT NULL DEFAULT FALSE;

-- Wochenend-Mail "Drei fuer dein Wochenende" (lib/wochenendmail.js): eigene
-- Art-Werte im Wiederholungs-Schutz, damit sich Wochenend-Empfehlungen und
-- Verfuegbarkeits-Benachrichtigungen nicht gegenseitig unterdruecken. Der
-- DO-Block ersetzt den urspruenglichen CHECK genau einmal (erkennbar am
-- neuen Constraint-Namen).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'benachrichtigt_art_check_v2') THEN
    ALTER TABLE benachrichtigt DROP CONSTRAINT IF EXISTS benachrichtigt_art_check;
    ALTER TABLE benachrichtigt ADD CONSTRAINT benachrichtigt_art_check_v2
      CHECK (art IN ('stream', 'kino', 'we-stream', 'we-kino', 'we-tipp'));
  END IF;
END $$;

-- "Diese Ansicht teilen" -- Momentaufnahmen (14. August 2026, ersetzt im
-- Teilen-Blatt den Ansicht-Link): eine feste Liste von Titel-Kennungen in
-- Anzeige-Reihenfolge, geteilt per Token-Link (?titel=TOKEN). BEWUSST ohne
-- Zeitverfall (Entscheidung vom 14. August): Ein einmal geteilter Link soll
-- nicht faulen; er stirbt nur mit dem Konto (CASCADE). Kein Widerruf --
-- eine Widerrufsliste waere spaeter zusammen mit "Einladungen zurueckziehen"
-- nachruestbar, die Tabelle gibt das her. Erstellen nur angemeldet und
-- hoechstens MOMENT_MAX_JE_KONTO je Konto (siehe routes/share.js).
CREATE TABLE IF NOT EXISTS titel_momentaufnahmen (
  token      TEXT PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_ids  BIGINT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_momentaufnahmen_user ON titel_momentaufnahmen (user_id);

-- ============================================================================
-- KPI-Erfassung (siehe docs/kpi.md). Feldnamen und Definitionen sind durch das
-- externe KPI-Cockpit vorgegeben und duerfen nicht umbenannt werden.
-- ============================================================================

-- Append-only Ereignistabelle. Es schreibt AUSSCHLIESSLICH lib/track.js --
-- kein direktes INSERT an anderer Stelle, damit Namens- und props-Disziplin
-- an genau einem Ort durchgesetzt wird.
--
-- DSGVO: keine Klarnamen, keine E-Mail-Adressen, keine IP-Adressen, kein
-- Freitext aus Nutzereingaben in props. anon_id ist ein zufaelliger
-- Geraetewert (Cookie mt_anon) ohne Personenbezug; user_id die interne
-- Kontonummer als Text.
CREATE TABLE IF NOT EXISTS analytics_events (
  id         BIGSERIAL PRIMARY KEY,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(), -- Serverzeit, nie Clientzeit
  name       TEXT NOT NULL,
  user_id    TEXT,                               -- NULL bei Gaesten
  anon_id    TEXT NOT NULL,                      -- Cookie-/Geraete-ID, immer gesetzt
  group_id   TEXT,                               -- Gruppen existieren (noch) nicht -- bleibt NULL
  session_id TEXT,                               -- Match-Session (Movie-Night-Runde), nicht Web-Session
  props      JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_ts ON analytics_events (name, ts);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_ts ON analytics_events (user_id, ts);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_group_ts ON analytics_events (group_id, ts);

-- Woechentliche Snapshots (lib/kpi.js, buildSnapshot). Nie ueberschrieben,
-- sondern versioniert -- deshalb (week_start, version) als Schluessel statt
-- week_start allein: ein erneuter Lauf legt eine neue Version daneben, die
-- alte bleibt nachlesbar.
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  week_start DATE NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  payload    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, version)
);

-- Bezahlter Media-Spend je Woche (Montag als week), von Hand gepflegt.
-- Grundlage fuer cac -- ohne Zeile fuer die Woche liefert cac NULL.
CREATE TABLE IF NOT EXISTS marketing_spend (
  week       DATE PRIMARY KEY,
  amount_eur NUMERIC(12,2) NOT NULL
);

-- B2B-Geschaefte, von Hand gepflegt. pipeline = Summe 'offen',
-- arr = Summe 'gewonnen' (siehe buildSnapshot).
CREATE TABLE IF NOT EXISTS b2b_deals (
  id         BIGSERIAL PRIMARY KEY,
  status     TEXT NOT NULL CHECK (status IN ('offen', 'gewonnen', 'verloren')),
  value_eur  NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- SEO-Seiten (siehe PLAN-SEO.md, Plan "SEO-Seiten: technische Umsetzung").
-- Eigenstaendige, von der App getrennte Seiten unter /<locale>/... .
-- ============================================================================

-- Eigener, ausfuehrlicher Redaktionstext je Seite -- NICHT von TMDB
-- abgeleitet (Dubletten-Risiko), sondern eigens verfasst. schluessel ist je
-- bereich unterschiedlich aufgebaut: 'movie:<tmdb_id>'/'series:<tmdb_id>'
-- fuer Titel, ein Genre-Slug fuer 'genre', provider_id fuer 'anbieter',
-- 'jahr:<jahr>'/'genre:<slug>' fuer 'bestenliste', ein Stadt-Slug fuer
-- 'kino_stadt'. Ohne passende Zeile bleibt eine Seite ausgeliefert, aber
-- nicht indexierbar (siehe seoData.js) -- das haelt unfertige Seiten mit
-- TMDB-Rohtext automatisch aus dem Sitemap-/Crawler-Pfad heraus.
-- Name (aus titles.director/cast_names, reiner Text ohne ID) -> TMDB-
-- Personen-ID. Wie title_tmdb_resolution: NULL bedeutet "gesucht, nichts
-- gefunden", damit eine erfolglose Suche sich nicht bei jedem Aufruf
-- wiederholt. Namensgleichheit ist eine Heuristik (siehe PLAN-SEO.md 0. --
-- Kollisionsrisiko bei haeufigen Namen), deshalb bewusst NICHT die einzige
-- Kennung fuer eine Person-Seite -- die URL traegt zusaetzlich die TMDB-ID.
CREATE TABLE IF NOT EXISTS personen_resolution (
  name           TEXT PRIMARY KEY,
  tmdb_person_id INTEGER,
  resolved_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Biografie/Foto je TMDB-Personen-ID. Wie watch_providers_cache/
-- title_videos_cache erst beim ersten Seitenaufruf gefuellt statt fuer den
-- ganzen Katalog vorab. biografie ist TMDBs eigener redaktioneller Text
-- (haeufig aus Wikipedia) -- bewusst UNVERAENDERT uebernommen statt neu
-- verfasst: anders als bei Titeltexten (siehe seo_content) waere ein
-- erfundener Lebenslauf einer echten Person ein Falschbehauptungs-Risiko,
-- waehrend Duplicate Content hier das kleinere Problem ist.
-- Zusatzdaten fuer die SEO-Titeldetailseite, die titles/streaming_cache
-- nicht fuehren: Laufzeit, genaues Erscheinungsdatum, Budget/Einspiel-
-- ergebnis, Besetzung MIT Rollennamen (cast_names ist nur eine Namensliste),
-- Bildergalerie. Wie personen_cache/title_videos_cache erst beim ersten
-- Seitenaufruf gefuellt statt fuer den ganzen Katalog vorab (siehe
-- backend/lib/titeldetails.js). Alle Felder aus TMDBs eigenen, oeffentlichen
-- Endpunkten -- keine selbst verfassten oder recherchierten Angaben.
CREATE TABLE IF NOT EXISTS titel_details_cache (
  tmdb_id           INTEGER NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('movie', 'series')),
  laufzeit_minuten  INTEGER,
  erscheinungsdatum DATE,
  budget            BIGINT,
  einspielergebnis  BIGINT,
  besetzung_rollen  JSONB NOT NULL DEFAULT '[]',
  bilder            JSONB NOT NULL DEFAULT '[]',
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tmdb_id, type)
);

CREATE TABLE IF NOT EXISTS personen_cache (
  tmdb_person_id INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  biografie      TEXT,
  foto_pfad      TEXT,
  geburtstag     DATE,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seo_content (
  id              BIGSERIAL PRIMARY KEY,
  bereich         TEXT NOT NULL CHECK (bereich IN ('titel', 'genre', 'anbieter', 'bestenliste', 'kino_stadt', 'hub')),
  schluessel      TEXT NOT NULL,
  locale          TEXT NOT NULL DEFAULT 'de-de',
  text            TEXT NOT NULL,
  erstellt_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bereich, schluessel, locale)
);

-- ============================================================================
-- Onboarding (siehe PLAN-ONBOARDING.md)
--
-- Der Prozess nach der ersten Anmeldung: Titel bewerten, Schauverhalten,
-- Lieblings-Genres, Streaminganbieter, Kinos. Bewusst ZWEI getrennte Ablagen:
--
--   user_onboarding      -- personenbezogen, verschwindet mit dem Konto
--   onboarding_aggregat  -- reine Zaehler ohne Personenbezug, bleiben
--
-- Anbieter und Kinos stehen NICHT in user_onboarding: sie liegen weiterhin in
-- users.watch_provider_ids und user_kinos. Zwei Speicherorte fuer dieselbe
-- Angabe waeren zwei Wahrheiten, die auseinanderlaufen, sobald jemand die
-- Einstellungen aendert.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id          BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Schritt 2: Mehrfachauswahl aus SCHAUVERHALTEN (lib/onboarding.js).
  schauverhalten   TEXT[] NOT NULL DEFAULT '{}',
  -- Schritt 3: Genre-Namen in der Datenbankfassung ("Science Fiction") bzw.
  -- Themen-Schlagwoerter mit Praefix ("thema:TrueCrime").
  genres           TEXT[] NOT NULL DEFAULT '{}',
  -- Zuletzt ABGESCHLOSSENER Schritt (0 = noch keiner). Daran haengt zweierlei:
  -- wo die Wiederaufnahme ansetzt, und ob ein Schritt schon im Aggregat
  -- gezaehlt wurde (gezaehlt wird nur beim ersten Erreichen -- wer ueber den
  -- Zurueck-Pfeil noch einmal antwortet, soll die Statistik nicht verdoppeln).
  schritt          SMALLINT NOT NULL DEFAULT 0,
  -- Wie oft das Fenster per X geschlossen wurde. Ab ANLAEUFE_MAX kommt es
  -- nicht mehr von selbst -- wer dreimal weggeklickt hat, will nicht.
  anlaeufe         SMALLINT NOT NULL DEFAULT 0,
  begonnen_am      TIMESTAMPTZ NOT NULL DEFAULT now(),
  abgeschlossen_am TIMESTAMPTZ
);

-- Anonyme Zusammenfassung, die eine Kontoloeschung ueberdauert.
--
-- KEINE user_id, kein Zeitstempel feiner als der Monat, keine Zeile, die eine
-- Person beschreibt -- nur Summen je Antwortmoeglichkeit. Solche Aggregate sind
-- nach Erwaegungsgrund 26 DSGVO keine personenbezogenen Daten mehr; genau
-- deshalb duerfen sie bleiben (dieselbe Ueberlegung wie bei
-- title_rating_stats, siehe datenschutz.html Abschnitt 8).
--
-- Kinos werden bewusst nur als ORT gezaehlt, nicht je Kino: ein einzelnes Kino
-- in einer kleinen Stadt ist praktisch eine Wohnadresse. Und bei kleinen Zahlen
-- kann eine Zeile mit anzahl = 1 in Verbindung mit anderen Zeilen desselben
-- Monats theoretisch auf eine Person zurueckfuehren -- die Auswertung blendet
-- Werte unter einer Mindestzahl deshalb aus (siehe lib/onboarding.js,
-- AGGREGAT_SCHWELLE).
CREATE TABLE IF NOT EXISTS onboarding_aggregat (
  frage   TEXT NOT NULL,     -- 'schauverhalten' | 'genre' | 'anbieter' | 'kino_ort' | 'titel' | 'abschluss' | 'abbruch'
  antwort TEXT NOT NULL,     -- 'kino' | 'Thriller' | '8' | 'Koblenz' | '10-14' | 'fertig' | '3'
  monat   DATE NOT NULL,     -- Monatserster
  region  TEXT NOT NULL,     -- ISO-3166-Region der Person, 'XX' wenn unbekannt
  anzahl  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (frage, antwort, monat, region)
);
