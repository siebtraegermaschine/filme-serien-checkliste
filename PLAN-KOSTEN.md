# Claude schneller und günstiger nutzen — Analyse und Plan

> Stand 17.09.2026. Grundlage sind die Protokolle **aller 39 Claude-Code-Sitzungen**
> zu MovieTaste und CouchUltras seit dem 25.07.2026 (25.540 Modellschritte), die
> Produktionsdatenbank und das Repo. Beträge sind **API-Preis-Gegenwert** — über das
> Max-Abo zahlst du sie nicht direkt, sie sind aber genau das, was dein Nutzungs-
> kontingent aufbraucht.

> **Entscheidungen Christian, 17.09.2026:**
> - **SEO-Restmenge (nur `de-de`, ~9.300 Texte) einmalig über die Batch-API**,
>   Modell Sonnet 5. Kostenfreigabe bis **120 $** (Schätzung 60–100 $). Darüber
>   hinaus: anhalten und neu fragen. Hebt „Abo statt API" vom 18.08. auf.
> - Alle Empfehlungen aus Abschnitt 5–7 umsetzen, in kurzen Sitzungen auf Sonnet 5.
>   Zielkonflikte (schnell/günstig/Qualität) entscheidet Claude; **alles, was echtes
>   Geld kostet, braucht vorher Christians Freigabe.**

---

## 1. Wohin die Tokens bisher gingen

**Gesamt: rund 7.400 $ Gegenwert in acht Wochen.**

| Posten | Betrag | Anteil |
|---|---|---|
| **Kontext erneut lesen** (Cache-Lesen) | ~4.650 $ | 63 % |
| Kontext schreiben (neu oder nach Pause) | ~2.250 $ | 30 % |
| Eigentliche Antworten (Ausgabe) | ~500 $ | 7 % |

Der Großteil ist also **nicht** das, was Claude schreibt, sondern dass bei jedem
Schritt der gesamte bisherige Chat neu gelesen wird.

### Nach Kontextgröße des Schritts

| Kontext beim Schritt | Schritte | Kosten | je Schritt |
|---|---|---|---|
| unter 100k | 5.175 | 801 $ | 0,15 $ |
| 100–300k | 7.387 | 1.346 $ | 0,18 $ |
| 300–600k | 7.374 | 2.457 $ | 0,33 $ |
| **über 600k** | 5.356 | **3.071 $** | **0,57 $** |

Fast jede Sitzung lief bis kurz vor 1 Million Token. **27 von 39 Sitzungen liefen
über mehrere Tage** (86 % der Kosten); Spitzenreiter: 1.808 Schritte über neun Tage.

### Nach Modell

| Modell | Kosten | Bemerkung |
|---|---|---|
| Opus 5 | 3.841 $ | Standard |
| **Fable 5 / 5.1** | **2.891 $** | doppelter Opus-Preis — Internationalisierung, CouchUltras-Features, Rechtsprüfung |
| Sonnet 5 | 609 $ | nur Ende Juli genutzt |
| Opus 4.x | 59 $ | |

Subagenten liefen zu 95 % auf Opus 5 und Fable 5.1 (1.100 $), nur 152 Aufrufe auf Sonnet.

### Nach Aufgabenart

| Art | Sitzungen | Kosten |
|---|---|---|
| **SEO-Texte / SEO-Seiten** | 4 | **2.034 $** |
| Feature- und Fehlerarbeit | 16 | 2.282 $ |
| Start mit „lies alle Übergaben / was ist offen" | 11 | 1.727 $ |
| CouchUltras / Sport | 8 | 1.356 $ |

---

## 2. Wo unnötig Tokens verbraucht werden

### 2.1 Lange, gemischte Chats — der größte Hebel
Eine Sitzung wandert über Tage durch mehrere Themen (Beispiel: die Sitzung vom
19.08. — Social-Plan → Fußball-Knopf → Crawl-Prüfung → Guthaben-Frage → diese
Analyse). Jeder Schritt zur Crawl-Prüfung bezahlt den ganzen Social-Plan mit.
Dazu: Nach einer Pause über einer Stunde verfällt der Cache, und der **ganze**
Verlauf wird zum doppelten Eingabepreis neu geschrieben. „Erneut versuchen" bei
großem Kontext kostet jedes Mal einen vollen Schritt.

