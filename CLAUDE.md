# MovieTaste (filme-serien-checkliste)

Arbeitssprache: Deutsch. Details siehe `STATUS.md` (offen / entschieden /
als Nächstes) und `PLAN-KOSTEN.md` (Arbeitsweise mit Claude).

## Terminologie
- **„Watchlist"** (nicht „Watchliste").

## Deploy = Push
Ein Push auf `main` löst über `.github/workflows/deploy.yml` automatisch den
Deploy auf den Hetzner-Server (movietaste.de) aus — es gibt keine
Staging-Stufe. „Committen" heißt bei diesem Projekt faktisch „live stellen".
Nach einer abgeschlossenen Änderung committen *und* pushen, Deploy abwarten,
dann live verifizieren. Nur bei riskanten/unfertigen Sachen vorher fragen.

## Live verifizieren
Lokal (`file://`) fehlt das Backend — kein Katalog, kaputte relative Pfade.
Für Logik reichen lokale Testdaten (`POOL`, `PROGRESS`, `LINKED_PROGRESS`
setzen, `rebuild()`/`renderCurrentTab()`). Für echte Datenmengen (Sortierung,
Trefferzahlen, Suchvorschläge) gegen movietaste.de prüfen (~41.000 Titel).
TMDB-Abrufe sind lokal nicht testbar (Schlüssel nur in GitHub-Secrets und
`backend/.env` auf dem Server) — das offen sagen, nicht Erfolg behaupten.
Screenshots nur als Nachweis am Ende, sonst Seitentext lesen (`read_page`).

## Server- und DB-Befehle
`ssh -i ~/.ssh/id_ed25519 root@movietaste.de`, Projekt in `/opt/movietaste`.
Zugang funktioniert ohne Rückfrage/Passwort — Abfragen und Wartungsläufe
selbst ausführen.
- DB-Service im Compose heißt **`postgres`** (nicht `db`):
  `docker compose -f docker-compose.yml --profile prod exec -T postgres psql -U postgres -d filme_serien`
- Skripte aus der Repo-Wurzel (z. B. `stream-fetch.mjs`) brauchen einen Mount:
  `docker compose -f docker-compose.yml --profile prod run --rm --no-deps -T -v /opt/movietaste:/repo -w /repo -e TMDB_REGION=XX -e STREAMING_API_URL=https://movietaste.de backend node stream-fetch.mjs`
- Riskante SQL-Änderungen vor dem Push in `BEGIN;…ROLLBACK;` gegen die echte
  DB testen.
- Lange Läufe abkoppeln (`setsid nohup … > /tmp/lauf.log 2>&1 &`), sonst
  stirbt der Lauf mit der SSH-Verbindung.
- Lokaler Teststand ohne Docker: `embedded-postgres` auf Port 55432,
  `pg_hba.conf` auf `trust`, Backend über `.claude/launch.json` Eintrag
  „movietaste-teststand". Details siehe Memory.

## Arbeitsweise
- **Ein Auftrag = ein Worktree/Zweig = eine Sitzung.** Verhindert vermischte
  Commits bei parallelen Sitzungen.
- **Sonnet 5 als Standard** für Umsetzung, Opus 5 zum Planen, Fable nur
  gezielt nach Rückfrage.
- **Keine neuen Übergabe-Dateien.** Stand geht in `STATUS.md`
  (offen / entschieden / als Nächstes), Wiederkehrendes in einen Skill unter
  `.claude/skills/`. Alte Übergaben liegen in `docs/archiv/`.
- **Kommentare kurz.** Das Warum in 1–3 Zeilen; Datum und Entscheidungsgrund
  gehören in die Commit-Nachricht, nicht in den Code.
- `index.html` ist die einzige Frontend-Datei (HTML/CSS/JS + Übersetzungen
  eingebettet) — bewusst nicht angetastet, außer explizit beauftragt.
