# Status — movietaste.de / MovieMatch

> Verdichtet aus UEBERGABE*.md, IDEEN*.md und PLAN-*.md (ohne PLAN-KOSTEN.md,
> PLAN-SOCIAL.md), die jetzt unter `docs/archiv/` liegen. Stand 17.09.2026.
> Für Details in den Ursprungsdateien nachschlagen, hier nur der aktuelle
> Stand.

## Offen

- **Rechtstexte: anwaltliche Prüfung weiterhin ausständig** (UEBERGABE-OFFEN
  3.1) — Sammelauftrag: datenschutz.html/impressum.html komplett, englische
  Arbeitsfassungen, Benachrichtigungs-Mails, Nicht-EWR-Länder (USA CCPA/COPPA,
  BR LGPD, CA/AU/NZ/MX/AR/CL/CO). Bis dahin kein aktives Marketing außerhalb
  EWR.
- **Drei TODO-Platzhalter in datenschutz.html** und **impressum.html
  rechtlich prüfen** (UEBERGABE-CHAT 1).
- **Wochenend-Mail „Drei für dein Wochenende"**: gebaut, Versand deaktiviert
  (`WOCHENEND_MAIL_AKTIV`) — Freigabe ist Christians Entscheidung.
- **Taste-Match** (Kreuz-Score bei „Gemeinsam schauen") fertig gebaut, aber
  ausgeblendet (`TASTE_MATCH_SICHTBAR = false`).
- **„Personen einladen" im Menü rechts oben** ausgeblendet — Referral-Weg
  (`?ref=`) dadurch kaum genutzt.
- **Onboarding-Fenster** (5 Schritte) fertig gebaut, aber `ONB_FREIGABE =
  false`. Vor Freischaltung: Christian liest neue Datenschutz-Abschnitte
  gegen, dann `UPDATE user_onboarding SET anlaeufe = 0 …` (versehentlicher
  Kurzlauf am 17.08.), danach ein echter Durchlauf.
- **SEO-Content Stufe B (de-de) fertig** (17.09.2026, siehe
  [[seo-langschwanz-abo-statt-api]]): 19.940 Titeltexte live, ~528 bleiben
  dauerhaft offen (Faktenprüfung schlug auch beim einmaligen Wiederholungslauf
  an, kein weiterer Automatik-Retry). Fächer-Verfahren damit für Stufe B
  hinfällig. Offen: 3.336 Titel Stufe C und ~2.900 ohne ausreichende Daten
  (Datenlage prüfen, ob sich ein weiterer Batch-Lauf lohnt), sowie die
  Messfrage aus PLAN-KOSTEN.md 7.6 (bringen die vorhandenen Seiten Klicks?,
  vor weiterer Skalierung per Search Console prüfen).
- **Personen-Seiten** (Schauspieler/Regisseur, `/schauspieler/`,
  `/regisseur/`): Technik existiert bereits (`personen.js`, `seoData.js`,
  `seoRender.js`), aber bisher kaum genutzt — reine Lazy-Load-Kette ohne
  Traffic. 18.09.2026: Bulk-Resolve (`backend/scripts/personen-bulk-resolve.mjs`)
  fertig durchgelaufen — alle 48.483 Namen im Katalog geprüft, 47.006 davon
  (97 %) mit TMDB-`tmdb_person_id` + `popularity` aufgelöst. Priorisierungs-
  schwelle entschieden: ≥2 Titel im Katalog UND `popularity` ≥1 →
  9.511 Personen für die erste Runde. `seo-auftrag-personen.md` (Auftrag für
  redaktionelle Texte, analog `seo-auftrag-faecher.md`) steht. Content-Frage
  entschieden: eigene Absätze nur als Umformulierung verifizierter Fakten
  (TMDB-Biografie + Katalogdaten), keine neuen Behauptungen über reale
  Personen. Noch offen: automatische Faktenprüfung für Personentexte fehlt
  noch (Pendant zu `pruefeGegenQuelle`/`formatFehler`), Namenskollisions-
  Restrisiko bei ausführlicherem Content nochmal bewerten, vor dem ersten
  echten (kostenpflichtigen) Erzeugungslauf separate Freigabe einholen.
- **Native Apps** (iOS/Android via Capacitor): kompletter 11-Phasen-Plan
  steht, noch nicht begonnen. Kritischer Vorab-Punkt: Sitzungs-Cookie
  funktioniert in der nativen Hülle nicht (Token-Auth nötig), Kontolöschung
  muss künftig auch Token/Push-Kennungen entfernen, Katalog-Größe (~27 MB)
  vor Feinschliff auf schwachem Gerät messen.
- **„Deine Kinos"-Filter** (PLAN-KINOS): Ortssuche/Auswahl live, aber ohne
  Wirkung — echte Spielzeiten fehlen. Geldentscheidung offen (Basic+OSM
  ~1.800 €/Jahr vs. Business ~3.600 €/Jahr); drei Angebote (Cinepass Trial,
  MovieGlu, Kinoheld-Anfrage) noch einzuholen.
- **PLAN-SEO** (redaktionelle SEO-Landingpages, /de-de/...): Technik fertig,
  Content-Befüllung ist der SEO-Content-Prozess oben. Personen-Seiten
  (Schauspieler/Regisseur): siehe eigener Punkt oben, Technik existiert
  bereits, TMDB-Personen-Import läuft (Bulk-Resolve).
- **Sportcode-Rückbau**: CouchUltras seit 24.08. ausgegliedert, alter
  Sportcode liegt noch tot im Repo (siehe Tabelle UEBERGABE-OFFEN
  0.0.0.0.0.0) — Rückbau erst, wenn CouchUltras länger unauffällig läuft.
  Sport-Workflow läuft noch unnütz mit, kann sofort weg.
- **Muttersprachler-Review** der maschinellen Übersetzungen (fr/es/it/nl/pt)
  liegt bei Christian, noch nicht durchgeführt.
- **Tour-Screenshots** veraltet (seit 11.08.), Update erst nach Abschluss
  der Oberflächen-Änderungen geplant.
- **Externe Erreichbarkeitsprüfung** (Server-Ausfall-Monitoring von außen)
  bewusst vertagt.
- Kleinere UI-Unstimmigkeiten, bewusst nicht behoben: Match filtert im Kino
  nicht (Absicht), eigene Titel verschwinden bei Community-/Datum-Sortierung
  (Absicht), Schwelle „20 Titel" im Text vs. „10" im Code (kosmetisch).
- **MovieTaste-Gesellschaftsfrage**: ob/wann eigene Gesellschaft bzw.
  Ausgliederung von CouchUltras — Christian muss entscheiden.

## Entschieden

- **App heißt MovieMatch**, Domain bleibt movietaste.de.
- **CouchUltras ist eigenes Repo/Projekt** seit 24.08.2026 — Sportaufgaben
  dort, nicht mehr hier.
- **Relaunch-Architektur**: selbstgehostet auf Hetzner, Docker/Coolify,
  Postgres, Node-API, Caddy; Login per E-Mail/Passwort ohne Altdaten-Import;
  App ohne Account frei durchsuchbar, Login erst bei Schreibaktionen.
- **Deployment**: jeder Push auf `main` deployt automatisch
  (`.github/workflows/deploy.yml` → `deploy.sh`); Änderungen immer gegen den
  live ausgelieferten Inhalt prüfen, nicht nur gegen den Workflow-Lauf.
- **SEO-Texte**: `seo_content`-Tabelle ist maßgeblich, nicht die Datei
  `seo-content-daten.mjs`; `npm run seo-content` legt nur neue Einträge an,
  überschreibt nie automatisch. Wöchentliche Sicherung sonntags 03:30 (Mac,
  launchd). Pflichtformat: 4 feste Überschriften, ≥250 Wörter, keine
  erfundenen Fakten (Korrekturdurchgang zwingend).
- **Google Analytics mit Cookie-Banner** seit 17.09.2026 live, Consent Mode
  „basic", lädt erst nach Zustimmung.
- **Analytics-Fenster** im Menü (nur für c.neubauer@digital-wings.com) seit
  16.09.2026 live.
- **Native Apps**: Capacitor statt Neubau (eine Codebasis), Oberfläche wird
  mitgeliefert statt nachgeladen, Token-Auth statt Cookie, iOS zuerst, Apple-
  Konto auf digital-wings (Organisation), Push über Firebase/FCM.
- **Filter-Umbau**: Filme/Serien/Watchlist/Gesehen/Neu entdecken sind frei
  kombinierbare Filter statt Tabs (seit 09.08.2026 live) — Auswahl wird
  beim Start nicht gemerkt, alles ist an.
- **Internationalisierung**: 41 Regionen, 7 Oberflächensprachen (de/en/fr/
  es/it/nl/pt) vollständig live inkl. Streaming/Kino/Freigaben je Region;
  USA technisch angebunden, rechtlich weiterhin gesperrt für aktives
  Marketing.
- **Terminologie**: „Watchlist" statt „Watchliste".
- **Kein Tracking/keine Werbung/keine öffentlichen Profile** als bewusste
  Positionierung („Der Filmgeschmack gehört dir") — auch als
  Marketing-Argument einzusetzen.
- **Affiliate-Links bewusst nicht verfolgt** — würde Rechtslage verkomplizieren.
- **Anonyme Statistiken** erst ab Mindestzahl an Bewertungen (aktuell 20),
  serverseitig durchgesetzt, nie eine HTTP-Route.
- **Feedback** wird zuerst in der Datenbank gespeichert, dann gemailt;
  12 Monate Aufbewahrung, `npm run feedback` zum Auslesen.
- **Rate-Limits** auf sensiblen und öffentlichen Lese-Endpunkten aktiv.
- **Momentaufnahmen („Diese Titel teilen")** ersetzen den alten Ansicht-Link
  im Teilen-Blatt; ohne Zeitverfall, kein Widerruf (vorerst), nur angemeldet.
- **Onboarding-Datenmodell**: personenbezogene Antworten verschwinden mit
  dem Konto, Aggregate bleiben anonym für immer (Kinos nur auf Ortsebene,
  Mindestzahl-Schwelle bei Auswertung).

## Als Nächstes

- SEO Stufe C / fehlende Daten: prüfen, ob sich ein weiterer Batch-API-Lauf
  (`backend/scripts/seo-batch.mjs --stufe C`) lohnt, oder erst die
  Search-Console-Zahlen der Stufe-B-Seiten abwarten (PLAN-KOSTEN.md 7.6).
- Personen-Seiten: Namenskollisions-Restrisiko bewerten, automatische
  Faktenprüfung für Personentexte bauen (Pendant zu `pruefeGegenQuelle`/
  `formatFehler`), dann mit Freigabe erste Texte für die 9.511 priorisierten
  Personen erzeugen.
- Rechtsprüfung der Datenschutz-/Impressumstexte als ein Sammelauftrag an
  eine Kanzlei anstoßen (deckt SEO, Onboarding, Push, Nicht-EWR mit ab).
- Vor App-Store-Vorbereitung: Apple-Entwicklerkonto samt D-U-N-S-Nummer
  beantragen (einzige nicht beschleunigbare Wartezeit im Native-Apps-Plan).
- Kino-Filter-Entscheidung treffen: Angebote von Cinepass (Free Trial),
  MovieGlu und Kinoheld einholen, dann Weg A/B/C wählen.
- Onboarding-Fenster nach Rechtstext-Freigabe und Zähler-Reset live schalten.
- Wochenend-Mail-Versand freigeben lassen (Christian) oder bewusst weiter
  pausieren.
- Muttersprachler-Reviews der Übersetzungen einholen und einarbeiten.
- Tour-Screenshots aktualisieren, sobald aktuelle Oberflächen-Änderungen
  abgeschlossen sind.
