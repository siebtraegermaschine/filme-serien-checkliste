# Deployment: „Filme & Serien" Relaunch

Diese Datei beschreibt, wie das Backend (Node/Express + Postgres) lokal läuft
und später auf dem Hetzner-Server deployed wird. Hintergrund/Architektur
siehe `konzept-relaunch.md`, Repo-Übergabe siehe `UEBERGABE.md`.

## Projektstruktur

```
index.html              Frontend (SPA, keine Katalogdaten mehr eingebettet)
impressum.html          Rechtlich, TODO-Platzhalter für echte Angaben
datenschutz.html        Rechtlich, TODO-Platzhalter
reset-password.html     Passwort-Reset-Formular (Ziel des Mail-Links)
backend/                Node/Express-API + Postgres-Schema
  server.js             Express-App, liefert auch das Frontend aus (statisch)
  db/schema.sql          Postgres-Schema (idempotent)
  db/migrate.js          Wendet schema.sql an
  scripts/seed-from-index-html.mjs   Einmalige Erstbefüllung des Katalogs
  scripts/backfill-*.mjs   Nachträge am Bestand (Poster, Metadaten, Themen);
                           jedes Skript erklärt im Kopf, was es tut und wie sich
                           der Lauf zurücknehmen lässt
  scripts/bewertungsstatistik.mjs   Anonyme Auswertung, `npm run statistik`
  lib/bewertungsstatistik.js        Mindestzahl je Titel (Datenschutz, Abschnitt 9)
  routes/                auth, titles, progress, streaming
docker-compose.yml       Postgres + Backend (+ Caddy im "prod"-Profil)
Caddyfile                Reverse Proxy/TLS für Produktion
stream-fetch.mjs         TMDB-Streaming-Job (GitHub Action), pusht jetzt an die API
```

## Lokale Entwicklung

Voraussetzung: Docker Desktop (oder `docker`/`docker compose` CLI), Node.js 20+.

```bash
cp backend/.env.example backend/.env
# SESSION_SECRET und STREAMING_INGEST_SECRET mit z.B. `openssl rand -hex 32` befüllen
docker compose up -d postgres
cd backend
npm install
npm run migrate
npm run seed -- /pfad/zu/index.html   # siehe Hinweis unten
npm run dev           # Backend auf http://localhost:3000, liefert auch das Frontend
```

> **Hinweis zum Seed-Skript:** Es liest FILME/SERIEN/DETAILS/CAND aus einer
> `index.html` -- diese Arrays wurden aber im Zuge des Relaunchs aus der
> aktuellen `index.html` entfernt (die App lädt den Katalog jetzt per API).
> Für die Erstbefüllung deshalb eine `index.html` **von vor dem Relaunch**
> angeben, z. B. direkt aus der Git-Historie:
> ```bash
> git show 4e22a6d:index.html > /tmp/index-original.html
> npm run seed -- /tmp/index-original.html
> ```
> (Commit-Hash ggf. anpassen -- das ist der letzte Stand vor dem Backend-Umbau.)
> Ohne Pfadangabe sucht `npm run seed` in `../index.html`, was seit dem
> Relaunch nicht mehr die Katalogdaten enthält.

Danach `http://localhost:3000` öffnen — das ist die komplette App (Backend +
Frontend), nicht mehr `index.html` direkt im Browser öffnen (die Datei lädt
ihre Daten jetzt per `fetch` von `/api/...`).

Alternativ komplett über Docker (Backend läuft dann containerisiert):

```bash
docker compose up -d
docker compose exec backend npm run migrate
```

Das Seed-Skript braucht eine `index.html`-Datei von vor dem Relaunch (siehe
Hinweis oben) -- die liegt nicht im Container. Am einfachsten dafür einmalig
lokal mit Node laufen lassen, `DATABASE_URL` zeigt dabei auf den von
`docker compose` exposeten Postgres-Port:

```bash
cd backend
DATABASE_URL=postgres://postgres:postgres@localhost:5432/filme_serien \
  node scripts/seed-from-index-html.mjs /tmp/index-original.html
```

