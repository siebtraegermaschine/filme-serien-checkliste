---
name: deploy-und-live-pruefen
description: Änderungen committen, pushen (= deployen) und live auf movietaste.de verifizieren. Nutzen, wenn eine abgeschlossene Änderung live gehen soll oder ein Deploy geprüft werden muss.
model: sonnet
---

# Deploy und live prüfen

Bei MovieTaste heißt „committen" faktisch „live stellen": Ein Push auf `main`
löst über `.github/workflows/deploy.yml` automatisch den Deploy auf den
Hetzner-Server (movietaste.de) aus — keine Staging-Stufe.

## Ablauf

1. **Status prüfen:** `git status`, `git diff` — nur gewollte Änderungen
   einchecken.
2. **Committen und pushen** auf `main` (oder den aktuellen Zweig, falls per
   PR gearbeitet wird).
3. **Deploy abwarten:** GitHub-Actions-Lauf von `deploy.yml` beobachten
   (`gh run watch` oder `gh run list --workflow=deploy.yml`).
4. **Live verifizieren:** Nicht nur behaupten, tatsächlich prüfen — per
   `curl https://movietaste.de/...` auf einen Textbaustein der Änderung,
   oder mit dem Browser-Pane `read_page`/`get_page_text` (Text statt
   Screenshot). Screenshots nur als Nachweis am Ende, wenn ohnehin schon
   geprüft wurde.
5. Bei riskanten oder unfertigen Änderungen vorher fragen und das explizit
   sagen — sonst gilt: fertig heißt live.

## Hinweise
- Lokal (`file://`) fehlt das Backend — kein Katalog, kaputte relative Pfade.
  Für Logik reichen lokale Testdaten; für echte Datenmengen (Sortierung,
  Trefferzahlen) gegen movietaste.de prüfen.
- TMDB-Abrufe sind lokal nicht testbar (Schlüssel nur in GitHub-Secrets und
  `backend/.env` auf dem Server).
