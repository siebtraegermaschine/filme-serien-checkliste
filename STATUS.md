# Status — movietaste.de / MovieMatch

> Verdichtet aus UEBERGABE*.md, IDEEN*.md und PLAN-*.md (ohne PLAN-KOSTEN.md,
> PLAN-SOCIAL.md), die jetzt unter `docs/archiv/` liegen. Stand 17.09.2026.
> Für Details in den Ursprungsdateien nachschlagen, hier nur der aktuelle
> Stand.

## Offen

- **SEO-Gleichstand Phase 1 erledigt** (20.10.2026, live in der DB): 11.968
  de-de-Titeltexte < 250 Zeichen per `backend/scripts/seo-titel-verlaengern.mjs`
  verlängert (Streaming-Anbieter je Land, einzelner Besetzungseintrag; kein
  API-Geld). Sicherung der Alttexte: Server `/tmp/verl/titel-sicherung.json`.
  Dazu 12 redaktionelle Texte (anbieter 2, genre 6, hub 4) von Hand verlängert.
  Rest unter 250 in de-de: 65 Titel (nur Jahr/Genre bekannt, Auffüllen wäre
  Füllstoff; **Entscheidung nötig**: so lassen oder mit einem Hinweissatz
  füllen) und 443 Kino-Städte (bewusst kurz, Entscheidung offen).
  Nächster Schritt: Phase 3 (Priorisieren), siehe `docs/PLAN-SEO-GLEICHSTAND.md`.

- **SEO-Gleichstand Phase 4 teilweise** (20.10.2026): Reihen (alle 6 Sprachen, 4.473 Texte) und Bestenlisten
  (2.217 von 2.303) per Abo-Verfahren übersetzt und live. Werkzeug: `backend/scripts/seo-kategorien-dateien.mjs`
  (`pakete`/`einspielen --dry-run`), Pakete auf dem Server unter /tmp/reihen bzw. /tmp/bl. Verworfen: Reihen 45, Bestenlisten 86
  (Titel mit anderem Apostroph, geänderte Zahlen) – bei Bedarf einzeln nachziehen.
  Prüfung angepasst: « » zählt nicht als deutscher Rest, Jahrzehnte/Länderkürzel dürfen ausgeschrieben werden.
  `PERSON_TX` hat jetzt es/it/nl/pt; `PERSONEN_LOCALES` (seoLocale.js:49) noch `['en-gb','fr-fr']`.
  Offen: Titel (en,fr,it,nl,pt,es; nach 3 Runden es-es Wochenlimit messen), Personen + Freischaltung, Kino-Städte auf 250 Zeichen,
  65 Titel ohne Fakten, Anbieter/Genre/Hub-Reste, Phase 6.