## Benötigte Secrets/Variablen (`backend/.env`)

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Postgres-Verbindung |
| `SESSION_SECRET` | Signiert die Session-Cookies -- lang & zufällig |
| `STREAMING_INGEST_SECRET` | Auth für den GitHub-Action → Backend Push (`/api/streaming/ingest`) |
| `MAIL_PROVIDER` | `console` (lokal) oder `resend` |
| `RESEND_API_KEY` | Nur falls `MAIL_PROVIDER=resend` |
| `APP_BASE_URL` | Für Links in E-Mails (Passwort-Reset) |
| `CORS_ORIGIN` | Nur nötig, wenn Frontend von anderer Origin läuft (lokal optional) |
| `TMDB_API_KEY` | Trailer, Teilen-Vorschauen und der tägliche Themen-Nachtrag |

`.env` ist in `.gitignore` -- niemals committen.

## Produktions-Deployment auf Hetzner

1. Server vorbereiten: Docker + Docker Compose installieren (oder Coolify
   nutzen, das das für dich übernimmt).
2. Repo auf den Server bringen (Git-Checkout oder Coolify-Git-Deploy).
3. `backend/.env` auf dem Server anlegen (siehe Tabelle oben) -- mit
   produktionstauglichen Secrets, `NODE_ENV=production`, `MAIL_PROVIDER=resend`
   + echtem `RESEND_API_KEY`, `APP_BASE_URL=https://<domain>`.
4. `Caddyfile` anpassen: `deine-domain.example` durch die echte Domain
   ersetzen, sobald sie feststeht.
5. Hochfahren (explizit **nur** `docker-compose.yml` -- ohne `-f` wird
   `docker-compose.override.yml` automatisch mitgeladen, das ist nur fuer die
   lokale Entwicklung gedacht und oeffnet Postgres/Backend-Ports oeffentlich):
   ```bash
   docker compose -f docker-compose.yml --profile prod up -d --build
   docker compose -f docker-compose.yml exec backend npm run migrate

   # Nur beim allerersten Deploy: Katalog aus einer Vor-Relaunch-index.html seeden
   # (Commit-Hash siehe Hinweis weiter oben; das Repo-Checkout auf dem Server hat
   # dieselbe Git-Historie).
   git show 4e22a6d:index.html > /tmp/index-original.html
   docker compose -f docker-compose.yml cp /tmp/index-original.html backend:/tmp/index-original.html
   docker compose -f docker-compose.yml exec backend node scripts/seed-from-index-html.mjs /tmp/index-original.html
   ```
   Caddy holt automatisch ein Let's-Encrypt-Zertifikat für die Domain.
6. DNS: A/AAAA-Record der Domain auf die Server-IP zeigen lassen.
7. GitHub Action (`streaming.yml`) umstellen: Repository-Variable
   `STREAMING_API_URL` auf `https://<domain>` setzen und
   Repository-Secret `STREAMING_INGEST_SECRET` (identisch zu dem im
   `backend/.env` des Servers) anlegen. Ab dann schreibt der tägliche
   TMDB-Job (04:00 UTC, siehe `.github/workflows/streaming.yml`) direkt in
   die Datenbank statt `streaming.json` zu committen.

## Backups

Die Datenbank wird per `pg_dump` gesichert. Zwei Stufen, weil die Daten
unterschiedlich wertvoll sind:

| Aufruf | Inhalt | Warum |
|---|---|---|
| täglich | Konten, Watchlist/Gesehen samt Bewertungen, Verknüpfungen, `titles` | Nicht wiederbeschaffbar |
| monatlich (am 1.) | Alles, inkl. der aus TMDB abgeleiteten Caches | Für den Fall, dass TMDB nicht mehr liefert |

Die Dateien landen in `./backups` (über `BACKUP_DIR` änderbar), werden
gezippt und automatisch ausgedünnt: 14 tägliche, 12 monatliche Stände
(`BACKUP_KEEP_DAILY` / `BACKUP_KEEP_MONTHLY`). Eine Sicherung unter 1 KB
gilt als fehlgeschlagen und wird verworfen, statt eine unbrauchbare Datei
stehen zu lassen.

**Das läuft automatisch** -- kein Cronjob nötig. Das Backend startet den
Zeitplan beim Hochfahren mit (`backend/lib/sicherung.js`): täglich die
Nutzerdaten, am Monatsersten zusätzlich eine Vollsicherung. `pg_dump` steckt
dafür im Image (`postgresql16-client`) und verbindet sich über `DATABASE_URL`,
also genauso wie das Backend selbst.

Die Dateien liegen im Volume `backup_data` unter `/app/backups`. Ansehen:

