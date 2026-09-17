# Übergabe: Relaunch „Filme & Serien"

Diese Datei ist der Einstiegspunkt für die neue Umgebung (separater Cloud-Account, Claude Code). Die eigentliche Spezifikation steht in **`konzept-relaunch.md`** im selben Ordner – bitte zuerst vollständig lesen, bevor irgendetwas umgesetzt wird.

## Kontext

Christian hat dieses Konzept in Cowork erarbeiten und mit ihm abstimmen lassen. Die eigentliche Umsetzung (Server, Backend, Auth, Deployment) soll bewusst nicht in Cowork erfolgen, sondern in Claude Code – dafür ist dieses Repo hierher übergeben worden. Zwischen der Konzeptphase und dieser Übergabe hat Christian ggf. noch selbst Änderungen an der bestehenden `index.html` vorgenommen – vor Start also den aktuellen Stand des Repos prüfen (`git log`, Diff zur letzten bekannten Version), nicht blind vom Konzeptdokument ausgehen.

## Ausgangslage im Repo

- `index.html` – die komplette bestehende App (Single-File-PWA, aktuell ~5 MB, inkl. eingebettetem Filme-/Serien-Katalog als JS-Arrays `FILME`, `SERIEN`, `DETAILS`, `CAND`). Wird beim Relaunch aufgeteilt: Katalogdaten wandern in die DB, Frontend behält UI/Logik, aber mit API-Calls statt localStorage.
- `streaming.json` – aktuell im Repo committeter Cache der TMDB-Streaming-Verfügbarkeit.
- `stream-fetch.mjs` – Node-Skript, holt Streaming-Daten von TMDB (nutzt `TMDB_API_KEY`).
- `.github/workflows/streaming.yml` – GitHub Action, läuft wöchentlich (Do. 6:00 UTC), führt `stream-fetch.mjs` aus und committed `streaming.json`. Laut Konzept (Abschnitt 2) soll dieser Job beibehalten, aber das Ergebnis künftig per API an die eigene Datenbank geschickt werden statt es zu committen.
- Hosting bisher: GitHub Pages (statisch). Wird durch Hetzner-Server ersetzt (Account + Domain sind laut Christian bereits vorhanden).

## Was zu tun ist

Der komplette Plan (Architektur, Datenmodell, Onboarding/Login-Flow, Rechtliches, Kosten, Phasenplan, offene Punkte) steht in `konzept-relaunch.md`. Kurzfassung der wichtigsten Leitplanken:

- Öffentliche Multi-User-Web-App, selbst gehostet auf Hetzner (Docker/Coolify, Postgres, Node.js-API, Caddy/Traefik für TLS).
- Login per E-Mail/Passwort, **kein** Sync/Import alter localStorage-Daten.
- App bleibt ohne Account frei durchsuchbar; Login wird erst bei Schreibaktionen (Gesehen/Watchlist/Liste hinzufügen) erzwungen, mit kombiniertem Login-/Registrierungs-Popup und automatischem Nachholen der Aktion nach erfolgreichem Login.
- Katalog bleibt zentral gepflegt (keine nutzergenerierten Titel).
- Öffentlich/wachstumsoffen gedacht – Skalierung von Anfang an mitdenken, nicht erst nachträglich.

## Empfohlenes Vorgehen

- Sonnet 5 für den Großteil der Implementierung, Opus 5 zusätzlich für sicherheitskritische Teile (Auth, Zugriffsregeln auf `user_progress`, finales Review vor Go-Live).
- Phasenweise entlang Abschnitt 7 im Konzept vorgehen, nach jeder sicherheitsrelevanten Phase Rücksprache mit Christian.
- Die in Abschnitt 9 des Konzepts gelisteten offenen Punkte (Budget-Bestätigung, E-Mail-Versanddienst) vor der jeweils betroffenen Phase klären, falls noch nicht geschehen.
