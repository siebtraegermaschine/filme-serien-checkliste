---
name: server-db-abfrage
description: Auf dem Produktionsserver (movietaste.de) per SSH eine Datenbank-Abfrage oder ein Wartungsskript ausführen. Nutzen für Datenchecks, Backfills, Skripte aus der Repo-Wurzel.
model: sonnet
---

# Server- und DB-Abfragen

Zugang: `ssh -i ~/.ssh/id_ed25519 root@movietaste.de`, Projekt liegt in
`/opt/movietaste`. Der Zugang funktioniert ohne Rückfrage und ohne Passwort —
Abfragen und Wartungsläufe selbst ausführen, nicht Christian Befehle zum
Kopieren geben.

## psql
Der Datenbank-Service im Compose heißt **`postgres`** (nicht `db`):
```
docker compose -f docker-compose.yml --profile prod exec -T postgres psql -U postgres -d filme_serien
```

## Skripte aus der Repo-Wurzel
Das Backend-Image enthält nur `backend/`. Skripte aus der Repo-Wurzel (z. B.
`stream-fetch.mjs`, `cinema-fetch.mjs`) brauchen einen Mount:
```
docker compose -f docker-compose.yml --profile prod run --rm --no-deps -T \
  -v /opt/movietaste:/repo -w /repo \
  -e TMDB_REGION=XX -e STREAMING_API_URL=https://movietaste.de \
  backend node stream-fetch.mjs
```
TMDB_API_KEY und Ingest-Secrets kommen automatisch aus `backend/.env` via
`env_file`.

## Regeln
- **Riskante SQL-Änderungen** vor dem Einspielen in `BEGIN; … ROLLBACK;`
  gegen die echte DB testen.
- **Lange Läufe abkoppeln**, sonst stirbt der Lauf mit der SSH-Verbindung:
  ```
  ssh ... 'setsid nohup docker compose ... > /tmp/lauf.log 2>&1 &'
  ```
  danach mit `tail` auf die Logdatei pollen statt die Verbindung offen zu
  halten.

## Lokaler Teststand ohne Docker
Auf dem Mac gibt es weder Docker noch Postgres-Binaries. Für echte
End-to-End-Tests: `embedded-postgres` (npm) auf Port 55432, `pg_hba.conf` auf
`trust`, Schema mit `node backend/db/migrate.js`. Backend über den
Preview-Eintrag „movietaste-teststand" in `.claude/launch.json` starten
(`server.js` cacht `index.html` im Speicher — nach Frontend-Änderungen
neu starten).
