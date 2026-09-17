---
name: import-status-pruefen
description: Status der Datenimporte/Crawls prüfen (Kino-, Streaming-, Bewertungs-Import, SEO-Fortschritt) — GitHub-Actions-Läufe und Datenbank-Stand statt teurer Chat-Abfragen.
model: haiku
---

# Import-Status prüfen

Die Crawls laufen kostenlos über GitHub Actions (`.github/workflows/`:
`cinema.yml`, `streaming.yml`, `rated-titles.yml`) oder als Server-Cron —
keine Claude-Tokens nötig. Vor teuren manuellen Nachfragen den Status hier
abfragen.

## GitHub Actions
```
gh run list --workflow=cinema.yml --limit=5
gh run list --workflow=streaming.yml --limit=5
gh run list --workflow=rated-titles.yml --limit=5
gh run view <run-id> --log-failed   # bei rotem Lauf
```
Ohne `gh` (falls nicht installiert): `gh` gehört auf den Mac installiert,
siehe `STATUS.md` / PLAN-KOSTEN.md Abschnitt 7.5 — Christians Aufgabe.

## Datenbank-Stand
Über [[server-db-abfrage]] per `psql`:
- Zuletzt anreicherte/importierte Titel: Spalte `enriched_at` bzw.
  vergleichbare Zeitstempel-Spalten je Tabelle prüfen
  (`SELECT max(enriched_at) FROM ...`).
- SEO-Fortschritt: Anzahl vorhandener SEO-Texte je Sprache zählen, siehe
  `backend/scripts/seo-content-daten.mjs` / `seo-batch-pruefen.mjs` für das
  genaue Schema.
- KPI-Stand: `backend/scripts/kpi-verify.mjs` bzw. `kpi.html` auf
  movietaste.de.

## Bekannter Fehlerfall
GitHub-Secret `TMDB_API_KEY` kann ungültig werden, ohne dass der
Server-Schlüssel (`backend/.env`) betroffen ist — dann sind nur die
Actions-Workflows rot, der Server-Cron läuft weiter. Fix nur durch
Christian (Secret erneuern). Siehe Memory
`datenlauf-workflows-rot-seit-14-09-2026`.