- **SEO-Gleichstand Phase 4, Titel Runde 1** (20.10.2026): es-es 248 von 250 Titeltexten übersetzt und live
  (2 wegen „Zahl ohne Beleg" verworfen). Stichprobe 50 Texte gelesen, Qualität gut. Verbrauch: 10 Sonnet-Pakete à 25 Texte
  ≈ 13 % des 5-Stunden-Limits, Wochenlimit stand danach bei 18 % (Ausgangswert vor der Runde nicht gemessen), ca. 3 Min je Runde.
  **Befund, Entscheidung nötig:** `kandidaten()` in `seo-uebersetzen.mjs` wählt nur de-Texte ≥ 1200 Zeichen. Die ca. 140.000 fehlenden
  Titeltexte (Phase-2-Tabelle) sind aber de-Kurztexte von 250–1199 Zeichen (Phase-1-Bausteine, ca. 450 Zeichen, ohne die vier
  Überschriften, `pruefe()` würde sie ablehnen). Echt fehlende lange Texte: es-es 1.405 (−250 jetzt), fr 17, nl 17, it 52, pt 70, en 91.
  Übersetzen der Kurztexte per Subagent = ca. 5.600 Pakete, unrealistisch; Alternative: Kurztexte je Sprache direkt aus DB-Fakten
  erzeugen (Phase 5, ohne Modell, kostenlos). Bis zur Entscheidung nur die langen Texte weiter übersetzen.
- **SEO-Gleichstand Phase 2 erledigt** (20.10.2026, nur gemessen, nichts geändert).
  Basis de-de ≥ 250 Zeichen; „fehlt" = Schlüssel ohne Text in der Ziel-Locale
  (Texte < 250 in Fremdsprachen: nur Anbieter/Genre/Hub je 1–6, Kino 0–5).
  | Bereich | en-gb | fr-fr | it-it | nl-nl | pt-pt | es-es |
  |---|---:|---:|---:|---:|---:|---:|
  | Titel (Basis 93.602) | 2.532 | 13.484 | 18.709 | 16.033 | 19.617 | 69.624 |
  | Personen (Basis 17.186) | 6.053 | 6.974 | 17.186 | 17.186 | 17.186 | 17.186 |
  | Bestenlisten (1.043) | 293 | 371 | 406 | 409 | 357 | 467 |
  | Reihen (502) | 13 | 30 | 56 | 27 | 65 | 46 |
  | Anbieter/Genre | 0/1 | 4/0 | 1/1 | 1/3 | 2/1 | 4/3 |
  Funde: (1) Alle fremdsprachigen **Reihen-Texte sind veraltet** (2.775 Zeilen,
  älter als der neue de-de-Text) → neu übersetzen. (2) **Titel ohne de-Text
  ≥ 250**: nur en-gb hat welche (2.256: 2.204 ohne de-Zeile, 52 zu kurz); die
  anderen Sprachen höchstens 6 (es-es). Quelle dafür en-gb → de übersetzen oder
  neu. (3) Kino-Städte: je Locale ca. 465 Texte vorhanden, aber de-de hat nur 26 mit ≥ 250 (443 kurz, Entscheidung offen); Fremdsprachen fehlt nichts. (4) 65 Titel
  ohne Fakten offen. (5) Personen es/it/nl/pt: 0 Texte, braucht Code
  (`PERSONEN_LOCALES`) = Push auf `main`, vorher Nutzer fragen.
  Summe Titel-Lücke ca. 140.000, Personen ca. 82.000, Rest ca. 2.500 Texte.
  Rohdaten: Scratchpad `p2.out`, `p2-reihen.out`.

- **PageSpeed: Rest-LCP mobil** (13.10.2026) — Frühabruf, Poster-Priorität und Minify sind
  live; neuen PageSpeed-Lauf (einige Minuten nach dem Deploy) abwarten und
  danach entscheiden.

- **Regie/Besetzung in CJK-Schrift** (13.10.2026) — bei ca. 1.994 Titeln
  steht `director` (teils auch `cast_names`) in Originalschrift, z. B.
  中田秀夫. Vermutlich liefert der TMDB-Abruf den Namen in Originalschrift,
  wenn kein lateinischer hinterlegt ist. Zu klären: Ursache im Abruf, dann
  Massenkorrektur (Transliteration) per Lauf. Nur `movie:20329` ist von Hand
  korrigiert (Hideo Nakata, Ken'ichi Matsuyama).

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
  (Datenlage prüfen, ob sich ein weiterer Batch-Lauf lohnt).
- **Personen-Seiten** (Schauspieler/Regisseur, `/schauspieler/`,
  `/regisseur/`): Technik existiert bereits (`personen.js`, `seoData.js`,
  `seoRender.js`), aber bisher kaum genutzt — reine Lazy-Load-Kette ohne
  Traffic. 18.09.2026: Bulk-Resolve (`backend/scripts/personen-bulk-resolve.mjs`)
  fertig durchgelaufen — alle 48.483 Namen im Katalog geprüft, 47.006 davon
  (97 %) mit TMDB-`tmdb_person_id` + `popularity` aufgelöst. Priorisierungs-
  schwelle entschieden: ≥2 Titel im Katalog (ohne popularity-Bedingung) →
  18.637 Personen für die erste Runde. `seo-auftrag-personen.md` (Auftrag für
  redaktionelle Texte, analog `seo-auftrag-faecher.md`) steht. Content-Frage
  entschieden: eigene Absätze nur als Umformulierung verifizierter Fakten
  (TMDB-Biografie + Katalogdaten), keine neuen Behauptungen über reale
  Personen. Namenskollisionsrisiko bewertet (18.09.2026): `resolvePersonId`/
  Bulk-Resolve wählt bei mehreren TMDB-Treffern mit exakt gleichem Namen den
  ersten (populärsten) — ohne Geburtsjahr- oder Werksabgleich kann das die
  falsche Person treffen. Bei Titeltexten fiel das kaum auf (nur Namens-
  erwähnung), bei einer eigenen Personen-Seite mit Biografie/Geburtsdatum
  wäre eine Fehlzuordnung eine sichtbare Falschaussage über eine reale
  Person. Mitigation umgesetzt und Check gefahren (18.09.2026): zweiter
  Bulk-Lauf (`backend/scripts/personen-detail-bulk.mjs`, ergänzt
  `personen_cache.known_for_department`) hat für 18.696 Personen
  Geburtsdatum + TMDB-Rollenzuordnung nachgeladen. Plausibilitätscheck
  (Geburtsjahr vs. frühestes Katalog-Titel-Jahr) fand nur 22 von 18.771
  Personen (0,12 %) mit hartem Widerspruch — Namensauflösung insgesamt
  zuverlässig. Entscheidung: 26 Personen mit unplausiblem Geburtsjahr
  (Geburtsjahr < 5 Jahre vor frühestem Titel oder danach) aus der ersten
  Content-Runde ausschließen, als Filterregel im noch zu bauenden
  Paketier-Skript verankern; `known_for_department`-Abgleich zu
  rauschbehaftet für Auto-Ausschluss, nur als weicher Hinweis bei
  Stichproben. Automatische Faktenprüfung für Personentexte gebaut
  (18.09.2026, `backend/scripts/seo-personen-check.mjs`): Pendant zu
  `pruefeGegenQuelle`/`formatFehler`, mit eigenen Mustern für die
  personenspezifischen Verbote (Auszeichnung, Privatleben, Werturteil,
  Karriereeinordnung, Kontroverse) statt der titelspezifischen
  (Geschäftszahl, Produktionsangabe); an Beispieltexten geprüft (saubere
  Texte ohne Verdacht, fabrizierte Behauptungen werden erkannt). Noch offen:
  Paketier-Skript (inkl. Ausschluss der 26 kollisionsverdächtigen Personen),
  vor dem ersten echten (kostenpflichtigen) Erzeugungslauf separate Freigabe
  einholen.
- **Native Apps** (iOS/Android via Capacitor): kompletter 11-Phasen-Plan
  steht, noch nicht begonnen. Kritischer Vorab-Punkt: Sitzungs-Cookie
  funktioniert in der nativen Hülle nicht (Token-Auth nötig), Kontolöschung
  muss künftig auch Token/Push-Kennungen entfernen, Katalog-Größe (~27 MB)
  vor Feinschliff auf schwachem Gerät messen.
- **PLAN-SEO** (redaktionelle SEO-Landingpages, /de-de/...): Technik fertig,
  Content-Befüllung ist der SEO-Content-Prozess oben. Personen-Seiten
  (Schauspieler/Regisseur): siehe eigener Punkt oben, Technik existiert
  bereits, TMDB-Personen-Import läuft (Bulk-Resolve).
- **Tour-Screenshots** veraltet (seit 11.08.), Update erst nach Abschluss
  der Oberflächen-Änderungen geplant.
- **Externe Erreichbarkeitsprüfung** (Server-Ausfall-Monitoring von außen)
  bewusst vertagt.
- Kleinere UI-Unstimmigkeiten, bewusst nicht behoben: Match filtert im Kino
  nicht (Absicht), eigene Titel verschwinden bei Community-/Datum-Sortierung
  (Absicht), Schwelle „20 Titel" im Text vs. „10" im Code (kosmetisch).

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
- **Alles indexieren** (21.09.2026): jede SEO-Seite mit Einträgen ist
  index,follow, auch ohne eigenen Text (Titel, Genre, Anbieter, Kino-Städte,
  Personen, Bestenlisten, Hubs) und steht in der Sitemap. noindex nur für
  Dubletten: Folgeseiten `?seite=N`, gleichnamige Personen ohne Text, 404;
  robots.txt sperrt weiter `/t/`, `?titel=`, die App. Deutsche Rechtstexte
  indexiert, englische (`imprint/privacy/terms.html`) nicht. Die
  250-Wörter-Regel gilt nur noch als Format für Batch-Texte.
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
- Personen-Seiten: erster echter Erzeugungslauf (18.09.2026, freigegeben,
  bezahlte Anthropic-Nutzung) mit 2 Subagenten à 15 Personen — 25 von 30
  Texten bestanden Format- und Faktenprüfung und sind live in `seo_content`,
  5 wurden verworfen (u. a. Robin Wright „24": echte Regelverletzung durch
  vermischte Filmografie-Rollenangaben, Rest vermutlich konservative
  Fehlalarme des mechanischen Checkers). Dabei entdeckt und behoben:
  `ladePersonSeite()`/`seitePerson()` (`backend/lib/seoData.js`,
  `backend/lib/seoRender.js`) lasen `seo_content` bisher gar nicht — die
  gesamte Pipeline hätte ohne den Fix keinen sichtbaren Text erzeugt. Fix
  live seit 18.09.2026 (Commit 249649f), live geprüft: george-lucas-1,
  mark-hamill-2, anthony-daniels-6 zeigen jetzt Werdegang/Filmografie bei
  uns/Einordnung. Zweiter Lauf (18.09.2026, freigegeben) mit 20 Subagenten
  à 15 Personen (~300 Rollen-Einträge, Priorisierungsschwelle ≥2 Titel):
  256 von 299 Texten bestanden die Prüfung und sind live (14 Formatfehler,
  28 Faktenverdacht, 1 unbekannter Schlüssel verworfen) — insgesamt 281
  Personen-Texte in `seo_content` (de-de). Live geprüft: robert-de-niro-380
  zeigt den neuen Text. Von den ursprünglich ~16.790 offenen Rollen-
  Einträgen (Stand 18.09.2026, nach Ausschlüssen und vor diesem Lauf)
  bleiben rund 16.490 offen. Noch offen: weitere Runden für den Rest
  (jeweils eigene Freigabe, bezahlte Anthropic-Nutzung) — bei diesem
  Umfang ggf. wie beim Titeltext-Workflow einen Rundenbetrieb über
  mehrere Sitzungen einrichten statt einzelner Ad-hoc-Läufe. **Dritter Lauf
  (19.09.2026, freigegeben): Batch-API statt Subagenten.** Neues Skript
  `backend/scripts/personen-batch.mjs` (analog `seo-batch.mjs`, gleiche
  Faktenprüfung `seo-personen-check.mjs`), erzeugt Personentexte per
  Anthropic Message-Batches-API (50 % Rabatt, `effort: "low"`) statt über
  Subagenten. Vorab zwei Fehler gefunden und behoben: Faktenprüfung meldete
  Tage unter 10 als erfunden (führende Nullen aus ISO-Daten, Commit 6e9e67f);
  Namens-Aliase in `personen_resolution` erzeugten doppelte `custom_id`s, was
  die Batch-API hart ablehnte — Kandidaten-Query gruppiert jetzt nach
  `tmdb_person_id` statt nach Namen (Commit d8de647). Freigabe: 50 % der
  offenen Rollen-Einträge (~8.267 von ~16.534), Kostenobergrenze 70 $. Lauf
  zweimal durch Anthropic-Kontoguthaben unterbrochen (nicht durch die
  70-$-Grenze) und nach Aufstockung fortgesetzt. Dabei aufgefallen und dem
  Nutzer gemeldet: `--limit` zählt bei jedem Neustart neu (kein kumulatives
  Kontingent über Läufe hinweg) — nach Rückfrage freigegeben, bis zum
  Kontoguthaben-Limit weiterlaufen zu lassen statt bei 8.267 zu stoppen.
  **Endergebnis:** 11.800 Rollen-Einträge versucht, 9.057 Texte bestanden
  Format-/Faktenprüfung (76,8 % Erfolgsquote), 1.540 Faktenverdacht, 1.202
  Formatfehler, 1 sonstiger Fehler. Tatsächliche Kosten 58,85 $ (unter der
  70-$-Freigabe). Insgesamt 9.338 Personen-Texte live in `seo_content`
  (inkl. der 281 aus den beiden Subagenten-Runden). **Vierter Lauf
  (19.09.2026, freigegeben): Rest bis 100 %.** Nutzer hat Guthaben
  aufgeladen und explizit freigegeben, alle verbleibenden Rollen-Einträge
  fertigzustellen. Dabei aufgefallen: der reine STATUS.md-Push zum dritten
  Lauf hat per „Deploy = Push" einen Redeploy ausgelöst, der die
  ephemeren Statusdateien des Skripts (`scripts/.personen-batch-lauf.json`,
  `.personen-batch-journal.jsonl`, nicht auf persistentem Volume) im
  Container gelöscht hat — dem Nutzer vorab gemeldet. Datenverlust folgenlos,
  da die Kandidaten-Auswahl live gegen `seo_content` filtert (`NOT EXISTS`),
  bereits erfolgreiche Texte waren also DB-seitig geschützt; nur die Liste
  der zuvor abgelehnten Kandidaten ging verloren und wurde in dieser Runde
  erneut versucht. Live nachgezählt: 7.453 offene Rollen-Einträge, Lauf
  gestartet mit `--limit 7453 --max-kosten 45`. Nutzer hat den Kostendeckel
  später auf bis zu 100 $ freigegeben; nicht mehr nötig, da der Lauf mit
  35,23 $ deutlich darunter blieb. **Endergebnis:** alle 7.453 Einträge
  versucht, 4.690 Texte bestanden die Prüfung (63,0 % Erfolgsquote), 1.363
  Faktenverdacht, 1.400 Formatfehler, 0 sonstige Fehler, 35,23 $ echte
  Kosten. **Damit alle ursprünglich offenen Personen-Rollen abgearbeitet —
  14.028 Personen-Texte live in `seo_content` (de-de).** Neue Lektion:
  Statusdateien des Batch-Skripts nicht auf persistentem Volume — bei
  laufenden Batch-Läufen möglichst keinen Zwischen-Push auf `main`
  vornehmen, da jeder Push (auch dokumentationsseitig) einen Redeploy und
  damit Datenverlust bei den Lauf-Statusdateien auslöst.
- Personen-Texte, abgelehnte neu versuchen (A2, 12.10.2026): offen waren
  2.672 Rollen (745 Regie; 1.205 mit Biografie < 300 Zeichen, 598 mit >= 5
  Titeln). Fehleranalyse an einer 120er-Pilotrunde im Abo: der alte Prüfer
  beanstandete 51 von 120 (61x „Zahl ohne Beleg“, 9x Auszeichnung, 3x
  Privatleben, 3x Produktion, 1x Rezeption) – überwiegend Falschpositive:
  aus den Daten errechnete Zahlen (Bewertungsspanne, Schnitt, Anzahl−1,
  Jahreskürzel), englische Zahlwörter/Tausendertrenner und englische Belege
  für deutsche Wörter (Academy Award → Oscar, son → Sohn). Prüfer
  (`seo-personen-check.mjs`) darum um abgeleitete Zahlen und eine enge
  EN→DE-Belegtabelle erweitert (Tests `backend/test/personenCheck.test.js`);
  echte Verstöße (erfundene Auszeichnung/Privatleben/Zahl/Person) bleiben
  beanstandet. Gemeinsame Datenzugriffe in `personen-daten.mjs`,
  Selbstprüfung für Bearbeiter ohne DB: `personen-selbstcheck.mjs`
  (im Auftrag `seo-auftrag-personen.md` verlinkt). Pilot: 119 von 120 Texten
  live. Danach 4 Abo-Runden à 150 (10 Subagenten, ohne Geld) live
  eingespielt, alle ohne Beanstandung; Kris Wu (schauspieler:1390948,
  Haftstrafe in der Biografie), Robert Blake (schauspieler:9287) und
  Robert Hughes (regisseur:1230838, Verurteilung) bewusst nicht eingespielt,
  bleiben offen. Runde 4: 148 Texte. Runden 5 (148) und 6 (144) am
  12.10.2026 live; offen gelassen u. a. Jamie Foreman, Brad Renfro, Bobby Brown,
  Harald Reinl, Joshua Zeman, 박성웅 (Kriminalität/Drogen), Osgood Perkins
  (Faktenverdacht).
  Restbestand 12.10.2026: 1.783 offene Rollen (501 Regie). Weiter per
  `.a2`-Muster: `personen-pakete.mjs --mischen rN`, Texte, `personen-selbstcheck.mjs`,
  `personen-einspielen.mjs` (Probelauf, dann echt). Alternativ Batch:
  Rest per Batch vorbereitet, NICHT gestartet: nach Läufen 3/4 ca. 0,005 $
  je Eintrag, also ca. 13 $ für ~2.500 Rollen (Obergrenze 20 $):
  `ANTHROPIC_API_KEY=… node scripts/personen-batch.mjs --limit 2500 --max-kosten 20`
  (vorher `--dry-run --limit 50`; kein Zwischen-Push während des Laufs).
- Onboarding-Fenster nach Rechtstext-Freigabe und Zähler-Reset live schalten.
- Tour-Screenshots aktualisieren, sobald aktuelle Oberflächen-Änderungen
  abgeschlossen sind.

## Personen-Übersichten und Verlinkung (19.09.2026, live)
- `/de-de/schauspieler` und `/de-de/regisseur`: Top 96 nach Titelzahl, Footer-Link, Startseiten-Kachel, Hub-Texte in `seo_content`, index,follow.
- Personenseite indexierbar bei ≥1 Katalog-Titel UND (Text ODER Foto); ohne Text/Bio erscheint ein Kurzprofil aus Katalogdaten. Sitemap: ~20.500 Personen-URLs (eine SQL-Abfrage, `personenFuerSitemap`).
- Titelseiten verlinken Besetzung und Regie bei jeder Person mit solcher Seite (nur eindeutige Namen).
- Offen/später: Hub-Paginierung (bisher nur Top 96), Drehbuch (1.278 Personen im Cache, aber keine Titelzuordnung), Namens-Index auf `personen_cache` (Link-Abfrage ~65 ms je Titelseite).

## Bestenlisten ausgebaut (19.09.2026, live)
- **Footer** (SEO-Seiten und App) verlinkt dieselben Übersichten, Test `Footer: … dieselben Uebersichten` sichert das. **Bestenlisten-Übersicht** `/de-de/bestenlisten` mit Abschnitten je Typ (Aktuell, Anbieter, Jahrzehnt, Thema); `/beste-filme|serien` genauso.
- **Neue Seitenarten** unter `/de-de/beste-filme|serien/`: `anbieter/<slug>`, `jahrzehnt/<1990>`, `thema/<weihnachten|wahre-begebenheit>`, `genre/<g>/jahrzehnt/<jz>`, `genre/<g>/anbieter/<a>`, `im-kino` (nur Filme), `neu`. Schwelle 30 Titel (Kino 10), darunter 404; Schlüssel `<modus>:<wert>:<type>` in `seo_content` (`bestenliste`), zentral in `backend/lib/seoBestenlisten.js`. Analytics-Typen `beste-anbieter|jahrzehnt|thema|genre-jahrzehnt|genre-anbieter|kino|neu`.
- **Verlinkung**: Genre-Seite ↔ Beste-Genre, Anbieter-Seite ↔ Beste-Anbieter, Kombi-Chips auf Genre-/Jahrzehnt-/Anbieter-Liste. h1-Fehler behoben (Genre fehlte).
- **Texte**: 547 Listen mit deterministischen Texten aus DB-Fakten (`node backend/scripts/seo-bestenlisten-texte.mjs`, legt nur fehlende an, kein API-Aufruf). Vorher gab es für Bestenlisten gar keine Texte → alle waren noindex und fehlten in der Sitemap. Nach neuen Kombinationen (z. B. neuer Anbieter) Skript auf dem Server erneut laufen lassen.
- **Kino-Hub/-Städte** zeigten ~150 von ~180 Filmen mit Link auf 404 (kein Titel in `titles`); jetzt nur Filme mit Titelseite.
- **Entschieden/ausgelassen**: Land/Sprache und Laufzeit/Staffelzahl (inzwischen gebaut, siehe unten), Beste-Zeile auf Personenseiten (Filmografie dort schon nach Bewertung sortiert = Doppelung). „Neu“ = laufendes + Vorjahr (Katalog kennt nur `year`, kein Datum).
- **Offen (Entscheidung nötig)**: Drehbuchautoren-Seiten über TMDB-Writer-Credits. Thema-Listen hängen an den Katalog-Schlagwörtern (nur ~17 % der Titel haben welche) — weitere Themen erst bei besserer Abdeckung. Texte sind templatiert: nach Search-Console-Zahlen entscheiden, ob bezahlte Einzeltexte für Top-Listen lohnen.
- **Später**: Hub-Paginierung der Personen-Hubs, Namens-Index auf `personen_cache`.

## Land, Sprache, Laufzeit, Staffelzahl (19.09.2026, live)
- **Daten**: neue Spalten `titles.origin_country TEXT[]`, `original_language`, `runtime` (nur Filme), `seasons` (nur Serien). Backfill `backend/scripts/backfill-herkunft.mjs` (idempotent, Marker `original_language IS NULL`, `--dry-run`, `--limit=N`) lief einmal komplett: 26.691 Titel, 0 Fehler. Abdeckung: Filme 22.672 von 22.674 mit Sprache, 22.670 mit Land, 22.650 mit Laufzeit; Serien 4.672 von 4.675 mit Sprache, 4.671 mit Land und Staffeln. Neue Titel aus dem Discovery-Import (`discover-rated-titles.mjs` → `bulk-ingest`) bekommen die Werte direkt (`backend/lib/tmdbMerkmale.js`).
- **Lücke**: Titel, die Nutzer über `/api/titles/ensure` anlegen, setzen die Spalten nicht. Backfill gelegentlich erneut laufen lassen (macht nur die fehlenden): `docker compose -f docker-compose.yml --profile prod exec -T backend node scripts/backfill-herkunft.mjs`.
- **Seitenarten** unter `/de-de/beste-filme|serien/`: `land/<slug>`, `sprache/<slug>`, `land/<slug>/genre/<g>`, `laufzeit/unter-90|ueber-150` (nur Filme), `staffeln/eine|ab-5` (nur Serien). Schwelle 30 Titel, Land × Genre 50 (`MIN_TITEL_LAND_GENRE`), darunter 404. Länder- und Sprachnamen aus `Intl.DisplayNames` mit Korrekturen in `backend/lib/herkunftsnamen.js`; veraltete Codes (DD, SU …) sind aus der Slug-Auflösung ausgeschlossen. Analytics-Typen `beste-land|land-genre|sprache|laufzeit|staffeln` (Label in `index.html`).
- **Umfang live**: 263 neue Listen mit Text, alle in `sitemap-de-de-bestenliste.xml`, index,follow, Canonical sauber, Brotkrumen `Start › Bestenlisten › Beste Filme › …`. Verlinkt aus Übersicht, Beste-Hubs sowie Genre ↔ Land-Genre ↔ Land.
- **Entschieden**: Koproduktionen zählen für jedes beteiligte Land. Laufzeit unter 60 Minuten zählt nicht (Kurzfilme). Serien „eine Staffel“ = Miniserien; „ab fünf“ = langlaufend.
- **Nicht lokal getestet**: TMDB-Abrufe (Schlüssel nur auf dem Server). Backfill und Textlauf liefen dort; Seiten live geprüft.
- **Als Nächstes / offen**: Land-Länge-Kombinationen und weitere Schwellen erst nach Search-Console-Zahlen. Neue Länder erscheinen automatisch, sobald sie 30 Titel haben (Katalog-Cache 1 h); danach `seo-bestenlisten-texte.mjs` auf dem Server erneut laufen lassen.

## Kino-Ansicht: Filter und Sortierung (19.09.2026, live)
- **Buttons „Läuft jetzt“ / „Läuft bald“** unter Watchlist und Gesehen, Sortieren unter „Neue entdecken“. Beide sind Schalter: keiner aktiv = alles (jetzt, bald, später), beide = Vereinigung. „Bald“ = Start in den nächsten 90 Tagen (nach Datum im Client, unabhängig vom API-Bucket). Filter setzen sich beim Öffnen der Kino-Seite zurück.
- **Standardsortierung** wie Filme/Serien: Taste-Score ab 10 markierten Titeln, sonst TMDB-Bewertung. Manuelle Wahl im Menü (Bewertung/Datum/Taste-Score) bleibt möglich. Übersetzungen für en/fr/es/it/nl/pt ergänzt.

## Alles indexieren (21.09.2026, live)
- `indexierbar` in `backend/lib/seoData.js` hängt nicht mehr am Text; Sitemap (`seoSitemap.js`) zählt alle vorhandenen Seiten auf, lastmod aus `seo_content`, sonst leer. Neu: `sitemap-de-de-kino_stadt.xml` wird befüllt, Hub-Sitemap enthält die drei Rechtstexte. `/t/`-Vorschau setzt den Canonical auf die SEO-Seite jetzt immer.
- `seo.css`/`consent.js` in robots.txt freigegeben (waren für Crawler gesperrt).
- **Texte nachgezogen (12.10.2026), siehe Abschnitt unten.** Restoffen: Titel ohne `tmdb_id` (~600) und Kino-Städte ohne Spielzeiten bleiben fast gleiche Seiten.

## Reihen (12.10.2026, live)
- **Seiten**: `/de-de/reihen` (Uebersicht, beliebte Reihen als Kacheln plus A-Z) und `/de-de/reihen/<slug>` ("<Reihe> Filme in Erscheinungsreihenfolge"). Quelle sind TMDB-Collections, nur Filme. Schwelle 3 Titel mit Titelseite (`MIN_TITEL_REIHE`), darunter 404 und nicht in `sitemap-de-de-reihe.xml`. Slug aus dem Namen ohne Suffix "Filmreihe/Collection", bei Kollision `-<collection_id>`. Footer, Startseiten-Kachel, kleiner Block "Teil der Reihe" auf der Titelseite. Analytics-Typen `reihen` und `reihe` (in `index.html` ohne Label, die Auswertung zeigt den Rohtyp).
- **Daten**: `titles.collection_id|collection_name|collection_geprueft|erschienen_am` (Migration in `schema.sql`, seo_content-Bereich `reihe`). Neue Titel bekommen die Reihe ueber `merkmaleAusDetail` im Import und `/bulk-ingest`; Bestand per `backend/scripts/backfill-reihen.mjs` (idempotent, `--dry-run`, `--limit=`). Titel, die Nutzer ueber `/api/titles/ensure` anlegen, setzen die Spalten nicht: Backfill gelegentlich erneut laufen lassen, danach `seo-reihen-texte.mjs` (legt nur Fehlendes an, Katalog-Cache 1 h).
- **Entschieden**: Reihenfolge = Erscheinungsdatum, nie "chronologisch nach Handlung" (TMDB kennt das nicht; die Seite sagt es offen). Texte deterministisch aus Katalogfakten, kein API-Aufruf. Reihenname deutsch (`language=de-DE`).
- **Nicht lokal getestet**: TMDB-Abrufe (Schluessel nur auf dem Server); Backfill und Textlauf liefen dort.
- **Offen**: Weitere Reihen-Facetten (Serien-Franchises, Reihe x Anbieter) erst nach Search-Console-Zahlen.

## Wochen-Seiten (12.10.2026, live)
- Neu: `/de-de/neu-auf` (Übersicht), `/de-de/neu-auf/<anbieter>` (Neu auf Netflix & Co.), `/de-de/kino/neustarts` (Starts der Woche + „Nächste Woche"). Kein Cron, nichts in `seo_content`: `seoData.js` rechnet bei jedem Cache-Aufbau (1 h) aus `streaming_cache.first_seen_at` bzw. `cinema_cache.release_date`; Regeln und Texte in `backend/lib/seoWochen.js`, „Stand" ist das Berliner Tagesdatum. HTTP-Cache 1 h.
- Schwelle 5 Titel (Kino 3); darunter Fenster 14 statt 7 Tage (Seite sagt „letzte 14 Tage"), danach `noindex,follow` statt 404. Sitemap (Hub) führt nur indexierbare Wochen-Seiten, lastmod = heute.
- **Importtag-Regel:** `first_seen_at` ist beim Erstimport eines Anbieters ein Artefakt (tausende Zeilen an einem Tag). Ein Tag zählt als Import, wenn er > 30 % der Zeilen des Anbieters trägt und ≥ 50 Zeilen hat; diese Tage fallen raus. Echte Spitzentage lagen bei ≤ 5 %.
- Titel ohne eigene Titelseite (~28 %) erscheinen als Text ohne Link, zählen aber für die Schwelle.
- Analytics-Typen: `neu-auf`, `neu-anbieter`, `kino-neustarts` (unbekannte Typen fallen im Frontend auf den Rohschlüssel zurück).
- **Offen:** Footer-Link auf `/neu-auf` fehlt (Footer ist per Test an `index.html` gekoppelt, die nicht angefasst werden sollte); verlinkt ist von Start, Streaming-Hub, Anbieter-Seite, Kino-Hub und Kino-Städten. Kino-Neustarts bis zur Mitte der Woche ggf. dünn.

## Absicherung und Audit (12.10.2026)
- CI (`ci.yml`, Backend-Tests mit Postgres-Service) und taegliche Smoke-Tests gegen die Live-Seite sind eingerichtet; CI blockiert den Deploy nicht.
- Neu: `backend/scripts/jsonld-check.mjs` (JSON-LD je Seitenart, auch als Modul) und `backend/scripts/seo-audit.mjs` (Stichprobe aus den Sitemaps: Status, Canonical, robots, Duplikate, JSON-LD, interne Links; 1 Req/s).
- Befunde und Fix in `seoRender.js`: (1) alle ItemList-Eintraege ohne `url` (Genre, Anbieter, Bestenliste, Kino, Hubs, Neu-auf, Neustarts) -> url ergaenzt, bei Wochen-Listen nur fuer Titel mit eigener Seite; (2) `&` im `<title>` doppelt escaped (`Sci-Fi &amp;amp; Fantasy`, z. B. /serien/war-politics) -> Escaping nur noch im Head-Renderer. Test in `seoRender.test.js`.
- Nach dem ersten Deploy zeigte der Link-Check zusaetzlich: Anbieter-Seiten (`/streaming/<anbieter>`) verlinkten Titel ohne eigene Titelseite (404, z. B. Crunchyroll). Behoben: `ladeAnbieterSeite` liefert `hatSeite`, ohne Seite = Liste ohne Link und ohne JSON-LD-Eintrag (wie bei den Wochen-Seiten).
- Kino-Hub: Orte in nicht-lateinischer Schrift (z. B. Athen) ergaben leeren Slug -> Link auf `/kino/` selbst und Doppel-URL im JSON-LD (auch Sitemap betroffen). `staedteListe` verwirft sie jetzt. Offen: Slugs verlieren Sonderzeichen (`ciudad-de-m-xico`); Transliteration waere eine eigene Entscheidung.
- Live-Stand vor dem Deploy: beide Befunde sichtbar (Audit 57 URLs, nur diese beiden Fehlerklassen). Nach dem Deploy Audit erneut laufen lassen: `node scripts/seo-audit.mjs --stichprobe=40` (aus `backend/`).
- Offen: Bericht fuer den vollen Lauf (`--alle`, ~51.000 URLs, ~14 h bei 1 Req/s) nicht gefahren; ggf. woechentlich per Workflow mit kleiner Stichprobe.

## Texte nachgezogen (12.10.2026, live)
- **Kategorien**: Genre-, Anbieter- und Kino-Stadt-Seiten haben Texte (`backend/scripts/seo-kategorien-texte.mjs`, deterministisch aus DB-Fakten, nur Fehlendes, kein API-Aufruf).
- **Titel-Kurztexte** (200-450 Zeichen) fuer Titelseiten ohne Text: `backend/scripts/seo-titel-kurztexte.mjs`. Kurztexte (< 1200 Zeichen) gelten in `seo-pakete.mjs` und `seo-batch.mjs` weiter als offen; `seo-einspielen` ersetzt sie durch den Langtext.
- **Runde 26**: 150 Langtexte per Faecher-Verfahren (Abo, keine API-Kosten) eingespielt; 6 Faktenverdachte (Zahlen/„Dreharbeiten“) umformuliert und nachgespielt.
- **Befund**: ca. 600 Titel ohne `tmdb_id` kommen in den Paketen nicht vor, nicht angefasst.
- **Als Nächstes**: siehe „de-de Langtexte Stufe C“ (14.10.2026).

## Freigaben 12.10.2026 (live)
- Sechs Locales (en-gb, es-es, fr-fr, it-it, nl-nl, pt-pt) aktiv, alle noindex, nicht in Sitemap/robots. Start-JSON-LD ohne leeres `hasPart`.
- Slug-Transliteration: `slugify(text, locale)` nur Nicht-de-Locales (Land/Genre/Ort/Anbieter, de-de unveraendert). Titel und Personen nutzen `slugifyName` (19.10.2026, immer volle Transliteration: `pokemon-60572`; alte URLs liefern weiter 200 mit Canonical auf die neue). Leere Slugs bei Nicht-Latin-Titeln (~5.000) bleiben, URL funktioniert ueber die tmdbId. Test `slug.test.js`; Kino-Hub-Leer-Slug-Test `seoKinoHub.test.js`.
- Woechentlicher Audit: `.github/workflows/seo-audit.yml` (40 URLs, 1 Req/s, nicht blockierend, Bericht als Artefakt).

## Mehrsprachigkeit vorbereitet (12.10.2026)

**Gebaut (Technik, alles noindex außer de-de):** Locale-Stufen aktiv vs.
indexierbar in `backend/lib/seoLocale.js`; `seoTexte.js` (Chrome-Texte
DE/EN/ES/FR/IT/NL/PT), `genreNamen.js` (Genre-Namen aus index.html), Render
lokalisiert für Start, Titel, 404 (`seoRender.js`). Nicht lokalisierte
Seitenarten: seit 12.10.2026 (siehe unten) alles außer Personen lokalisiert;
Personen liefern in Nicht-de-Locales 404 und werden dort nirgends verlinkt. hreflang nur über vorhandene Titeltexte
(`textLocales`), x-default → de-de. Sitemaps nur für indexierbare Locales,
Titel nur mit Text. `index.html` unverändert, Rechtstexte unverändert (Footer
verweist auf `imprint.html`/`privacy.html`). en-us/pt-br inaktiv (Nicht-EWR).
Pilot: 10 en-gb- und 10 es-es-Titeltexte in `backend/scripts/seo-pilot-en-es.mjs`
(aus dem Datensatz geschrieben, NICHT in die DB eingespielt).

**Entscheidungen für Christian:**
1. Sollen die sechs Locales (en-gb, es-es, fr-fr, it-it, nl-nl, pt-pt) im Netz
   aktiv geschaltet werden (zunächst noindex)? Erst dann Push auf main.
2. Slugs/Pfadwörter bleiben deutsch in allen Locales — lokalisieren, ja/nein?
3. Muttersprachler-Review der maschinellen FR/ES/IT/NL/PT-UI-Texte und der
   Pilot-Texte, bevor eine Locale indexierbar wird.
4. Anwaltsprüfung der englischen Rechtsentwürfe vor Indexierung.
5. Englisch: Code `en-gb` (SEO-Locale) oder `en-us` (Nicht-EWR, inaktiv)?
6. Welche Locale zuerst indexierbar, und wann.
7. ~~Weitere Seitenarten lokalisieren~~ — Hubs, Genre, Streaming/Anbieter,
   Bestenlisten, Kino, neu-auf, Reihen erledigt 12.10.2026; Personen offen.
8. ~~Lokalisierte Titel in Listenkarten~~ — erledigt 12.10.2026, siehe unten.
9. Kosten Batch-Lauf (siehe unten) — nur mit Freigabe.

**Lokalisierte Titel ohne TMDB-Übersetzung (12.10.2026, live in DB).** Befund:
1.542 Titel ohne `title_en` (1.537 mit `''`, alle bei TMDB ohne englischen
Titel, dazu 5 Katalog-Titel ohne tmdb_id); die 600 Katalog-Titel haben
`title_en` fast alle (595 über `title_tmdb_resolution` auflösbar).
`original_title` war global leer. `scripts/titel-lokalisieren.mjs`
(`holen` = Originaltitel per kostenlosem TMDB, `regeln`, `export`,
`einspielen`, alles idempotent, `--trocken` = Rollback): 1.536 Originaltitel
geholt, `title_en` = lateinischer Originaltitel (Regeln in `lib/titelLokal.js`,
Test dabei) für 1.538 Titel; Nicht-en-Locales erben das über die Kette.
3 Katalog-Titel von Hand (Twin Peaks: The Return, Killing Eve, Das Boot).
Rest ohne en-Titel: 1 (id 1035089, chinesische Lehrserie, bewusst leer).
Subagent-Vorschläge für fr/es/it/nl/pt (983 Titel ab 300 Stimmen mit Lücke,
8 Chunks): sehr zurückhaltend, nur 19 sichere Titel eingespielt. Rest bleibt
Fallback auf Original/Englisch. Die Skripte liefen vom Server-Mount, Tests:
`node --test test/titelLokal.test.js`.

**title_en-Lücke geschlossen (12.10.2026).** Befund: `titles.title_en` und
`uebersetzungen` waren per `backfill-english.mjs` längst gefüllt (27.523 von
27.558 Zeilen; 1.508 leer = TMDB kennt keinen englischen Titel). Es fehlte nur
die Nutzung in `seoData.js`: `ladeTitelSeite` liefert jetzt in Nicht-de-Locales
den Anzeigetitel (Wunschsprache → Englisch → Deutsch, `anzeigeTitel`) für H1,
`<title>`, JSON-LD `name`, Alt-Texte und die Karten „Weitere von"/„Ähnliche"
(`lokaleTitel`, eigene Abfrage, `TITEL_MIT_KENNUNG` bleibt schlank). Slugs
bleiben vom deutschen Titel abgeleitet, hreflang unverändert, de-de
unverändert (Test in `seoData.test.js`). `seo-batch.mjs` gab dem Modell den
Zielsprachen-Titel schon mit. Von 502 abweichenden en-gb-Texten nennen nur 16
ausschließlich den deutschen Titel — Neuerzeugung nicht nötig (ggf. nur diese
16). Offen: 35 Zeilen ohne `title_en` (30 mit tmdb_id) per
`backfill-english.mjs` nachziehbar; ~600 Katalog-Titel ohne TMDB-Kennung
bleiben deutsch.

**Kostenplan Batch (NICHT gestartet).** Basis: letzter Lauf 8.950 Texte =
67,42 $ echt (~0,0075 $/Text, Sonnet 5, Batch). Bei rund 20.000 Titeln mit
de-Text: ca. 150 $ je Locale (Sonnet 5), ca. 60 $ mit Haiku 4.5 (vorher 50
Texte vergleichen). Reihenfolge, jeweils auf dem Server in `/opt/movietaste/backend`:
```
# 1. Trockenlauf, schreibt nichts, Kosten ~0,4 $
ANTHROPIC_API_KEY=... node scripts/seo-batch.mjs --locale en-gb --stufe B --limit 50 --dry-run --max-kosten 2
# 2. Erster echter Teillauf (nach Sichtprüfung), ca. 7,5 $
ANTHROPIC_API_KEY=... node scripts/seo-batch.mjs --locale en-gb --stufe B --min-votes 1000 --limit 1000 --chunk-groesse 250 --max-kosten 10 --status-datei scripts/.seo-batch-en-gb.json --journal scripts/.seo-batch-en-gb.jsonl
# 3. Vollauf einer Locale, ca. 150 $
ANTHROPIC_API_KEY=... node scripts/seo-batch.mjs --locale en-gb --stufe B --max-kosten 160 --status-datei scripts/.seo-batch-en-gb.json --journal scripts/.seo-batch-en-gb.jsonl
```
Vorher prüfen, dass kein anderer Batch-Lauf aktiv ist (Statusdateien!).
Texte wirken erst für hreflang/Sitemap, wenn die Locale zusätzlich in
`SEO_LOCALES` indexierbar geschaltet ist.

## Seitenarten in Nicht-de-Locales (12.10.2026)

Hubs, Genre, Anbieter, Bestenlisten (inkl. Übersichten), Kino, neu-auf und
Reihen rendern in en-gb/es-es/fr-fr/it-it/nl-nl/pt-pt (alle noindex, nicht in
Sitemap/robots, kein hreflang ohne Gegenseite). Vorlagen in
`backend/lib/seoSeitenTexte.js`, Titel über `anzeigeTitel`, Länder-/Sprachnamen
über `Intl.DisplayNames`. Ohne `seo_content`-Text entfällt der Einleitungsabsatz;
Texte mit gleichem Schlüssel und Locale greifen automatisch, sobald sie in der
DB liegen. Slugs/Pfadwörter unverändert deutsch. de-de byte-gleich (Snapshot).
TMDB lokal nicht testbar.

**Offen:** Personen-Seiten lokalisieren. Übersetzung der `seo_content`-Texte je
Locale (Stand de-de: hub 9, genre 35, anbieter 17, bestenliste 810, kino_stadt
470, reihe 501 = rund 1.840 je Locale, Bestenlisten je Region ggf. abweichend;
en-gb/es-es haben schon fast alles außer Bestenlisten).

## Batch-Programm 12.10.2026 (live, freigegeben, ca. 75 $ echt)

- **Personen:** 855 Texte per `personen-batch.mjs` (6,83 $). 166 heikle Rollen
  (Straftaten/Verfahren/Drogen/Gangster) vorab ausgeschlossen, bleiben offen.
  Rest ca. 650 offen (Neuzählung nötig). Hinweis: `schauspieler:12951`
  (O. J. Simpson) ist live und nennt Festnahme/Mordanklage/Haft — prüfen.
- **Übersetzung Kategorien-Texte** (genre, anbieter, kino_stadt, reihe, hub →
  en-gb, es-es, fr-fr, it-it, nl-nl, pt-pt): neues Skript
  `scripts/seo-kategorien-uebersetzen.mjs` (Haiku 4.5, Batch, Prüfung auf
  Zahlen/Marken/Titel/Deutschrest), ca. 0,55 $ je Locale, ~3,8 $ gesamt. Je
  Locale 96-99 % der 1.034 Texte, Rest verworfen (nicht geschrieben; erneuter
  Aufruf versucht sie noch einmal). Bestenlisten (810) sind nicht übersetzt.
- **en-gb Titeltexte:** Haiku 4.5 (`--model claude-haiku-4-5-20251001`,
  Vergleich 20 Texte: gleichwertig zu Sonnet, 0,002 $ statt 0,005 $/Text).
  14.652 geschrieben, 4.827 verworfen (Format/Faktenverdacht, ~25 %), 38,7 $.
  en-gb gesamt 15.613 Titeltexte; noindex bleibt. Retry der verworfenen
  (neue `--status-datei`) würde ca. 10 $ kosten.
- **de-de Titeltexte Stufe B + C:** 376 + 3.202 geschrieben, 25,2 $. Stufe C
  ist damit durch; verworfene Faktenverdachte bleiben Vorlagentext.
- Haiku braucht keinen `effort`-Parameter (API 400) — in `seo-batch.mjs`
  behoben.

## Länder-Locales, fr-fr Stufe C, Personen-Rest (13.10.2026)
- **Länder-Locales live** (de-at, de-ch, fr-ch, en-ca, fr-ca, en-us): eigene Region, Texte der Sprachfassung (`textLocale`), noindex; Kinoorte nur DE (404 sonst).
- **fr-fr/en-gb indexierbar vorbereitet, nicht umgeschaltet:** `node backend/scripts/indexierung-schalter.mjs an fr-fr en-gb`, danach `cd backend && npm test` und 4 Tests anpassen (seoLocale, SEO_LOCALES, robots). Risiko: englische Rechtstexte ungeprüft. Umschalten nur auf Zuruf.
- **fr-fr Stufe C:** Lauf verwarf alles wegen Apostroph-Überschrift (56,09 $, 0 Texte). Fix `ueberschriftenNormalisieren` + `seo-journal-nachpruefen.mjs`; 16.665 Texte aus dem Journal eingespielt. Rest: 5.680 zu kurz, 1.620 Faktenverdacht (bleiben Vorlagentext).
- **Streaming-Rest:** ca. 45.700 Titel anderer Regionen: Aufruf in `seo-titel-anlegen.sql`, dann `seo-titel-kurztexte.mjs` (Prod-Schreibzugriff durch Christian).
- **Kurztexte-Stichprobe:** 12.033 Texte < 250 Zeichen (dünn), 448 Gruppen / 13.793 Texte mit Vorlagenähnlichkeit, 3.558 Titel ohne Text. Entscheidung offen: noindex oder anreichern.
- **Personen-Rest (Haiku-Abo):** 524 Texte erzeugt (vor Einspielen: Chris Moore, Nils Poppe, Phil Tippett entfernt); ~109 ausgelassen, 112 heikle Personen liegen (nur einzeln, ohne Straftaten/Gerüchte). Katalogfehler: Rollen passen nicht zur Biografie (u. a. Blake Edwards, Antoine Fuqua), doppelte Einträge (Refn, Bob Gale).
- **Kosten:** fr-fr Stufe C 56,09 $; Restguthaben ca. 114 $ von 300 $ (Stand 13.10.).

## Seiten für alle Titel, Pfadwörter (13.10.2026, live)
- 70.263 Streaming-Titel (DE, AT, CH, FR, GB, US, CA) ohne Seite sind als
  `titles.source='seo'` angelegt (`backend/scripts/seo-titel-anlegen.sql`), mit
  66.705 Kurztexten (`seo-titel-kurztexte.mjs`). Die App lädt `source='seo'`
  nicht; `seo-batch`/`seo-pakete` überspringen sie; Sitemap nur mit Text.
  Rest-Regionen (ca. 45.000 Titel nur in anderen Regionen): Skript mit anderer
  Regionenliste wiederholen. Bei Google Search Console die Indexierung beobachten.
- Pfadwörter je Sprache (`lib/seoPfade.js`, en/fr/es/it/nl/pt): intern bleibt
  alles deutsch, Umsetzung an der Grenze in `routes/seo.js`; deutsche Wörter in
  Nicht-de-Locales leiten per 301 um.
- Offen: Länder-Locales (de-at, de-ch, en-ca, fr-ca, en-us). Braucht
  `textLocale`-Rückfall (Texte der Basissprache) und Ersatz der fest
  verdrahteten `'de-de'`-Prüfungen in seoData/seoRender/seoSitemap; erst nach
  fr-fr/en-gb-Indexierung. Titeltexte es/it/nl/pt (ca. 40–60 $ je Locale).

## it-it Titeltexte per Abo (13.10.2026)
- Verfahren wie es-es: `seo-pakete.mjs --locale it-it --pakete 10 --je 15`, Haiku-Subagenten schreiben JSON, `seo-einspielen.mjs --locale it-it` (erst `--dry-run`). Kein API-Geld. Eine Runde (150 Texte) dauert ca. 10 Min.
- Stand nach Runde 30 (13.10.2026): 3.948 it-it-Titeltexte, Rest ca. 12.200 Titel. Runde 30 brachte nur 18 Texte (Pakete 05/10 verworfen, Agenten ohne Gegenprüfung): der Vorrat an Titeln mit langer Inhaltsangabe (≥ 800 Zeichen) ist leer, das Abo-Verfahren lohnt für it-it nicht mehr. Der Rest geht nur per Batch-API (nach Freigabe) oder mit gelockerter Mindestlänge (Entscheidung offen).
- Stand nach Runde 29: 3.930 Texte, Rest ca. 12.200 Titel, Personentexte nicht begonnen. Ausbeute R26 85 %, R27 64 %, R28 71 %, R29 ca. 65 % (Paket 05 verworfen, Agent hatte nicht gegengeprüft); Filter Inhaltsangabe ≥ 800 Zeichen, der Vorrat schrumpft, `skip.json` im Scratchpad merkt ca. 375 Titel ohne brauchbaren Text. (Überholt: neue Regel 13.10.2026, Länge folgt der Datenlage, siehe Abschnitt „Übersetzungslauf“.)
- Stand nach Runde 25: 3.503 Texte, Rest ca. 12.600 Titel. Ausbeute sinkt (ca. 60 %), weil die restlichen Datensätze dünner sind (Inhaltsangabe zu kurz für 250 Wörter, nichts wird aufgefüllt); Filter Inhaltsangabe ≥ 620 Zeichen, Titel ohne Text werden übersprungen (221 gemerkt). Bei Agenten-Prompts: Altersfreigabe 0, Namen in Fremdschrift und Vorlagen-/Fortsetzungsbezüge weglassen, Paketdatei mehrfach lesbar (Einmal-Lesen fördert Erfundenes).
- nl-nl Probe (Runde 1): nur 46 Texte aus 150 Titeln (ca. 31 %), weil bei vielen Titeln die niederländische Inhaltsangabe fehlt und der Datensatz Italienisch/Französisch/Spanisch liefert. Lohnt per Abo kaum; 46 nl-nl-Titeltexte liegen in der DB (noindex).
- Der Rest geht nur per Batch-API (ca. 40–60 $, nur nach Freigabe) oder in weiteren Abo-Sitzungen. it-it bleibt noindex, bis `indexierung-schalter.mjs` auf Zuruf läuft.

## TMDB-Quelltexte bereinigt (13.10.2026, live)
- Live-DB (`titles.uebersetzungen`/`plot`): U+A789 statt ":" in 4 es-Titeln (Dragon Ball Z), `571891` Titel + „Pókemon", `12819` „sakvo", `11937` „Kalahari-Buschmannes".
- Import: `backend/lib/tmdbText.js` ersetzt Doppelpunkt-Lookalikes in `backfill-english.mjs` und `discover-rated-titles.mjs`. Bindestriche bewusst nicht pauschal angefasst.
- es-es-Titeltexte brauchen **keine** Neuerzeugung (enthielten die Fehler nicht); die 201 es-Titel mit Bindestrich gesichtet, alles echte Namen.
- Hinweis: CI-Test `streamingIngestStapel` war einmal rot, beim Neustart grün (vermutlich instabil).

## PageSpeed / Ladeleistung (13.10.2026, live)
- Verlauf mobil: Performance 21 → 82, TBT 2870 → 20 ms, CLS 0,542 → 0,003, Speed Index 11,4 → 2,1 s, LCP 4,7 → 4,5 s; Barrierefreiheit 100, Best Practices 100, SEO 100. Desktop 99.
- Gestufte Katalogladung: Erstbesucher (kein IndexedDB-Cache, Pfad `/`, nicht angemeldet) holen zuerst `/api/startkatalog` (600 kuratierte + 600 beliebteste Zusatztitel, ca. 250 KB gepackt); der volle Katalog (~8 MB) folgt bei der ersten Bedienung oder nach 20 s. Schlägt der Startabruf fehl, lädt die App wie früher alles.
- Der Startkatalog wird beim Serverstart für de/DE und en/US vorgewärmt (`server.js`). Andere Sprachen/Regionen sind nach einem Deploy kalt (erster Abruf bis ca. 15 s). PageSpeed testet mit en/US: Lauf erst einige Minuten nach einem Deploy anstoßen, sonst fehlt die Titelliste.
- Weitere Änderungen: Logo als WebP, Platzhalter gegen Layout-Verschiebung (`ol.list.laedt`), Cookie-Banner-Skript am Anfang von `<body>` statt `defer` (früherer Banner), Meta-Description und Titel, `Cross-Origin-Opener-Policy`, Kontraste, `/api/auth/me` ohne Sitzung 200 + `null` statt 401 (kein Konsolenfehler).
- Nachgezogen (13.10. abends): `/api/startkatalog` wird per kleinem Inline-Skript vor dem großen Seitenskript angefordert (`window.__STARTKATALOG`, `katalogVorabruf` nutzt es nur bei gleicher URL), erstes Poster im Kennenlern-Dialog mit `fetchpriority="high"`, Inline-JS/CSS der `index.html` werden im Docker-Build per esbuild minifiziert (`scripts/minify-html.mjs`, Quelle in Git bleibt lesbar; 886 → 540 KB). Live geprüft: Startabruf bei ~90 ms, keine Konsolenfehler.
- Bewusst nicht gemacht: DOM-Größe/Posterformate (TMDB w154, Fremdserver), CSP, Trusted Types, HSTS-`preload` (schwer rückgängig), Sourcemaps, ungenutztes CSS/JS entfernen.
- Rest-LCP mobil (zuletzt 4,2 s vor dem Frühabruf): erstes Poster im Dialog „Welche Titel kennst du?“, das erst nach dem Startkatalog angefordert werden kann. Neuer PageSpeed-Lauf nach dem Frühabruf steht aus.
- Core Web Vitals mit echten Nutzerdaten erst in einigen Wochen in der Search Console sichtbar.

## Übersetzungslauf und Kurztexte alle Sprachen (13.10.2026, läuft auf dem Server)
- **Regel neu:** Länge folgt der Datenlage, keine 250-Wörter-Pflicht; nur Fakten aus DB/TMDB, nichts erfunden.
- **TMDB-Nachladen:** `backfill-english.mjs` (normal, Server, Log `/tmp/nachladen-en.log`) füllt `overview_en`/`title_en`/`uebersetzungen` für ~70.000 Titel; `--leere` neu für leere Strings.
- **Übersetzung:** `seo-uebersetzen.mjs` übersetzt de-de-Langtexte (≥1.200 Zeichen, ~23.700) per Batch-API (Haiku 4.5) nach en-gb, fr-fr, it-it, nl-nl, pt-pt, beliebteste Titel zuerst, Prüfung wie bei seo-batch plus Deutsch-Reste/FSK. Freigabe 140 $ gesamt (en 20, fr 20, it 35, nl 35, pt 30), ~0,17 Cent je Text. Probe 50 Titel sauber (1 von 20 Faktenverdacht). Läuft abgekoppelt: Logs/Journal/Status in `/tmp/uebs/<locale>.log|-j.jsonl|-s.json` auf dem Server. es-es nicht angefasst (anderer Chat).
- **Kurztexte:** `seo-titel-kurztexte-lokal.mjs` (kein API, ≥250 Zeichen, DO NOTHING, Langtexte ersetzen sie später) für Titel ohne Text in en/fr/it/nl/pt. Titel mit zu wenigen Fakten (en 20.329, fr 17.107 …) bleiben ohne Text.
- **Ergebnis (14.10.2026, Lauf beendet):** Langtexte en-gb 23.530, fr-fr 23.818, it-it 19.970, nl-nl 14.701, pt-pt 19.591 (de-de 23.755). Kosten ca. 136,6 $ von 140 $ (en 8,4, fr 16,2, it 35, nl 35,1, pt 42), Ø 0,22 Cent/Text. Unterwegs stoppte das Konto-API-Limit (angehoben) und ein Postgres-Shared-Memory-Fehler (Neustart mit Status-Datei). Aussortiert (nicht geschrieben): Faktenverdacht/Formatfehler, Details in `/tmp/uebs/*-j.jsonl`. Rest in it/nl/pt: Kurztext; nl-nl hatte 394 Formatfehler (Journal prüfen).
- **Offen:** noindex-Schwelle LIVE 14.10.2026: Titelseiten in Nicht-de-Locales ohne Text oder mit Text < 250 Zeichen noindex und nicht in der Sitemap (`MIN_TITELTEXT`, `titelTextReicht` in lib/seoLocale.js); de-de bewusst ausgenommen, bis die Texte aufgefüllt sind (danach Ausnahme entfernen); `indexierung-schalter.mjs` nur auf Zuruf; Personentexte für andere Sprachen; Wikipedia/Wikidata nicht begonnen.

### Nachtrag 14.10.2026: Aufstockungslauf (20 $) fertig
Langtexte jetzt: nl-nl 21.299, pt-pt 21.463, it-it 21.666 (en-gb 23.530, fr-fr 23.818, de-de 23.755 unverändert). Gesamtkosten je Sprache laut Lauf: nl 47,04 $, pt 46,01 $, it 38,71 $. nl-nl-Fehlalarm "deutsche Reste" behoben (`DE_WOERTER_NL`), Journal nachgeprüft. Rest bleibt Kurztext (je ca. 2.300–2.700 Langtexte offen).

## de-de Langtexte Stufe C (14.10.2026, live)
- `seo-audit.mjs` geprüft: wertet noindex-Seiten in der Sitemap schon als harten Fehler (`noindex-in-sitemap`), keine Änderung nötig. JSON-LD der Titelseiten ohne leere `actor`/`genre`-Arrays (live).
- Stufe B ist fast leer (4 Titel), deshalb `STUFE=C scripts/seo-runde.sh pakete …` (Inhaltsangabe >150 Zeichen, ≥3 Besetzung). Entscheidung Nutzer: Stufe C mit 250–420 Wörtern zu Ende, danach datenabhängige Untergrenze (z. B. ≥120 Wörter, nichts auffüllen) für den dünneren Rest.
- **Runde 27** (Archiv lokal `runden/runde-26`): 150 Texte, alle eingespielt. de-de-Langtexte jetzt 23.905.
  - 28 Texte enthielten Namen in Hangul/Kanji/Kyrillisch → entfernt, nicht transliteriert. Ursache behoben: `datensatz()` lässt solche Namen/Titel weg, Auftrag verbietet Fremdschrift.
  - Ein Schreiber hängte drei Überschriften leer an (15 Texte) → umsortiert. `formatFehler` und `seo-runde.sh pruefen` verwerfen jetzt leere Abschnitte.
  - Live gefunden: pt-pt movie:21868 mit leerem Abschnitt und Datenlage-Kommentar → bei den Übersetzungslücken neu machen.
- **Runde 28** (Stufe C, letzter Rest): 133 von 135 Texten eingespielt (2 zu dünn), de-de-Langtexte jetzt 24.038. Stufe B/C ist damit leer. Titel ohne lateinischen deutschen Titel (12) laufen mit dem englischen Titel (`datensatz()`); Fremdschrift-Regex um indische Schriften, Armenisch, Georgisch ergänzt.
  - Befund: de-de-Slugs solcher Titel sind leer (`/de-de/film/-623135`, Sinkhole); URL funktioniert über die tmdbId.
- **Stufe D** (live): offener Rest 2.923 Titel. `STUFE=D` nimmt deutsche *oder* englische Inhaltsangabe ≥150 Zeichen, ≥2 Besetzung, Regie/Idee optional (sonst fielen 1.017 Serien ohne „Entwickelt von“ heraus) → 1.340 Titel. Länge folgt den Daten: Ziel 190–260, Untergrenze 180 Wörter (sicher über 1.200 Zeichen = Langtext). Die Untergrenze ist ein Parameter (`--min-woerter`), andere Sprachen bleiben bei 250. ~1.580 Titel bleiben bewusst ohne Langtext (zu dünn).
  - `seo-runde.sh` nutzt eigene Temp-Pfade je Lauf; vorher überschrieben sich de-de- und es-es-Pakete gegenseitig (`/tmp/pakete`).
- **Runde 29** (Stufe D): 150/150 eingespielt. Vor dem Einspielen korrigiert: fremdsprachige Figurennamen (Pokémon, Dragonball, Dragonball Super), zwei „… genannt“-Sätze. Live geprüft: Das Damengambit, Pokémon.
  - Befunde, nicht angefasst: Slug `pok-mon-60572` verlor das „é“ (am 19.10.2026 mit `slugifyName` behoben). Yu-Gi-Oh! (series:902) hat in der Besetzung „Yugi M?t?“ (Kodierungsfehler in `titles`).
- **Runde 30** (Stufe D): 150/150 eingespielt. Korrigiert: Monty Python (Produzenten nicht als Entwickler), Star Wars Clone Wars (kein „Regisseur“ für Entwickler), drei „genannt/geführt“-Sätze. Selbstprüfung in `seo-auftrag-faecher.md` nimmt jetzt `MIN_W` (180 bei D). Live geprüft: Monty Python, Star Wars Clone Wars.
- **Runde 31** (Stufe D): 150/150 eingespielt. Korrigiert: Noblesse (Frankenstein), Cars on the Road (deutsche Namen Lightning McQueen/Hook statt franz. Synchron), Shrek-Kurzfilm (Esel statt Donkey), ein „genannt“-Satz. Live geprüft: Noblesse, Cars on the Road.
- **Runde 32** (Stufe D): 150/150 eingespielt. Korrigiert: Leaving Neverland (Freigabe-0-Satz raus), Edens Zero (Sakura-Kosmos). Prompt-Zusatz: deutsche Figurennamen. Live geprüft: Leaving Neverland, Edens Zero.
- **Runde 33** (Stufe D): 150/150 eingespielt. Korrigiert: Ein Engel auf Erden (nur Landon als Schöpfer, Claxton war Regie), Yu-Gi-Oh 5D's (Verweis auf GX raus), fünf „dürfte“-Mutmaßungen. Prompt-Zusatz: unpassende Freigabe weglassen. Live geprüft: Ein Engel auf Erden, Yu-Gi-Oh 5D's.
- **Runde 34** (Stufe D): 150/150 eingespielt. Korrigiert: Das Powerteam (Hund statt „Marvel“/„Superhund“), vier „dürfte“-Mutmaßungen. Auffällig: Udta Punjab hat einen leeren Slug (`/de-de/film/-398535`). Live geprüft: Das Powerteam, Udta Punjab.
- **Runde 35** (Stufe D): 150/150 eingespielt (einer nach Kürzung unter 180 Wörtern einzeln nachgespielt). Korrigiert: Duck Dodgers (Marvin der Marsmensch), You Are My Hero (Kommentar zu fehlendem Stoff raus). Prompt-Zusatz: keine „dürfte“-Mutmaßungen. Live geprüft: Duck Dodgers, You Are My Hero.
- **Runde 36** (Stufe D): 150/150 eingespielt (Beauty and the Beast wegen Zahlprüfung einzeln nachgespielt). Korrigiert: Krokodil Gena (deutsche Namen Tscheburaschka, Schapokljak, Galja), El Materdor (Hook statt Mater), Tom-und-Jerry-Zählung, KonoSuba-Megumin (Bezug aufs Hauptwerk raus). Live geprüft: Krokodil Gena, Beauty and the Beast.
- **Runde 37** (Stufe D, letzte): 141/141 eingespielt; „Unser täglich Brot“ zählte serverseitig knapp unter 180 und ist erweitert nachgespielt. Korrigiert: Karlsson vom Dach (Lillebror/Karlsson), Lend a Paw (Micky Maus statt „Herrchen“), Trigun Stampede (falsche Kopfgeldsumme raus), Murnau (unbelegte Tonfilm-/Fox-Anekdote raus), Zenki („1,200“). Live geprüft: Der herzlose Retter, Unser täglich Brot. `pakete` meldet „Keine offenen Kandidaten“ – de-de-Langtexte vollständig.
- Prompt-Vorlage `backend/scripts/seo-auftrag-prompt.txt` um die drei Zusatzregeln (kein „dürfte“, deutsche Figurennamen, unpassende Freigabe weglassen) ergänzt.
- **Als Nächstes**: Lücken it/nl/pt-pt/en-gb (u. a. pt-pt movie:21868), danach Wikipedia/Wikidata-Vorschlag (Slug-Probleme „pok-mon“, leere Slugs wie -398535/-117987, „Yugi M?t?“) – beides nach Rückfrage.
- **Übersetzungslücken (14.10.2026)**: neuer Abo-Weg `backend/scripts/seo-uebersetzen-dateien.mjs` (pakete → Subagenten → einspielen, gleiche Prüfung wie seo-uebersetzen.mjs; Wortmuster-Prüfung für Übersetzungen abgeschaltet, englische Tausender korrigiert). Pilot: 8 Pakete × 10 (en-gb/it/nl/pt, Sonnet, je ~1–2,5 Min.), 80 von 81 eingespielt (nl movie:427641 abgelehnt). pt-pt movie:21868 neu, de-de-Text dazu von Meta-Sätzen bereinigt. Rest ≈ 13.400 (it 3.693, nl 4.060, pt 3.896, en-gb 1.829) + fr-fr 1.561 offen → Umfang mit Nutzer klären. Hinweis: ältere de-de-Texte enthalten teils Meta-Sätze („Schlagwort“, „vorliegende Angaben“), die mitübersetzt werden; TMDB-pt-Titel sind teils brasilianisch.

### Nachtrag 14.10.2026: Übersetzungslücken Welle 1 und 2
Welle 1 (160 Pakettexte): 158 live (en-gb 40, it 39, nl 39, pt 40). Welle 2 (40 Pakete × 10, Sonnet-Subagenten): 394 von 400 live, 0 Formatfehler. Abgelehnt (Zahlenprüfung, vermutlich Fehlalarm): en-gb movie:560057 („Big Hero 6“), it movie:7520 (11), nl movie:427641 („Journey 2“), nl series:1855 (70.000), pt series:30991 und movie:10220 („anos 2000“) – einzeln prüfen oder Zahlenprüfung für Titelziffern/Jahrzehnte lockern. Welle 3 (40 Pakete × 10): 395 von 400 live, 0 Formatfehler; abgelehnt (Zahlenprüfung, Fehlalarm): en-gb movie:560057 und series:1855, nl movie:427641, pt series:30991 und movie:10220. Wellen 4–11 per Workflow (Skript `seo-uebersetzen-wellen`, 8 Wellen à 40 Pakete): 3.119 live (je Welle 388–395, Rest abgelehnt: Zahlenprüfung-Fehlalarme, einmal 1 FORMAT). Welle 12 abgebrochen (Tageslimit): 22 von 40 Übersetzungen liegen unter scratchpad/auto/w9 (nicht eingespielt, Pakete bleiben offen). Rest: en-gb 1.071, it 2.859, nl 3.092, pt 3.123 (fr-fr 1.561 nicht angefangen). Auffällig: FBW-Bewertung („German Film and Media Evaluation“) steht in manchen en-gb-Texten; Altersfreigaben lassen die Subagenten weg.

### Nachtrag 14.10.2026: en-gb Kurztexte mit TMDB-Beschreibung
`seo-titel-kurztexte-lokal.mjs` setzt für en-gb die englische TMDB-Beschreibung (gekürzt auf ganze Sätze, max. ca. 600 Zeichen) als Handlungssatz ein. 16.431 neue Texte geschrieben; en-gb jetzt 93.326 Titeltexte, keiner unter 250 Zeichen, Sitemap 93.326 URLs (live geprüft, Stichproben `index,follow`). 3.899 Titel bleiben ohne Text (noindex). Gleiches für andere Sprachen offen: dort gibt es keine Beschreibung in der Zielsprache (nur Übersetzung per Langtext).

### Übersetzungslücken geschlossen (19.10.2026, live)
Mit Abo-Sonnet-Agenten in Runden à 10 Pakete × 25 (`seo-uebersetzen-dateien.mjs`, kein API-Geld) fertig für it-it, nl-nl, pt-pt, fr-fr, en-gb. Rest laut Messung: it 52, nl 17, pt 70, fr 17 – dauerhafte Ablehnungen der Faktenprüfung (Zahlen ohne Beleg wie Jahreszahlen/„103.000“) bzw. Format. en-gb: die letzten 91 „offenen“ sind kein Rest, sondern bereits übersetzte Texte unter 1.200 Zeichen (Englisch ist kürzer als Deutsch); das Maß `length ≥ 1200` zählt sie immer wieder als offen – nicht erneut fahren.

## Canonical/hreflang und Indexierung aller Locales (15.10.2026, live)
- Jede Landesversion hat ihren eigenen Canonical; hreflang-Cluster (`clusterAlternates` in `seoLocale.js`) nur zwischen indexierbaren Locales mit echtem Inhalt, x-default → de-de. Region-abhängige Seiten (Streaming, Kino, Anbieter-Bestenlisten) bleiben ohne Cluster.
- Index: es-es, it-it, nl-nl, pt-pt, de-at, de-ch, fr-ch, en-ca, fr-ca, en-us (Titel erst ab 250 Zeichen Text; pt-br bleibt inaktiv). robots.txt-Allow-Zeilen ergänzt.
- Sitemaps je Bereich ab 45.000 URLs in `…-titel-N.xml` geteilt (Google-Limit 50.000), gzip-Cache, Pfadwörter lokalisiert.
- Offen: Muttersprachler-Review der Texte, Anwaltsprüfung der Rechtstexte-Entwürfe, Near-Duplicate-Risiko der Landesversionen (in Search Console beobachten), kurze Titeltexte in de-de (12.033, de-de von der Schwelle ausgenommen), kurze Texte anderer Seitenarten ohne Längenschwelle. TMDB lokal nicht testbar.

## Land/Sprache konsistent für Nutzer, Crawler, Index (15.10.2026, live)
- **Prinzip:** `indexierbar` der `lade*`-Funktionen in `seoData.js` entscheidet allein; Sitemap nutzt dieselben Helfer. Test `seoSitemap.test.js` (Sitemap ⇔ Seite, hreflang-Ziele 200/index/Rück-Link, x-default nur mit Cluster); gegen live: `node backend/scripts/seo-konsistenz-live.mjs [Basis] [N]`.
- **Schwellen:** Streaming-Hub ≥3 Anbieter mit je ≥30 Titeln; Kino-Hub ≥10 aktuelle Filme mit Titelseite oder Städte vorhanden; Anbieter-Detail ≥10 Titel; Wochenseiten wie zuvor. Messung Etappe 0: Streaming-Hub in allen 41 Regionen über der Schwelle; Kino-Hub kippt nur de-at (6 Filme) auf noindex, CH 13 und CA 21 bleiben index. Kinoort-Seiten nur Region DE (de-at: 404, nicht in der Sitemap).
- **Start:** `/` bleibt die App, jetzt `noindex,follow`; neue indexierbare Sprachwahl `/international` (13 Links, hreflang auf alle Startseiten, x-default auf sich) ist x-default des Start-Clusters. Andere Cluster behalten x-default de-de.
- **Weitere Punkte:** Pfadwort `kino/neustarts` je Sprache (deutsches Wort in Fremdsprachen per 301); Titel-hreflang mit Slug je Locale; `?locale=` wird in der App übernommen, gespeicherte Wahl gewinnt; SEO-Seiten reichen `locale` an die App weiter, Flaggen führen zum Gegenstück; Sprachhinweis-Banner (`sprachhinweis.js`, nur bei anderer Sprache, schließbar, `mt.sprachhinweis`, kein Redirect/Cookie/IP; muss im Dockerfile einzeln kopiert werden); Bestenlisten-Unterseiten jetzt in den Nicht-de-Sitemaps.
- **Offen:** Sitemaps in der Search Console neu einreichen; Bestenlisten-Unterseiten der Nicht-de-Sitemaps 4 Wochen beobachten; `clusterAlternates` prüft die Indexierbarkeit der Zielseite nicht (hreflang auf eine noindex-Startseite möglich, falls einer Locale der Starttext fehlt – produktiv vorhanden); Kommentar zu `ARTEN_LOKALISIERT` in `seoLocale.js` veraltet.
- **Als Nächstes:** Cluster für regionsunabhängige Bestenlisten; weitere Unter-Slugs (Genre, Jahrzehnt, im Kino).

## Routen-Verzeichnis (15.10.2026, in Arbeit)
- `backend/lib/seoSeitenarten.js` beschreibt alle Seitenarten an einer Stelle (Routen, Pfadwörter, Sprachen, Cluster, Sitemap); Altlisten leiten sich schrittweise daraus ab. Jede Etappe verhaltensgleich, abgesichert durch `test/seoSeitenarten.golden.test.js` (Funktionen) und `test/seoSeitenarten.test.js` (Verzeichnis = Altwerte).
- Stand: Etappen 0–8 fertig (seoPfade, seoLocale, seoSitemap, seoRender, seoAufrufTyp und Konsistenztest lesen aus dem Verzeichnis; `seoSeitenartenDaten.js` hält die DB-Seite). Neue Seitenart = ein Eintrag in `SEITENARTEN` + ggf. `PFADWOERTER`, Route im Router in derselben Reihenfolge (Test prüft).
- Etappe 9 (live): Stadt-/Genre-/Anbieter-Schwellen sind gemeinsame Praedikate in `seoData.js` (Seite und `*FuerSitemap` nutzen dieselben); neu-auf/<Anbieter> `n>0` steckt in `indexierbar` der Daten, nicht mehr im Renderer; Umkehr-Test index <=> Sitemap in `seoSitemap.test.js`. Sitemap-Zahlen live vorher/nachher identisch.
- Offen: `hatSeitenart` gemischt benannt; Titel-Sitemap haengt an vorhandenem Text (`seo_content`), die Seite nicht (bewusst, Thin-Content-Schutz).

## Bestenlisten-Texte verlängert (19.10.2026, live)
- Alle 1.043 de-de-Bestenlisten haben jetzt einen Langtext (900–2.200 Zeichen; vorher oft ~430). Fächer-Verfahren mit Sonnet-Subagenten im Abo, kein API-Geld: `seo-bestenlisten-pakete.mjs` (53 Pakete à 20), Auftrag `seo-auftrag-bestenlisten.md`, `seo-bestenlisten-einspielen.mjs --verzeichnis DIR [--dry-run] [--sicherung DATEI]`. 5 Runden (220/200/200/200/223 Texte), 0 Ablehnungen.
- 233 vorher textlose Listen sind dadurch indexierbar und erscheinen in `sitemap-de-de-bestenliste.xml` (Katalog-Cache 1 h).
- Sicherungen der überschriebenen Texte: `/root/bl-sicherung-runde1.json` … `runde5.json` auf dem Server.
- Bekannte Schwächen: Schlusssätze wiederholen sich („Die Liste eignet sich für …“), einzelne Anbieter-Listen überschneiden sich inhaltlich (Anime-Titel). Möglicherweise falsches Genre bei „Willkommen bei den Louds“ in „Mystery auf WOW“ (Datenfrage, nicht Text).
- **Als Nächstes**: Personen de-de weiter (siehe unten), Übersetzungslücken (Titel de-de Stufe C ist erledigt, ~1.580 Titel bewusst ohne Langtext).

## Personen de-de per Fächer (19.10.2026, läuft)
- Verfahren wie Bestenlisten: `personen-pakete.mjs --pakete 10 --je 15 [--ausschluss-datei]`, Auftrag `seo-auftrag-personen.md`, `personen-selbstcheck.mjs`, `personen-einspielen.mjs --verzeichnis DIR [--dry-run]`. Texte mit Meta-Sätzen über den Katalog und Katalogfehler vor dem Einspielen von Hand entfernt.
- Runde 1: 119 live, Runde 2: 72 live (von je 150 Rollen). Bestand de-de Personen: 16.748. Offen ca. 1.680 Rollen.
- Runde 3: 65 live (von 150). Bestand de-de Personen: 16.813. Offen ca. 1.530 Rollen.
- Runde 4 (`--min-titel 3`): 72 live (von 150, 48 %; 74 geschrieben, Fearon und Brennan vom Server wegen unbelegter Zahlen abgelehnt bzw. vorab entfernt). Bestand de-de Personen: 16.885. Offen ca. 1.380 Rollen. Ausgelassen wurde vor allem wegen zu dünner Biografie (1–2 Titel) und Doku-only-Filmografie.
- Runde 5 (`--min-titel 3`): 79 live (von 150, 53 %; 81 geschrieben, Rob Mac und Ron Oliver vom Server wegen unbelegter Zahlen abgelehnt). Bestand de-de Personen: 16.964. Ausbeute sinkt; weitere Runden lohnen kaum noch.
- Runde 6 (`--min-titel 3`): 96 live (von 150, 64 %). Runde 7: 73 live (von 150, 49 %; 74 geschrieben, William Boyd und Gonzalo Vega vom Server wegen abgeleiteter Zahlen abgelehnt). Bestand de-de Personen: 17.133.
- Runde 8: 53 live (von 150, 37 %; 3 von 56 wegen Meta-Formulierung wieder gelöscht, später neu schreibbar). Bestand de-de Personen: 17.186. Ausbeute an der 35-%-Grenze, weitere Personen-Runden gestoppt.
- SEO-Fächer (Aufgabe 2, 20.10.2026): nichts mehr zu tun, Stufe B/C/D durch (Runden 26–29 liefen in anderen Sitzungen); offen nur 16 Titel Stufe B und 25 Stufe D, bewusst zu dünn.
- Reihen-Texte (501, 20.10.2026) geprüft und neu erzeugt: Vorlagentext zeigte als „am besten bewertet" eine Zahl unter dem Schnitt (Auswahl nach gewichteter Note, Anzeige TMDB-Wert; z. B. Apu-Trilogie) und nannte Titel in Fremdschrift (Golmaal). Jetzt Bestwert nach angezeigter Bewertung, Fremdschrift-Titel entfallen, neu: Auftakt und jüngster Teil mit Jahr sowie Bewertungsspanne (nur Katalogfakten, nichts erfunden). `seo-reihen-texte.mjs --neu` erzeugt vorhandene Vorlagentexte neu; Ø jetzt ~600 statt 400 Zeichen. Mehr Text wäre Füllstoff, weil TMDB-Collections keine Beschreibung liefern, die wir nutzen.
- Punkt 6 geprüft (20.10.2026): Kino-Stadt-Texte (469, Ø ~206 Zeichen) bleiben kurz, weil `cinema_cache` nur je Region Spielzeiten hat, nichts je Stadt; mehr Text wäre Füllstoff. Fix: doppelte Kinonamen in der Aufzählung (z. B. „Cineworld, Cineworld") entfernt, betroffene Texte neu erzeugt. Reihen-Texte (501, Ø 400) nicht angefasst.
- Rollenmismatch geklärt (19.10.2026): kein Katalogfehler. Die Rolle kommt aus dem Namensabgleich Regie/Besetzung und stimmt meist; TMDB-Biografien nennen die Zweitrolle nur nicht, und Regisseure treten in Dokus als sie selbst auf. Die niedrige Ausbeute kam aus meiner zu strengen Auslassregel im Agenten-Prompt (Runden 1–2). Echte Datenfehler sind selten (Namensvetter, z. B. Alan Dale, Richard Wilson).
- Restmenge ist dünn: meist 1–2 Titel, kurze Biografie, oft nur eine Doku. Runde 3 lag bei 44 %; 30 der 96 geschriebenen Texte wegen Meta-Sätzen oder Doku-only-Schauspielerrolle entfernt. Weitere Runden lohnen kaum; sinnvoller `--min-titel 3` oder die Restmenge lassen.
