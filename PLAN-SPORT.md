# Live-Sport in MovieMatch — Plan und Recherche (Fußball Deutschland zuerst)

> Stand 19. August 2026, dritte Fassung. **Phasen 1–3 sind umgesetzt** (Commit
> vom selben Tag): `sport-rechte.json` + `backend/lib/sportRechte.js` (Regel-
> Engine, getestet in `backend/test/sportRechte.test.js`), `sport-fetch.mjs`,
> `backend/routes/sport.js` (+ Tabellen `sport_matches`/`sport_meta`,
> `users.sport_abos`), GitHub Action `sport.yml` (nutzt das vorhandene
> CINEMA_INGEST_SECRET, kein neues Server-Secret nötig), Sport-Tab ⚽ samt
> Vollseite, Wettbewerbs-/Free-TV-Filter und „Meine Abos"-Abgleich in
> `index.html`. Free-TV-Picks der 1. Pokalrunde und das Sat.1-Eröffnungsspiel
> sind als Ausnahmen eingetragen. Offen: Wochenpflege-Routine (5b) aktivieren,
> Phase 4 (Länderspiele/Turniere, SEO-Unterseiten).
>
> Hinweis aus der Umsetzung: OpenLigaDB führt die CL 2026/27 bereits (`ucl`,
> noch leer bis zur Auslosung Ende August); die Europa League pflegt die
> Community erfahrungsgemäß lückenhaft — 2025/26 lag nur die K.-o.-Phase vor.
> Falls das so bleibt, greift E5 (Zweitquelle, vorher Rückfrage).

---

## 0. Entscheidungsstand (Christian, 19. August 2026)

- **E1 — Umfang: direkt alles.** Bundesliga, 2. Bundesliga, DFB-Pokal,
  Champions League, Europa League — die Phasen 1–3 werden als ein Auftrag
  umgesetzt. *(Annahme: Länderspiele/Turniere und SEO-Unterseiten, Phase 4,
  folgen danach — bei Bedarf korrigieren.)*
- **E2 — Tab-Name: „Sport“.**
- **E3 — „Meine Abos“: ja**, Datenmodell von Anfang an dafür ausgelegt,
  Abgleich (✅ Kannst du sehen / 🔒 bräuchte Abo X) wird mitgebaut.
- **E4 — Preise: nur frei/Abo-Name**, keine Euro-Beträge.
- **E5 — Zweitquelle: vorerst nicht zukaufen.** OpenLigaDB als einzige
  Quelle; erst bei nachgewiesenen Lücken neu entscheiden (Rückfrage vorher).
- **Wochenpflege: übernimmt Claude als geplante Routine** (Abschnitt 5b).
  Anfangs per Pull Request zur Gegenprüfung, nach Bewährung Direkt-Commit.

---

## 1. Das Problem

Wer ein Fußballspiel sehen will, muss heute drei Fragen einzeln beantworten:

1. **Wo** läuft das Spiel? (Sky, DAZN, Amazon, Sat.1, RTL, ARD, ZDF, …)
2. **Kostet** es etwas — und wenn ja, **in welchem Abo** ist es enthalten?
3. **Wann** ist Anstoß?

Die App soll das an einer Stelle beantworten — zunächst nur für **Fußball in
Deutschland**, später weitere Sportarten und Länder.

---

## 2. Recherche: Wo gibt es die Daten?

Die Aufgabe zerfällt in **drei getrennte Datenprobleme** mit sehr
unterschiedlicher Verfügbarkeit:

### 2a. Spielpläne und Anstoßzeiten — **gelöst, kostenlos verfügbar**