### 2.2 Teure Modelle für einfache Arbeit
Knöpfe umbenennen, Texte tauschen, Logo ersetzen, Deploy prüfen — das kann Sonnet 5
(40 % des Opus-Preises) genauso. Fable (200 % des Opus-Preises) lief für
Umsetzungsarbeit, die kein Spitzenmodell braucht.

### 2.3 `index.html` — 841 kB, ~240.000 Token, 935-mal gelesen
Die meistgelesene Datei. Ein Lese-Abschnitt von 2.000 Zeilen sind ~34.000 Token,
die danach bei jedem Schritt mitgelesen werden. Aufbau:

| Teil | Größe |
|---|---|
| **Kommentare** (Entscheidungsgeschichte „Christian, 24.08.2026: …") | **~216 kB (26 %)** |
| **Übersetzungen** (7 Sprachen) | **~201 kB (24 %)** |
| übriges JavaScript | ~292 kB |
| CSS | 86 kB |
| HTML | 46 kB |

Die Hälfte jedes Lesevorgangs ist Geschichte oder eine Sprache, um die es gerade
nicht geht.

### 2.4 Übergabe- und Plandokumente — ~87.000 Token
`UEBERGABE-OFFEN.md` allein ~20.000 Token, dazu 15 weitere Dateien. Elf Sitzungen
begannen mit „lies alle Übergaben / was ist offen" und trugen diese Menge dann
durch die gesamte Sitzung. Die Dokumente sind nach Datum gewachsen
(`0.0.0.0.0.0 …`) — viel Geschichte, wenig aktueller Stand.

### 2.5 Mitgeladene Skills und Anbindungen — bei jedem Schritt
Laut Kontextanzeige heute rund **30.000 Token pro Schritt**, die mit diesem Projekt
nichts zu tun haben:
- **51 lokale Skills** in `~/.claude/skills` (~4.000 Token Beschreibungen):
  u. a. `investor-materials`, `x-api`, `video-editing`, `fal-ai-media`,
  `nextjs-turbopack`, `bun-runtime`, `crosspost`, `last30days`, `huashu-design`.
- **Plugin-Skills aus der Desktop-App**: sales, legal, finance, small-business,
  zoom, marketing, product-management, customer-support, common-room, apollo …
- **MCP-Anbindungen**: Shopify, Gmail, Notion, Canva, Google Drive — plus rund
  40 Server, die nicht angemeldet sind und trotzdem Hinweistexte erzeugen.

Einzeln klein, aber es steckt in jedem der 25.000 Schritte.

### 2.6 Browser-Screenshots statt Textauslesen
795 Screenshots. Für die meisten Prüfungen reicht `read_page` / `get_page_text`
(Text statt Bild) — Screenshots nur als Nachweis am Ende.

---

## 3. Die SEO-Texte im Detail

**Heutiges Verfahren** (UEBERGABE-SEO.md 3b, `scripts/seo-runde.sh`):
Eine interaktive Sitzung (Opus 5 / Fable 5.1) holt 10 Pakete à 15 Titel, startet
10 parallele Subagenten (**Opus 5**), jeder liest die 10.000-Zeichen-Anweisung und
sein Paket, schreibt 15 Texte, prüft sich selbst „bis nichts zu beanstanden",
dann prüft ein Skript, dann wird eingespielt. Die Steuersitzung läuft über Tage
bis ~940k Kontext.

**Gemessen:** Sitzung 16.–17.09.: **374 $ für 3.753 Texte ≈ 0,10 $ je Text** —
plus deine Zeit fürs Anstoßen jeder Runde.

**Warum das viel zu teuer ist:** Die Aufgabe ist eine reine Umformung
*Datensatz → Text*. Eigenes Modellwissen und Recherche sind **ausdrücklich
verboten**. Genau dafür braucht es kein Spitzenmodell — nur Regeltreue, und die
prüfen die Skripte ohnehin mechanisch.

**Unnötige Teilschritte:**
1. **Opus als Schreiber** — Sonnet 5 oder Haiku 4.5 reichen für Umformung nach festem Schema.
2. **Selbstprüfung durch dasselbe Modell** — verdoppelt die Ausgabe; `seo-runde.sh pruefen`,
   `seo-einspielen.mjs` und `seo-batch-pruefen.mjs` prüfen Länge, Quellwörter, Zahlen
   und Eigennamen bereits mechanisch. Nur Beanstandetes neu schreiben lassen.
3. **Steuersitzung mit wachsendem Verlauf** — die Runden sind voneinander unabhängig;
   jede Runde kann eine frische, kurze Sitzung oder gleich ein Skript sein.
4. **Überhaupt ein Chat** — für Tausende gleichartige Texte ist ein Skript das Werkzeug.

**Restmenge:** Laut UEBERGABE-SEO am 19.08. 13.026 offen (Stufe B), seitdem
3.753 geschrieben → **rund 9.300 deutsche Texte übrig**.

| Weg | Kosten für ~9.300 Texte | Kontingent | Deine Zeit |
|---|---|---|---|
| Heute: Fächer im Abo, Opus 5 | ~930 $ Gegenwert | ja, viel | jede Runde anstoßen |
| Fächer im Abo, **Sonnet 5**, ohne Selbstprüfung, frische Sitzung je Runde | grob 200–300 $ Gegenwert | ja | jede Runde anstoßen |
| **`seo-batch.mjs`, Sonnet 5, Messages-API mit Caching** (so gebaut) | ~110 $ **echt** | nein | einmal starten |
| dasselbe über die **Batch-API** (50 % Rabatt, Umbau ~½ Tag) | **~55 $ echt** | nein | nachts, unbeaufsichtigt |
| Batch-API mit **Haiku 4.5** (vorher 50 Texte testen) | ~30 $ echt | nein | nachts |

Überschlag je Text: ~3.000 Token Anweisung (gecacht), ~1.000 Token Datensatz,
~900 Token Ausgabe.

**Einordnung der Entscheidung vom 18.08. („Abo statt API"):** Der Abo-Weg ist nicht
kostenlos — er verbraucht das Kontingent, das dir diese Woche für die eigentliche
Entwicklung fehlt (heute: Wochenlimit 77 %, Fable 100 %), und er braucht dich als
Anstoßer. **Für die Restmenge ist der Batch-Weg mit ~55 $ echtem Geld der
günstigste Gesamtweg.** Mit Ausgabenlimit in der Claude Console bleibt das
Risiko gedeckelt. Sieben Sprachen kosten entsprechend etwa das Siebenfache.

---

## 4. Was wo laufen sollte

| Aufgabe | Wo | Modell | Warum |
|---|---|---|---|
| Crawls, Wache, Sicherung | **GitHub Actions / Server** (läuft schon) | keins | Skripte kosten 0 Token — so lassen |
| SEO-Massentexte | **Server, nächtlicher Batch** | Sonnet 5 / Haiku 4.5 | unbeaufsichtigt, kein Kontingent |
| Planen, Architektur, knifflige Fehler | **Desktop-App, lokal** | Opus 5 (Fable nur bei echten Härtefällen) | braucht Urteilskraft |
| Umsetzen nach Plan, Texte tauschen, Deploy prüfen | **Desktop-App, frische Sitzung** | **Sonnet 5** | 40 % des Opus-Preises |
| Suchen, Zusammenfassen, Status lesen | **Subagent** | **Haiku 4.5 / Sonnet 5** | Ergebnis zählt, nicht der Weg |
| Wiederkehrende Prüfberichte (z. B. wöchentlich) | **Cloud-Routine** | Sonnet 5 / Haiku 4.5 | läuft ohne dich; verbraucht Abo-Kontingent, Tageslimit an Läufen |

**Cloud-Routinen** (claude.ai/code/routines, verifiziert): nutzen das Abo-Kontingent,
Modell je Routine wählbar, tägliche Obergrenze an Läufen, pushen auf `claude/`-Zweige,
Zugangsdaten über Umgebungsvariablen. SSH-Zugriff auf den Server ist nicht
dokumentiert — für Datenbankarbeit bleibt der Server-Cron der bessere Ort.

**Headless (`claude -p --model sonnet`)** funktioniert lokal mit dem Abo-Login;
für GitHub Actions sehen die Dokumente einen API-Schlüssel vor. Der Mac schläft
nachts — für echten 24-Stunden-Betrieb daher Server oder Routine, nicht der Rechner.

---

## 5. Die ideale Arbeitsweise

### Ein Auftrag in drei Schritten
1. **Planen** — neue Sitzung, Opus 5 (oder `/model opusplan`: Opus plant, Sonnet setzt
   um). Ergebnis ist eine kurze Checkliste in `docs/plaene/<thema>.md`. Sitzung zu.
2. **Umsetzen** — neue Sitzung, **Sonnet 5**: „Setze `docs/plaene/<thema>.md` um."
   Liest nur den Plan und die betroffenen Stellen.
3. **Prüfen und live stellen** — in derselben Sitzung, dann `/clear`.

### Regeln
- **Ein Thema = eine Sitzung.** Themenwechsel → neue Sitzung oder `/clear`.
- **Auto-Compact auf 200k** statt fast 1 Million: einmal `/autocompact 200k`
  eingeben (gilt laut Doku für alle künftigen Sitzungen; nimmt der Desktop-Chat
  den Befehl nicht an, im Terminal mit `claude`).
- **Status statt Archiv:** Eine kurze `STATUS.md` (≤150 Zeilen: offen /
  entschieden / als Nächstes). Alte Übergaben nach `docs/archiv/`. Nie mehr
  „lies alle Übergaben".
- **Eine knappe `CLAUDE.md`** (~60 Zeilen) mit den festen Regeln: Deutsch,
  Deploy = Push, SSH-Befehle, Terminologie, „Sonnet für Subagenten". Wird
  automatisch geladen, ersetzt das Einlesen vieler Dokumente.
- **Subagenten mit festem günstigem Modell**: eigene Agenten-Definitionen in
  `.claude/agents/` mit `model: sonnet` bzw. `model: haiku`.
- **Massenarbeit nie im Chat** — Skript oder Batch.
- **Screenshots nur als Nachweis**, sonst Seitentext lesen.
- Bei Abbruch lieber kurz neu formulieren als „Erneut versuchen" bei riesigem Kontext.

---

## 6. Maßnahmen nach Aufwand und Wirkung

| # | Maßnahme | Aufwand | Wirkung (Schätzung) |
|---|---|---|---|
| 1 | `/autocompact 200k`, ein Thema je Sitzung | sofort | **−35 bis −45 %** auf alle Entwicklungsarbeit |
| 2 | Sonnet 5 als Standard für Umsetzung, Opus zum Planen, Fable nur gezielt | sofort | **−40 bis −50 %** auf Umsetzungsschritte |
| 3 | SEO-Restmenge per Batch-API über den Server | ½ Tag | ~900 $ Kontingent frei, ~55 $ echt |
| 4 | Nicht benötigte Skills, Plugins und MCP-Anbindungen abschalten | 30 min | bis ~30k Token je Schritt weniger |
| 5 | `CLAUDE.md` + `STATUS.md`, Übergaben archivieren | 1–2 h | Einstiegssitzungen ~20–90k Token leichter |
| 6 | Subagent-Definitionen mit `model: sonnet` / `haiku` | 30 min | Subagenten −60 bis −80 % |
| 7 | `index.html`: Übersetzungen in eigene Dateien, Geschichte aus Kommentaren in die Commits | 1–2 Tage, mit Tests | jedes Lesen der Datei etwa halb so teuer |

**Überschlag auf deinen echten Daten:** SEO aus dem Abo heraus (−2.000 $), dann auf
den Rest Kontextdisziplin (~−40 %) und Modellmix (~−45 %) — **aus ~7.400 $ Gegenwert
werden grob 1.500–2.500 $** für dieselbe Arbeit, plus ~55 $ echte API-Kosten für
die SEO-Texte. Das ist eine Schätzung, keine Messung; die Einzelhebel oben sind
aus den Protokollen belegt.

---

## 7. Über die Kosten hinaus: zeitgemäße Arbeitsweise mit Claude

> Ergänzt am 17.09.2026 auf Christians Frage nach Best Practice für Struktur,
> Artefakte, Routinen, Skills, Connectoren, Planung, Umsetzung und Prüfung.

**Kurzurteil:** Das Produkt ist solide gebaut — Wache, Sicherungen, Tests,
ausführliche Commits, Crawls ohne Tokens. Nicht mehr zeitgemäß ist der
Arbeitsrahmen: Marathon-Chats als Gedächtnis, Übergabe-Dokumente als Ersatz dafür,
jeder Push geht ungeprüft live, und eine 840-kB-Datei. **Weiterbauen: ja. So
weiterarbeiten: nein.**

### 7.1 Struktur
- **`CLAUDE.md` im Repo** (~60 Zeilen, versioniert) statt Wissen verteilt auf
  10 Memory-Dateien und 16 Dokumente. Memory nur noch für Persönliches.
- **Dokumente nach Zweck trennen:** `STATUS.md` (aktueller Stand),
  `docs/entscheidungen/` (je Entscheidung eine Seite mit Grund und Datum, z. B.
  „Abo statt API", „Seiten = beanspruchte Unterseiten"), `docs/archiv/` (Altes).
- **Die Entstehungsgeschichte gehört in die Commits**, nicht in Code-Kommentare
  oder Übergaben.
- **`index.html` in Module aufteilen** (`js/`, `css/`, `i18n/de.json` …, ohne
  Build-Schritt möglich). Claude liest dann 20 kB statt 120 kB.
- **Freigaben aufräumen:** heute 801 Einzelfreigaben in `settings.local.json`.
  Besser wenige Muster in einer versionierten `.claude/settings.json`; der Skill
  `/fewer-permission-prompts` fasst sie aus den Protokollen zusammen.

### 7.2 Artefakte
- **Faustregel:** Was Claude beim Arbeiten lesen muss → Markdown im Repo. Was du
  lesen, durchklicken und entscheiden sollst → Artifact.
- **Entscheidungsvorlagen** (z. B. F1–F20 aus `PLAN-SOCIAL.md`) als Seite mit
  Ankreuzfeldern und Kommentaren; Claude liest die Auswahl zurück, statt dass
  Nummern diktiert werden.
- **Status-Seiten** für SEO-Fortschritt, Crawl-Status je Region und KPIs — heute
  per SSH in teuren Chats abgefragt. Einmal gebaut (oder `kpi.html` erweitert),
  kostet der Blick keine Tokens mehr.

### 7.3 Routinen
- **Nur für Aufgaben mit Urteil**, z. B. wöchentlich Wache-Meldungen,
  fehlgeschlagene Workflows und Fehler-Logs lesen und daraus ein GitHub-Issue mit
  Befund machen — auf Sonnet oder Haiku.
- **Alles Mechanische bleibt Skript.** Die Wache hätte den ES-Ausfall allein
  melden können, wenn sie je Region gemessen hätte.
- Routinen pushen auf `claude/`-Zweige — passt zum PR-Ablauf in 7.8.

### 7.4 Skills
- **Weniger, aber eigene.** Die 51 allgemeinen Skills archivieren, stattdessen
  4–5 Projekt-Skills unter `.claude/skills/`: `deploy-und-live-pruefen`,
  `server-db-abfrage`, `seo-runde`, `import-status-pruefen`,
  `uebersetzung-ergaenzen` (7 Sprachen).
- Beim Start wird nur die Beschreibung geladen (~100 Token), der Inhalt erst bei
  Nutzung; `model:` im Kopf legt das Modell fest (z. B. Sonnet für die SEO-Runde).
- **Neue Gewohnheit:** Nach einer schwierigen Aufgabe „mach daraus einen Skill"
  statt einer Übergabe-Datei.

### 7.5 Connectoren
- **Nur anbinden, was das Projekt nutzt:** GitHub und SSH. Shopify, Gmail,
  Notion, Canva, Zoom und Sales/Legal gehören nicht in diesen Arbeitsbereich.
- **`gh` auf dem Mac installieren.** Ohne `gh` waren am 25.08. die Logs des
  fehlgeschlagenen ES-Jobs nicht lesbar (403 über die öffentliche API).
- **Neu und wertvoll:** Google Search Console und das seit `d48ad24` eingebaute
  Analytics. Ob es fertige Connectoren gibt, ist nicht geprüft; ein CSV-Export
  reicht auch.

### 7.6 Planung
- **Aufgaben als GitHub-Issues** mit „fertig, wenn …". Eigene Plan-Dokumente nur
  für Vorhaben über ~2 Tage.
- **Planen im Plan-Modus mit Opus**, Ergebnis eine Checkliste in Schritten, die
  je in eine Sitzung und einen PR passen.
- **Entscheidungen gesammelt vorab einholen** — beim Social-Plan hat das gut
  funktioniert; beim Bauen sollen keine Grundsatzfragen mehr offen sein.
- **Messen, bevor man skaliert — der wichtigste Zusatzpunkt.** Bevor die
  restlichen ~9.300 SEO-Texte entstehen: Bringen die 11.000 vorhandenen Seiten
  Impressionen und Klicks? Vier Wochen Search-Console-Daten entscheiden, ob
  Stufe B lohnt. Das kann den größten Kostenblock ganz einsparen. Dieselbe Frage
  gilt für Social bei 9 Konten.

### 7.7 Umsetzung
- **Ein Auftrag = ein Worktree/Zweig = eine Sitzung.** Verhindert, dass
  parallele Sitzungen sich Commits unterschieben (so geschehen am 17.08.).
- **Sonnet 5 als Standard**, Aufgaben so geschnitten, dass die Sitzung unter
  ~200k Kontext bleibt.
- **Bei Logik zuerst der Test** (Ingest, Wache, Match). Ein Test „eine Region
  veraltet → Meldung" hätte die Wache-Lücke sofort gezeigt.
- **Mehrere Agenten nur für wirklich unabhängige Arbeit**, mit günstigem Modell
  je Stufe.
- **Kommentare:** das Warum in 1–3 Zeilen; Datum und „Christian sagte" gehören in
  die Commit-Nachricht.

### 7.8 Prüfung — der größte Qualitätshebel
**Heute gilt: Push = sofort live, ohne Tests.** `deploy.yml` hat keinen
Testschritt, die 17 Testdateien laufen nirgends automatisch, Browser-Tests gibt
es nicht.

1. **CI-Workflow:** Tests mit Postgres-Service bei jedem Push; Deploy nur bei Grün.
2. **Pull-Requests statt direkt auf `main`**, auch allein: Claude öffnet den PR,
   CI läuft, vor dem Merge `/code-review`, CI-Fehler per Auto-Fix zurück, Merge
   per Klick. `/code-review ultra` (Cloud, kostenpflichtig) nur für große Umbauten
   wie Beanspruchen oder Nachrichten.
3. **Playwright-Tests für die Kernabläufe:** Suche, Watchlist, Einladen/Match,
   Kino, SEO-Seite indexierbar. Sie ersetzen die bisher 795 Screenshot-Prüfungen
   in Chats und laufen kostenlos in der CI.
4. **`security-review` vor den Social-Funktionen** — ab Konten, Beanspruchen und
   Nachrichten geht es um fremde Daten und Inhalte.

### 7.9 Prioritäten zusätzlich zu Abschnitt 6

| # | Maßnahme | Wirkung |
|---|---|---|
| A | Search Console auswerten, bevor weitere SEO-Texte entstehen | potenziell größte Ersparnis |
| B | CI-Tests plus PR-Ablauf | größte Qualitätsverbesserung |
| C | `CLAUDE.md` und Projekt-Skills statt Memory-Notizen und Übergaben | schnellerer, günstigerer Einstieg in jede Sitzung |
| D | Ein Worktree je Auftrag | keine vermischten Commits bei parallelen Sitzungen |
| E | `index.html` aufteilen | jede Frontend-Aufgabe günstiger (siehe auch Abschnitt 6, #7) |

---

## Quellen

- [Claude Code: Routines](https://code.claude.com/docs/en/routines.md)
- [Claude Code: Headless](https://code.claude.com/docs/en/headless.md)
- [Claude Code: Subagents](https://code.claude.com/docs/en/sub-agents.md)
- [Claude Code: Model configuration (`opusplan`, `/autocompact`, Effort)](https://code.claude.com/docs/en/model-config.md)
- [Claude Code: Prompt caching (Cache-Dauer im Abo)](https://code.claude.com/docs/en/prompt-caching.md)
- [Claude Code: Context window](https://code.claude.com/docs/en/context-window.md)
- [Claude API: Preise, Batch-Rabatt, Caching](https://platform.claude.com/docs/en/about-claude/pricing)
