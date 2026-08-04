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

`scripts/backup.sh` sichert die Datenbank per `pg_dump` aus dem
Postgres-Container heraus. Zwei Stufen, weil die Daten unterschiedlich
wertvoll sind:

| Aufruf | Inhalt | Warum |
|---|---|---|
| `./scripts/backup.sh taeglich` | Konten, Watchlist/Gesehen samt Bewertungen, Verknüpfungen, `titles` | Nicht wiederbeschaffbar |
| `./scripts/backup.sh monatlich` | Alles, inkl. der aus TMDB abgeleiteten Caches | Für den Fall, dass TMDB nicht mehr liefert |

Die Dateien landen in `./backups` (über `BACKUP_DIR` änderbar), werden
gezippt und automatisch ausgedünnt: 14 tägliche, 12 monatliche Stände
(`BACKUP_KEEP_DAILY` / `BACKUP_KEEP_MONTHLY`). Eine Sicherung unter 1 KB
gilt als fehlgeschlagen und wird verworfen, statt eine unbrauchbare Datei
stehen zu lassen.

Einmalig auf dem Server einzurichten (das kann nur jemand mit Serverzugang):

```
crontab -e
# täglich 03:15 UTC -- vor den Importläufen um 04:00/04:30
15 3 * * * cd /opt/movietaste && ./scripts/backup.sh taeglich >> /var/log/moviematch-backup.log 2>&1
# monatlich am 1. um 03:45 UTC
45 3 1 * * cd /opt/movietaste && ./scripts/backup.sh monatlich >> /var/log/moviematch-backup.log 2>&1
```

Wiederherstellen:

```
gunzip -c backups/moviematch-nutzer-....sql.gz | docker compose -f docker-compose.yml exec -T postgres psql -U postgres -d filme_serien
```

**Noch offen:** Die Sicherung liegt auf demselben Server. Das schützt gegen
kaputte Importläufe und Fehlbedienung, nicht gegen den Ausfall der Maschine.
Eine Kopie nach außen (Hetzner Storage Box o. ä.) fehlt bewusst noch.

### Schutz gegen unvollständige Importläufe

Beide Ingest-Routen (`/api/streaming/ingest`, `/api/cinema/ingest`) räumen am
Ende alles weg, was der Lauf nicht angefasst hat. Liefert TMDB nur einen
Bruchteil, würde ein „erfolgreicher" Lauf damit den Bestand leeren -- genau das
ist am 2026-08-02 passiert (0 von 20.369 Zeilen). Beide Routen lehnen deshalb
Läufe ab, die weniger als 70 % des vorhandenen Bestands liefern: Antwort 409,
Transaktion zurückgerollt, Bestand unverändert. Die GitHub Action schlägt dabei
sichtbar fehl, weil die Importskripte bei jedem Nicht-2xx abbrechen.

## Bekannte Einschränkungen / offene Punkte

- **Poster-Bilder der ursprünglichen 600 Katalog-Titel** lagen als Base64 in der
  DB (`titles.poster_base64`), weil für sie keine TMDB-Poster-Pfade bekannt
  waren -- rund 4,2 MB bei jedem Katalog-Abruf. Dafür gibt es jetzt
  `backend/scripts/backfill-catalog-posters.mjs`: ermittelt die TMDB-ID (aus
  `title_tmdb_resolution` oder per Suche über Titel+Jahr), holt den echten
  `poster_path` und leert `poster_base64` **nur bei Treffer**. Aufruf:
  ```bash
  docker compose -f docker-compose.yml exec -T backend \
    node scripts/backfill-catalog-posters.mjs --dry-run   # erst zur Kontrolle
  ```
  Titel ohne Treffer behalten ihr Base64-Bild; das Skript ist beliebig oft
  wiederholbar und arbeitet nur noch die verbliebenen ab.
- **Rechtliche Seiten** (`impressum.html`, `datenschutz.html`) enthalten
  TODO-Platzhalter für Name/Anschrift/Kontakt/Hosting-Standort/E-Mail-Anbieter
  -- vor Go-Live ausfüllen.
- **Backups/Monitoring** sind noch nicht eingerichtet (siehe oben).
- Migrationsskript `seed-from-index-html.mjs` ist für eine **einmalige**
  Erstbefüllung gedacht (bricht ohne `--force` ab, falls `titles` schon
  Zeilen enthält) -- die Datenbank ist danach die Quelle der Wahrheit, nicht
  mehr `index.html`.