**OpenLigaDB** (https://api.openligadb.de) ist ein freies Community-Projekt,
JSON-API ohne Schlüssel, ohne Kosten. Am 19.08.2026 live geprüft — verfügbar
sind u. a.:

| Wettbewerb | Kürzel | Saison 2025/26 |
|---|---|---|
| 1. Bundesliga | `bl1` | ja (auch `bl12027` schon angelegt) |
| 2. Bundesliga | `bl2` | ja |
| 3. Liga | `bl3` | ja |
| DFB-Pokal | `dfb` | ja |
| Champions League | `ucl` | ja |
| Europa League | `uel` | ja |
| WM 2026 | `wm2026` | ja |
| Nations League | `nla` | ja |

Abruf z. B. `GET https://api.openligadb.de/getmatchdata/bl1/2025/1` → Teams,
Anstoßzeit, Ergebnis, Spieltag. **Einschränkung:** Community-gepflegt — bei
`bl1`/`bl2`/`dfb` sehr zuverlässig (viele Apps hängen dran), bei
internationalen Wettbewerben gelegentlich lückenhaft/verspätet.

**Alternativen als Absicherung:**
- **football-data.org** — Gratis-Stufe (10 Anfragen/min) deckt Bundesliga,
  Champions League, EM/WM ab; **kein DFB-Pokal** in der Gratis-Stufe.
- **API-Football (api-sports.io)** — kommerzielle API, sehr vollständig und
  schnell aktualisiert, ab ca. 25 €/Monat. Kandidat, falls OpenLigaDB bei
  UCL/UEL zu unzuverlässig ist. **Keine deutsche Sender-Info.**

### 2b. Sender pro Spiel — **NICHT als API verfügbar** (der Kern des Problems)

Ergebnis der Recherche: **Es gibt keine öffentliche API, die pro Spiel den
deutschen Übertragungssender liefert.** Weder OpenLigaDB noch football-data
noch API-Football führen deutsche Sender. Die Bundesliga-App und kicker.de
zeigen es an, bieten aber keine API; Scraping wäre rechtlich und technisch
wacklig (dazu unten).

**Die gute Nachricht:** Die Sender-Zuordnung ist in Deutschland zum größten
Teil **regelbasiert** — die Rechte sind pro Wettbewerb und Anstoß-Slot fest
vergeben. Wer Wettbewerb + Wochentag + Uhrzeit kennt (und das liefert der
Spielplan), kennt fast immer den Sender.

**Rechtelage 2025/26 bis 2028/29 (recherchiert, Quellen unten):**

| Wettbewerb | Slot | Sender | Ableitbar aus Spielplan? |
|---|---|---|---|
| Bundesliga | Fr 20:30 | Sky/WOW | ✅ automatisch |
| Bundesliga | Sa 15:30 Einzelspiele | Sky/WOW | ✅ automatisch |
| Bundesliga | Sa 15:30 Konferenz | DAZN | ✅ automatisch |
| Bundesliga | Sa 18:30 Topspiel | Sky/WOW | ✅ automatisch |
| Bundesliga | So (15:30/17:30/19:30) | DAZN | ✅ automatisch |
| Bundesliga | Eröffnung, Fr vor/nach Winterpause, Relegation, Supercup | Sat.1 (frei) zusätzlich | ⚠️ Handvoll Termine/Saison, einmalig eintragen |
| 2. Bundesliga | alle | Sky/WOW | ✅ automatisch |
| DFB-Pokal | alle | Sky/WOW | ✅ automatisch |
| DFB-Pokal | ausgewählte Spiele je Runde | ARD/ZDF (frei) zusätzlich | ✋ wird je Runde bekannt → Pflege nötig |
| Champions League | Di Topspiel | Amazon Prime | ✋ Amazon wählt je Woche → Pflege nötig |
| Champions League | alle übrigen + Mi | DAZN | ✅ automatisch (Rest-Regel) |
| Champions League | Finale | zusätzlich ZDF (frei) | ✅ ein Termin |
| Europa/Conference League | alle | RTL+ (einzelne frei auf RTL/Nitro) | ⚠️ Free-TV-Picks je Woche → Pflege |
| Länderspiele/EM-Quali | — | ARD/ZDF/RTL je Fenster | ⚠️ wenige Termine, je Fenster eintragen |
| WM/EM-Turniere | — | ARD/ZDF, Teil MagentaTV | ✋ Aufteilung pro Spiel, aber kurzer Zeitraum |

⚠️ **Wichtig für die Architektur:** Ab **2027/28** wechseln die Rechte massiv
(Champions League → Paramount+ und Amazon, DAZN verliert sie komplett;
Europa/Conference League → DAZN). Die Regeln dürfen deshalb **nicht in Code
gegossen** werden, sondern gehören als **versionierte Rechte-Matrix pro
Saison** in eine Datei/Tabelle.

**Fazit 2b:** ~90 % der Spiele bekommen ihren Sender automatisch aus der
Rechte-Matrix. Die restlichen ~10 % (Amazon-Dienstagspick, Free-TV-Spiele bei
Pokal und Europa League) brauchen eine **kleine redaktionelle Pflege** —
geschätzt **5–10 Minuten pro Woche** über eine simple Admin-Eingabe.

**Verworfene Alternative — Scraping:** kicker.de-TV-Programm oder Seiten wie
wheresthematch.com abgreifen. Verworfen, weil: AGB-/urheberrechtlich riskant,
bricht bei jedem Redesign, und die Datenqualität hinge an einem Dritten, den
wir nicht kontrollieren. Bleibt als Notnagel denkbar, ist aber kein Fundament.

### 2c. Abo- und Kosteninfo — **statisch, selbst pflegbar**

Welches Abo was kostet und was enthält, ändert sich selten (~1–2× pro Saison).
Das ist eine **handgepflegte Anbieter-Tabelle** im Repo (analog zur
bestehenden Anbieterlogik in `backend/lib/anbieter.js`):

| Anbieter | Typ | Enthält (Fußball) |
|---|---|---|
| Sky/WOW | Abo | BL (~80 %), 2. BL komplett, DFB-Pokal komplett |
| DAZN | Abo | BL-Konferenz + Sonntag, CL (bis 26/27) |
| Amazon Prime | Abo | CL-Topspiel Dienstag |
| RTL+ | Abo | EL/ECL (bis 26/27) |
| MagentaTV | Abo | Turnier-Anteile |
| ARD/ZDF/Sat.1/RTL/Nitro | **frei** | Pokal-Picks, Highlights, Supercup, Länderspiele, Turniere |
| Paramount+ | Abo (ab 27/28) | CL-Großteil |

Preise würde ich bewusst **nicht** hart anzeigen (ändern sich laufend,
Aktionspreise), sondern nur **frei / im Abo X enthalten** plus Link zum
Anbieter. Optional später: grobe Preisangabe mit „Stand“-Datum.

---

## 3. Vorschlag Architektur (passend zum Bestand)

Gleiche Mechanik wie der Kino-Bereich — bewährt und schon zweimal gebaut:

1. **`sport-fetch.mjs`** (GitHub Action, täglich + öfter am Spieltag):
   holt Spielpläne von OpenLigaDB, wendet die Rechte-Matrix an,
   POST an `/api/sport/ingest` (Secret-Auth, analog `cinema-fetch.mjs`).
2. **Rechte-Matrix** als JSON im Repo (`sport-rechte.json`): pro Saison,
   pro Wettbewerb, Regeln (Wochentag/Uhrzeit → Sender) + Ausnahmen-Liste
   (matchId → Sender) für die Pflege-Fälle.
3. **Backend** `backend/routes/sport.js`: Ingest + Auslieferung
   (`GET /api/sport/matches?von=…&bis=…`), Tabellen `sport_matches`,
   `sport_broadcasts` in Postgres.
4. **Pflege-Eingabe** für die ~10 % Ausnahmen: zum Start reicht das Bearbeiten
   der Ausnahmen-Liste im Repo (Commit → Action → live); ein Admin-Formular
   kann später folgen.
5. **Frontend**: neuer Bereich in `index.html` (siehe 4.).

Kein neuer externer Dienst, kein API-Schlüssel nötig (OpenLigaDB ist offen) —
erst falls die Qualität bei UCL/UEL nicht reicht, käme API-Football als
kostenpflichtige Zweitquelle ins Spiel (**vorher fragen**, wie beim
SEO-Batch-Skript vereinbart).

---

## 4. Vorschlag Anzeige in der App

### Einstieg
Vierter Tab neben 🎬 Filme, 📺 Serien, 🍿 Kino: **⚽ Sport** (Arbeitstitel;
Alternativen: „Live“, „Fußball“ — bei „Fußball“ müsste der Tab später für
andere Sportarten umbenannt werden, deshalb Empfehlung „Sport“).

### Aufbau (analog Kino: „Aktuell / In Kürze / Bald“)
- **Heute live** — laufende und heutige Spiele
- **Diese Woche** — nach Tag gruppiert
- **Weiter voraus** — kommende Highlights (Topspiele, Pokalrunden, Finals)

Filter oben: Wettbewerb (Bundesliga, 2. BL, Pokal, CL, EL, Länderspiele) und
**„nur Free-TV“**.

### Die Spielkarte
```
Sa 30.08. · 18:30 · Bundesliga, 2. Spieltag
FC Bayern – Borussia Dortmund
📺 Sky/WOW (Abo) · Highlights: ARD Sportschau 18:30
```
Zeigt: Anstoß, Wettbewerb, Begegnung, Sender mit Badge **frei** (grün) oder
**Abo** (mit Abo-Name), optional Highlight-Hinweis, Link zum Anbieter.

### Der eigentliche Mehrwert: „Meine Abos“
Nutzer haben heute schon `watch_provider_ids` (Streaming-Anbieterwahl). Das
erweitern wir um Sport-Anbieter (Sky/WOW, DAZN, Amazon, RTL+, …). Dann kann
jede Spielkarte sagen:

- ✅ **„Kannst du sehen“** (frei empfangbar oder in deinem Abo)
- 🔒 **„Dafür bräuchtest du DAZN“**

Das beantwortet die Ausgangsfrage („in welchem Abo enthalten, kostenlos oder
nicht?“) **personalisiert** statt als Tabelle zum Selberdenken.

### Später (nicht Teil des Starts)
- Erinnerungen/Push vor Anstoß (baut auf PLAN-NATIVE-APPS auf)
- Spiel zu einem Movie-Night-artigen Termin machen (Route `movieNight`
  existiert)
- Weitere Sportarten (F1, NFL, Tennis …) und Länder — die Rechte-Matrix-
  Struktur trägt das, nur Quellen und Regeln kommen je Sportart dazu

---

## 5. Phasen und geschätzter Aufwand

| Phase | Inhalt | Aufwand (grob) |
|---|---|---|
| **1 — MVP** | Bundesliga + 2. BL: sport-fetch, Rechte-Matrix, Backend, Sport-Tab mit Heute/Woche, Sender-Badges frei/Abo | 2–3 Arbeitstage |
| **2** | DFB-Pokal + CL + EL inkl. Ausnahmen-Pflegeliste; Filter „nur Free-TV“ | 1–2 Tage |
| **3** | „Meine Abos“-Abgleich (✅/🔒), Anbieter-Einstellungen erweitert | 1 Tag |
| **4** | Länderspiele, Turniere (EM 2028), SEO-Unterseiten (/de-de/sport) | nach Bedarf |

Laufende Kosten: **0 €** (OpenLigaDB frei). Laufende Pflege: **~5–10 min/
Woche** für Amazon-Pick und Free-TV-Spiele — übernimmt die Claude-Routine
(5b); Bundesliga/2. BL brauchen gar keine Pflege (vollständig regelbasiert).

---

## 5b. Wochenpflege als Claude-Routine (entschieden: ja)

Die ~10 % Pick-basierten Sender-Zuordnungen erledigt eine **geplante
Claude-Cloud-Routine** (Cron, z. B. montags 08:00) statt Christian:

1. **Recherche** per Websuche: Amazon-Dienstagspick der CL-Woche,
   Free-TV-Spiele im DFB-Pokal (ARD/ZDF) je Runde, Free-TV-Picks der
   Europa League (RTL/Nitro).
2. **Eintragen**: Ausnahmen-Liste in `sport-rechte.json` ergänzen
   (matchId → Sender), mit Quellenangabe im Commit-Text.
3. **Einreichen**: Commit ins Repo → GitHub Action (analog `cinema.yml`)
   spielt die Daten neu ein.

**Sicherung:** In den ersten Wochen stellt die Routine einen **Pull Request**
(Christian prüft kurz gegen), nach bewährter Trefferquote Umstellung auf
Direkt-Commit. Zusätzlich markiert der Ingest Spiele ohne Senderzuordnung
< 72 h vor Anstoß als „Sender noch offen“ — so fällt eine ausgefallene
Routine sichtbar auf, statt falsche Daten anzuzeigen.

Die Routine wird **im Zuge der Umsetzung** eingerichtet (sie braucht die
Ausnahmen-Datei und den Ingest), nicht vorab.

---

## 6. Entscheidungen — getroffen, siehe Abschnitt 0

*(Frühere Fassung dieses Abschnitts listete E1–E5 als offen; Stand und
Antworten stehen jetzt oben in Abschnitt 0.)*

---

## 7. Quellen der Recherche (19.08.2026)

- OpenLigaDB, Ligenliste live geprüft: https://api.openligadb.de/getavailableleagues
- DFL-Medienrechte 2025/26–2028/29: https://www.bundesliga.com/de/bundesliga/news/dfl-medienrechte-vergabe-tv-partner-clubs-saison-25-26-28-29-29352
- TV-Plan 2026/27: https://www.bundesliga.com/de/bundesliga/news/bundesliga-spiele-im-fernsehen-tv-sender-rtl-dazn-sky-363
- kicker zur Rechteverteilung: https://www.kicker.de/fussball-uebertragungsrechte-ab-2025-26-wer-zeigt-was-1076525/artikel
- CL-Übertragung 2026/27: https://www.fussballdaten.de/news/champions-league-uebertragung-2026-27-wer-zeigt-spiele-live-tv-stream/
- CL-Rechte ab 2027 (Paramount+/Amazon): https://www.sportschau.de/fussball/championsleague/zwei-us-sender-zeigen-ab-2027-die-champions-league,rechtevergabe-cl-paramount-100.html
- Überblick Übertragungsrechte: https://www.tv-angebote.de/fussball-live-tv-uebertragungsrechte/