```
docker compose -f docker-compose.yml exec backend ls -lh /app/backups
docker compose -f docker-compose.yml logs backend | grep sicherung
```

Herunterkopieren:

```
docker compose -f docker-compose.yml cp backend:/app/backups ./backups
```

Abschalten (z. B. wenn später ein externer Dienst übernimmt): `BACKUP_DISABLED=1`
in `backend/.env`.

`scripts/backup.sh` bleibt als Weg für Sicherungen zwischendurch bestehen --
etwa direkt vor einem größeren Eingriff.

Wiederherstellen:

```
gunzip -c backups/moviematch-nutzer-....sql.gz | docker compose -f docker-compose.yml exec -T postgres psql -U postgres -d filme_serien
```

**Noch offen:** Die Sicherung liegt auf demselben Server. Das schützt gegen
kaputte Importläufe und Fehlbedienung, nicht gegen den Ausfall der Maschine.
Eine Kopie nach außen (Hetzner Storage Box o. ä.) fehlt bewusst noch.

### Themen-Schlagwörter (True Crime & Co.)

Die Genres der App kommen 1:1 von TMDB, und TMDB kennt kein Genre „True Crime".
Solche Trends pflegt TMDB als **Schlagwort**. `backend/lib/themen.js` trägt sie
nach: Ein Thema ist eine Zeile in `THEMEN`, entweder mit fester
TMDB-Keyword-ID oder mit einem Suchbegriff, den der Lauf selbst auflöst
(übernommen wird nur eine exakte Namensgleichheit).

Das Backend startet den Nachtrag **täglich um 05:15 UTC** -- also nach den
Importläufen (04:00 und 04:30). Die Titel der Nacht bekommen ihr Schlagwort
damit noch am selben Morgen. Die feste Uhrzeit ist Absicht: An ein Intervall ab
Containerstart gekoppelt würde jeder Deploy den Rhythmus verschieben. Beim Start
selbst läuft nichts, sonst stieße jedes Deploy ein paar hundert TMDB-Abrufe an.

Vorher gab es pro Thema ein eigenes Skript, das jemand von Hand starten musste;
„TrueCrime" hing deshalb an 94 Titeln, während TMDB rund 1.500 kennt.

Von Hand anstoßen (z. B. direkt nach dem Hinzufügen eines Themas):

```
docker compose -f docker-compose.yml exec -T backend node scripts/backfill-themen.mjs --dry-run
docker compose -f docker-compose.yml exec -T backend node scripts/backfill-themen.mjs
```

Geschrieben wird ausschließlich additiv -- bestehende Schlagwörter bleiben
unberührt, und die täglichen Importe überschreiben `keywords` ohnehin nie.
Abschaltbar per `THEMEN_DISABLED=1`.

### Schutz gegen unvollständige Importläufe

Beide Ingest-Routen (`/api/streaming/ingest`, `/api/cinema/ingest`) räumen am
Ende alles weg, was der Lauf nicht angefasst hat. Liefert TMDB nur einen
Bruchteil, würde ein „erfolgreicher" Lauf damit den Bestand leeren -- genau das
ist am 2026-08-02 passiert (0 von 20.369 Zeilen). Beide Routen lehnen deshalb
Läufe ab, die weniger als 70 % des vorhandenen Bestands liefern: Antwort 409,
Transaktion zurückgerollt, Bestand unverändert. Die GitHub Action schlägt dabei
sichtbar fehl, weil die Importskripte bei jedem Nicht-2xx abbrechen.

## Bekannte Einschränkungen / offene Punkte

- **Rechtliche Seiten:** In `datenschutz.html` fehlt noch der Name des
  Mailversenders in Abschnitt 6 -- fertiger Textentwurf samt der beiden offenen
  Entscheidungen in `ENTWURF-DATENSCHUTZ-MAIL.md`. Name, Anschrift, Kontakt und
  Serverstandort stehen inzwischen drin. `impressum.html` ist rechtlich noch
  nicht geprüft.
- **Monitoring** ist noch nicht eingerichtet. Die Sicherungen laufen dagegen
  täglich aus dem Backend heraus (siehe oben, `lib/sicherung.js`).
- Migrationsskript `seed-from-index-html.mjs` ist für eine **einmalige**
  Erstbefüllung gedacht (bricht ohne `--force` ab, falls `titles` schon
  Zeilen enthält) -- die Datenbank ist danach die Quelle der Wahrheit, nicht
  mehr `index.html`.
