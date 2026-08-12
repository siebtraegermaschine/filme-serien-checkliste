# Plan: Internationalisierung (EU zuerst, dann USA)

> **UMSETZUNGSSTAND 12. August 2026: Die EU-Stufe ist gebaut** (Abschnitte 1–3
> und 5). Was genau umgesetzt wurde und welche Betriebsschritte noch anstehen,
> steht im neuen Abschnitt 9 am Ende. Die USA-Stufe (Abschnitt 4) ist weiterhin
> offen.

> **Arbeitsauftrag für einen neuen Chat.** Stand: 11. August 2026.
> Ziel: MovieMatch über Deutschland hinaus nutzbar machen — **zuerst Europa,
> danach USA**, später ggf. weltweit.
>
> Diese Datei fasst die Ausgangslage, die Kernentscheidungen und die konkreten
> Code-Berührungspunkte zusammen. Sie ersetzt keine Umsetzung, sondern ist der
> Fahrplan dafür. Abschnitt 7 listet jede Stelle im Code, die angefasst werden
> muss.

---

## 0. Ausgangslage — was heute festverdrahtet ist

Die App ist **technisch schon jetzt weltweit erreichbar** (kein Geo-Block). Die
Frage ist nicht „erreichbar", sondern „für wen **nützlich** und **rechtssicher**".

Heute ist alles auf **Deutschland/Deutsch** ausgelegt:

| Bereich | Ist-Zustand | Wo im Code |
|---|---|---|
| Oberfläche | komplett deutsch, **fest im Code**, kein i18n-Gerüst | `index.html` (alle Texte), `<html lang="de">` |
| Inhalte (Titel, Plots) | TMDB `de-DE`, en-US nur als Rückfall bei leerem Overview | `TMDB_LANG` in den Fetch-Skripten |
| Streaming-Verfügbarkeit | `watch_region=DE`, eine Region in der DB | `TMDB_REGION`, `streaming_cache` |
| Altersfreigaben | FSK, aus dem DE-Eintrag von TMDB | `fskAus()`, `iso_3166_1 === 'DE'` |
| Kino (Orte) | deutsche Kinos (OSM) + deutsche PLZ (GeoNames) | `import-kinos.mjs`, `import-plz.mjs`, `plz`-Tabelle |
| Kino (Starts) | `region=DE` | `cinema-fetch.mjs` |
| Recht | DSGVO, Impressum (TMG), Server in DE | `datenschutz.html`, `impressum.html` |
| Zahlung/Steuern | **entfällt** — kostenlos, nicht kommerziell | — |

**Zwei gute Nachrichten vorweg:**

1. **`TMDB_LANG` und `TMDB_REGION` sind bereits Umgebungsvariablen** (Default
   `de-DE` / `DE`). Die Datenbeschaffung ist also nicht hart auf DE genagelt —
   das Fundament dafür steht schon.
2. **Kostenlos & nicht kommerziell** spart die gesamte Zahlungs-, Steuer- und
   Umsatzsteuer-Komplexität. Das ist bei internationaler Ausweitung sonst der
   teuerste Brocken.

---

## 1. Das Fundament: Sprache (i18n) — die einmalige Weiche

**Ohne diesen Schritt ist jede geografische Ausweitung wirkungslos**, weil ein
nicht-deutschsprachiger Mensch eine deutsche App vor sich hätte. Das ist der
mit Abstand größte Posten und die Voraussetzung für alles Weitere.

Heute steht **jeder** sichtbare Text direkt im `index.html`. Zu tun:

- **Strings herauslösen.** Alle deutschen Texte in eine Nachschlage-Struktur
  (z. B. `TEXTE[sprache][schluessel]`) überführen. Das ist die Fleißarbeit —
  hunderte Stellen, aber mechanisch.
- **Sprachumschaltung** bauen: Auswahl (Deutsch/English), Merken je Gerät
  (localStorage) und, bei angemeldeten Personen, am Konto. `<html lang>` mitsetzen.
- **Datums-/Zahlenformate**: `toLocaleDateString('de-DE')` /
  `toLocaleString('de-DE')` durch die gewählte Locale ersetzen (mehrere Stellen
  in `index.html`).
- **Rechtstexte übersetzen** (siehe Abschnitt 5).

**Architektur-Kernentscheidung — Inhaltsdaten je Sprache:** Die Datenbank hält
heute **eine** Fassung je Titel (deutscher Titel, deutscher Plot, deutsche
Genres). Für echte Mehrsprachigkeit gibt es drei Wege:

| Weg | Aufwand | Bewertung |
|---|---|---|
| **A** Metadaten je Sprache speichern (`title_en`, `plot_en`, Genres je Sprache …) | 🔴 groß (Schema + Import je Sprache) | Sauber, schnell im Betrieb, wächst mit jeder Sprache |
| **B** Zur Laufzeit je Nutzer von TMDB holen | 🟡 mittel | Langsam, TMDB-Rate-Limit, schlecht für große Listen |
| **C** Deutscher Katalog + fremdsprachige Oberfläche | 🟢 klein | Schlechte UX (gemischt), nur als Zwischenschritt tauglich |

**Empfehlung: Weg A**, schrittweise. Der bereits geplante Schritt „englische
Titel durchsuchbar" (`title_en`, siehe `UEBERGABE-OFFEN.md` Abschnitt 3.2) ist
genau der Anfang davon — er kann als erster Baustein von Weg A gebaut werden.

---

## 2. Datenmodell für mehrere Regionen (Streaming)

`streaming_cache` kennt heute **keine Region** — die Verfügbarkeit ist implizit
„DE". Für mehrere Länder muss die Region eine eigene Dimension werden:

- Spalte `region` in `streaming_cache` (und im eindeutigen Schlüssel:
  `(provider_id, type, tmdb_id, region)`).
- Der Ingest-Job läuft je Region einmal (`TMDB_REGION` je Lauf), schreibt die
  Zeilen mit der jeweiligen Region.
- Das Backend liefert die Verfügbarkeit passend zur Region der anfragenden
  Person (aus deren Auswahl/Land).
- Folge: mehr Import-Läufe, **größere Datenbank** (Faktor ~Anzahl Regionen für
  die Streaming-Tabelle).

Das ist der größte **Daten**-Umbau. Die Altersfreigabe hat dasselbe Muster: heute
eine Spalte `certification` (DE-FSK); für andere Länder braucht es entweder eine
Region-Dimension oder je-Land-Spalten.

---

## 3. EUROPA — was zuerst umgesetzt wird

Der technisch kleinste Sprung: DSGVO gilt bereits, der Server steht in der EU,
die Latenz passt. Der reale Aufwand steckt in **Sprache** und **Daten je Land**.

| Baustein | Aufwand | Was konkret |
|---|---|---|
| **Englisch als 2. Sprache** | 🔴 groß | Abschnitt 1 — das Fundament. Einmalig, dann ist jede weitere Sprache nur noch Übersetzen. |
| Inhaltsdaten `en` | 🟢/🟡 | TMDB hat alle Sprachen; je nach Weg A/B (Abschnitt 1). |
| Streaming je Land | 🟡 | Region-Dimension (Abschnitt 2) + Ingest je `watch_region`. TMDB/JustWatch deckt die EU-Länder ab. |
| Altersfreigaben | 🟡 | National verschieden (**nicht** EU-einheitlich). Je Land der passende TMDB-Eintrag statt hart `'DE'`. Der FSK-Filter im Frontend (`fskErlaubt`) muss je System denken. |
| Kino-Orte je Land | 🟡 | OSM ist global (Import-Query je Land/Bounding-Box), aber der PLZ-Abzug (`import-plz.mjs`) ist DE — je Land ein GeoNames-Abzug. |
| Kino-Starts je Land | 🟡 | `region` je Land in `cinema-fetch.mjs`. **Achtung:** Spielpläne („welcher Film wo") fehlen ohnehin überall — kostenpflichtig, siehe `PLAN-KINOS.md`. |
| Recht | 🟡 | DSGVO gilt EU-weit → meist ok. Rechtstexte in der jeweiligen Sprache; Impressumspflicht bleibt (DE-Betreiber). |
| Infrastruktur | 🟢 | Ein Server reicht für die EU. |

**Empfohlene EU-Teilreihenfolge:**
1. i18n-Fundament + Englisch (Abschnitt 1) — ohne das bringt der Rest nichts.
2. Region-Dimension im Datenmodell (Abschnitt 2).
3. Ein zweites Land vollständig durchziehen (Sprache + Streaming + Rating + Kino)
   als Blaupause, dann die weiteren Länder nachziehen.

---

## 4. USA — danach

Technisch wie EU, aber mit **einer harten Hürde** und ein paar Zusätzen:

| Baustein | Aufwand | Was konkret |
|---|---|---|
| **Recht** | 🔴 **kritisch** | Anderes Regime: **CCPA/CPRA** (Kalifornien) statt DSGVO, bei Minderjährigen **COPPA**. Übermittlung/Verarbeitung von US-Nutzerdaten. **Vor jedem echten US-Start anwaltlich prüfen lassen** — hier kann man nicht mit einer DSGVO-Erklärung starten. |
| Sprache | ✅ | Englisch (US) liegt nach EU schon vor; ggf. US-Schreibweisen. |
| Altersfreigaben | 🟡 | **MPAA** (G/PG/PG-13/R/NC-17) statt FSK — anderes System im Rating-Mapping und im Filter. |
| Streaming | 🟡 | Region `US` (Region-Dimension existiert dann schon aus EU). |
| Kino | 🟡 | US-**ZIP** statt PLZ (eigener GeoNames-Abzug), US-Starts (`region=US`). |
| Infrastruktur | 🟡 | US-Latenz zu Falkenstein ist spürbar → **CDN** (statische Auslieferung) und ggf. eine zweite Server-Region. Nicht teuer, aber mehr Betrieb. |

---

## 5. Rechtstexte — je Ausbaustufe

- **EU:** DSGVO gilt weiter; die drei Dateien (`datenschutz.html`,
  `impressum.html`, `nutzungsbedingungen.html`) brauchen **Sprachfassungen**.
  Der Server bleibt in DE → Impressum/TMG bleiben gültig.
- **USA:** eigenes Datenschutz-Dokument (CCPA-Rechte: Auskunft, Löschung,
  „Do Not Sell"), COPPA-Betrachtung bei möglicher Minderjährigen-Nutzung.
- **Grundsatz:** Rechtstexte sind der Bereich, in dem **anwaltliche Prüfung**
  vor dem jeweiligen Start unverzichtbar ist (für DE ohnehin vertagt, siehe
  `PLAN-OEFFENTLICHER-TEST.md` Entscheidung 4). Kein automatisch generierter
  Rechtstext ohne Prüfung veröffentlichen.

---

## 6. Kritische / komplexe / offene Punkte (die Ehrlichkeit)

- 🔴 **i18n-Fundament** — einmalig viel Arbeit, aber unumgänglich und der
  eigentliche Engpass.
- 🔴 **US-Recht** — nicht „mal eben", braucht Fachprüfung.
- 🔴/🟡 **Datenmodell für mehrere Regionen** — Schemaänderung an
  `streaming_cache`/`certification`, größere DB, mehr Importläufe.
- 🟡 **Altersfreigaben je Land** — kein einheitliches System, je Region eigenes
  Mapping und Filter.
- 🟡 **Kino** — pro Land PLZ-Abzug + Starts; Spielpläne fehlen generell
  (kostenpflichtige Quelle, `PLAN-KINOS.md`).
- 🟡 **Infrastruktur weltweit** — Multi-Region/CDN/Skalierung, sobald es über
  die EU hinausgeht.

**Was NICHT das Problem ist:** die Inhaltsdaten selbst (TMDB ist global) und die
Zahlung (entfällt, solange kostenlos).

---

## 7. Code-Berührungspunkte (Referenz für die Umsetzung)

**Sprache / Frontend:**
- `index.html` — sämtliche sichtbaren Texte (Fleißarbeit: herauslösen), `<html
  lang="de">`, `toLocaleDateString('de-DE')`/`toLocaleString('de-DE')` an
  mehreren Stellen, der FSK-Filter `fskErlaubt`/`fskAus`.

**Region / Sprache der Datenbeschaffung (schon env-gesteuert):**
- `stream-fetch.mjs` — `TMDB_LANG`, `TMDB_REGION`, `watch_region`, FSK über
  `iso_3166_1 === 'DE'`.
- `cinema-fetch.mjs` — `TMDB_LANG`, `TMDB_REGION`, `region=DE`, DE-Eintrag.
- `discover-rated-titles.mjs` — `TMDB_LANG`.
- `backend/routes/watchProviders.js` — `TMDB_LANG`, `TMDB_REGION`,
  `watch_region`.
- `backend/lib/themen.js` — `TMDB_LANG`.
- `backend/scripts/backfill-catalog-meta.mjs` — `fskAus()`,
  `iso_3166_1 === 'DE'`, `TMDB_LANG`.
- `backend/scripts/backfill-overviews.mjs`, `backfill-catalog-posters.mjs` —
  `TMDB_LANG`.

**Datenmodell:**
- `backend/db/schema.sql` — `streaming_cache` (Region-Dimension), `certification`
  (Region/Land), ggf. `title_en`/`plot_en` (Weg A aus Abschnitt 1).

**Kino / Orte:**
- `backend/scripts/import-plz.mjs` — GeoNames-Abzug je Land.
- `backend/scripts/import-kinos.mjs` — OSM-Import je Land/Region.
- `backend/routes/kinos.js` — Ortssuche über die `plz`-Tabelle.

**Recht:**
- `datenschutz.html`, `impressum.html`, `nutzungsbedingungen.html` —
  Sprachfassungen bzw. US-Fassung.

**Infrastruktur:**
- `Caddyfile`, `docker-compose.yml`, `DEPLOYMENT.md` — bei USA/weltweit
  CDN/zweite Region.

---

## 8. Empfohlene Gesamtreihenfolge

1. **i18n-Fundament + Englisch** (Abschnitt 1) — die einmalige Weiche.
2. **Region-Dimension im Datenmodell** (Abschnitt 2).
3. **Europa**: ein zweites Land als Blaupause, dann weitere nachziehen
   (Abschnitt 3).
4. **USA**: zuerst die anwaltliche Rechtsfrage klären, dann MPAA/ZIP/Region/CDN
   (Abschnitt 4).
5. **Weltweit**: kein neuer Grundschritt mehr, sondern Wiederholung je Markt
   (Sprache, Daten, Recht) plus skalierende Infrastruktur.

> **Kurzfassung:** Erst das Sprach-Gerüst bauen — danach ist EU günstig, USA vor
> allem eine Rechts- und Betriebsfrage, weltweit „mehr vom Gleichen".

---

## 9. Umsetzungsstand (12. August 2026) und Betriebsschritte

### Was gebaut ist

**i18n-Fundament (Abschnitt 1):**
- `index.html`: Sprach-/Regionsblock am Skriptanfang (`SPRACHE`, `REGION_WAHL`,
  `LOCALE`, Wörterbuch `UI_TEXTE` de/en, statische Markup-Übersetzung
  `uebersetzeStatischesMarkup()`). Alle sichtbaren JS-Texte laufen über
  `TXT.*`; `<html lang>` wird gesetzt, `toLocaleDateString`/`toLocaleString`
  nutzen `LOCALE`, `fmtR()` den passenden Dezimaltrenner.
- Sprach-/Regionswahl im Menü rechts oben („Sprache & Region"), gemerkt je
  Gerät (`mt.sprache`/`mt.region`) und am Konto (`users.sprache`/`users.region`,
  `PUT /api/auth/settings`). Ein Wechsel lädt die Seite neu; beim Anmelden auf
  einem neuen Gerät wird die Kontowahl übernommen.
- Genres werden über die TMDB-Paarung (`genre_alias`) übersetzt
  (`genreAnzeige()`); die Suche versteht beide Sprachfassungen.
  **Bekannte Lücke:** Schlagwörter (Hashtags) bleiben vorerst deutsch.

**Weg A — Inhaltsdaten je Sprache:**
- Schema: `title_en`/`overview_en` in `titles`, `streaming_cache`,
  `cinema_cache`; Freigaben je Land als JSONB `certifications` (DE-Bestand
  wurde beim Deploy einmalig übernommen).
- Alle Fetch-Skripte holen die englische Fassung **ohne zusätzliche
  TMDB-Abrufe** über `append_to_response=translations` mit; Freigaben für die
  Länder aus `TMDB_CERT_REGIONS` (Default `DE,AT`) fallen aus derselben
  Antwort ab.
- Backend liefert je `?lang=`/`?region=`: `/api/titles`, `/api/titles/plots`,
  `/api/streaming`, `/api/cinema`, `/api/share/title`,
  `/api/watch-providers/...` (Region), Cache-Schlüssel je Kombination.

**Region-Dimension (Abschnitt 2):**
- `streaming_cache`: Spalte `region`, PK `(provider_id, type, tmdb_id, region)`.
- `cinema_cache`: Spalte `region`, PK `(tmdb_id, region)`.
- Beide Ingests verwalten je Lauf nur ihre Region (Plausibilitätsprüfung und
  Aufräum-DELETE je Region); die Region kommt aus dem Payload
  (`TMDB_REGION` je Lauf).
- GitHub-Workflows `streaming.yml`/`cinema.yml` laufen als Matrix über
  `DE` und `AT` (nacheinander, wegen TMDB-Rate-Limit).

**Österreich-Blaupause (Abschnitt 3):** Streaming/Kino-Starts über die
Workflows; Freigabensystem AT (0/6/8/10/12/14/16) im Frontend-Filter;
`import-plz.mjs`/`import-kinos.mjs` konnten AT schon vorher (siehe unten).

**Sechs weitere Länder nach der Blaupause (12. August 2026):** CH, GB, FR,
IT, ES und NL sind an allen Blaupausen-Stellen angebunden — `REGIONEN` in
`backend/lib/i18n.js`, Workflow-Matrix in `streaming.yml`/`cinema.yml`
(acht Regionen nacheinander; wird die Gesamtlaufzeit zum Problem, die
Regionen auf mehrere Cron-Zeitpunkte verteilen), `TMDB_CERT_REGIONS`-Default
in den vier Fetch-/Backfill-Skripten, Regionsauswahl und
`regionErmittlung()` im Frontend sowie Bounding-Boxen in `import-kinos.mjs`
(Spanien mit zwei Rechtecken, damit die Kanaren mitkommen; die französischen
Übersee-Gebiete bewusst nicht). Die Oberfläche bleibt Deutsch/Englisch —
Sprache und Region sind getrennt wählbar, weitere Sprachen folgen
schrittweise. Zwei Besonderheiten:
- **Altersfilter:** `FSK_SYSTEME` führt je Land die belegten Stufen und für
  Buchstaben-Systeme ein Mapping auf das Mindestalter (`freigabeZahl()`):
  GB U/PG/12A (PG zählt als 8, also „bis 12"), FR U/TP, IT T/6+/VM14/VM18,
  ES APTA/TP/A, NL AL. Reine Erwachsenen-Sonderstufen (GB R18, ES X) gelten
  bewusst als fehlende Angabe. Fällt ein Titel mangels Landeswert auf die
  DE-Freigabe zurück und passt die nicht ins Landessystem, gilt sie als
  fehlende Angabe — der Familienfilter bleibt so auf der sicheren Seite,
  bis der Freigaben-Backfill (unten) gelaufen ist.
- **Anbieter-Suchlinks:** Amazon/Rakuten-Links hängen jetzt an der Region
  (`AMAZON_DOMAIN`/`RAKUTEN_LAND` in `index.html`); AT/CH kaufen bewusst
  über amazon.de ein (kein eigener Shop).

**Rechtstexte (Abschnitt 5):** `imprint.html`, `terms.html`, `privacy.html`
als englische **Arbeitsfassungen** (Kopf-Kommentar kennzeichnet sie als
Entwurf). Bei Sprache EN verlinken Fußzeile, Registrier-Hinweis und
Einladungs-Popup auf diese Fassungen; jede trägt den Hinweis, dass die
deutsche Fassung maßgeblich ist. **Vor einem echten Start außerhalb des
deutschsprachigen Raums anwaltlich prüfen lassen** (Entscheidung aus
Abschnitt 5 bleibt bestehen).

### Betriebsschritte (einmalig, nach dem Deploy)

1. **Schema einspielen** — läuft wie üblich mit dem Deploy (`schema.sql` ist
   idempotent; die PK-Umbauten und die DE-Übernahme der Freigaben laufen genau
   einmal).
2. **Englisch-Backfill für den Bestand** (~27.000 TMDB-Abrufe, mehrere
   Stunden, abbrechbar/fortsetzbar):
   `cd backend && TMDB_API_KEY=... node scripts/backfill-english.mjs`
   (erst mit `--limit=500` probelaufen). Bis dahin fällt die App bei EN auf
   deutsche Titel/Plots zurück — nichts bricht.
3. **Österreich-Kino-Orte:**
   `cd backend && node scripts/import-plz.mjs AT` und
   `node scripts/import-kinos.mjs --laender=AT` (beide Skripte konnten AT
   schon; sie mussten nur nie laufen).
4. **Workflows:** Nächster planmäßiger Lauf von `streaming.yml`/`cinema.yml`
   befüllt alle Regionen der Matrix automatisch. Nichts zu tun.
5. **Kino-Orte der sechs neuen Länder** (auf dem Server, im
   Backend-Verzeichnis):
   `node scripts/import-plz.mjs CH GB FR IT ES NL` und danach
   `node scripts/import-kinos.mjs --laender=CH,GB,FR,IT,ES,NL`
   (Overpass-Läufe dauern je Land einige Minuten; GeoNames deckt alle sechs
   ab, GB allerdings nur mit den „outward codes" der Postleitzahlen).
6. **Freigaben-Backfill für den Bestand** (~27.000 TMDB-Abrufe, mehrere
   Stunden, abbrechbar/fortsetzbar — erst mit `--limit=500` probelaufen):
   `cd backend && TMDB_API_KEY=... node scripts/backfill-english.mjs --nur-freigaben`
   Der normale Lauf überspringt Zeilen, die schon `title_en` haben — dieser
   Modus ergänzt deshalb gezielt die Freigaben der neuen Länder auf dem
   ganzen Bestand. Bis dahin fallen Bestandstitel auf den DE-Wert zurück
   (siehe `freigabeFuer`); der Familienfilter blendet im Zweifel aus statt
   ein.

### Was bewusst offen bleibt

- ~~Schlagwörter auf Englisch~~ — **erledigt (12. August 2026):** Das Backend
  übersetzt die deutschen Hashtags bei `?lang=en` über die rückwärts gelesene
  Übersetzungstabelle (`backend/lib/schlagworte.js`); Hashtags ohne Eintrag
  bleiben deutsch (derselbe Rückfall wie bei Titeln/Plots).
- **USA** (Abschnitt 4): unverändert offen, zuerst die Rechtsfrage.
- **Weitere EU-Länder** (PT, PL, Skandinavien …): je Land nur noch
  `REGIONEN` in `backend/lib/i18n.js`, Workflow-Matrix,
  `FSK_SYSTEME`/Regionsauswahl im Frontend, `TMDB_CERT_REGIONS`-Defaults,
  Bounding-Box in `import-kinos.mjs` und die beiden Importe (PLZ/Kinos)
  ergänzen — Muster siehe CH/GB/FR/IT/ES/NL oben. Für Buchstaben-Freigaben
  (PT: M/x) das `zahlen`-Mapping in `FSK_SYSTEME` mitliefern.
- **Weitere UI-Sprachen** (fr/es/it/nl …): je Sprache `UI_TEXTE`,
  `uebersetzeStatischesMarkup()`, `INFO_TEXT_*`, TOUR-Texte und eine
  Rechtstext-Fassung — bewusst zurückgestellt, die neuen Länder starten mit
  englischer Oberfläche.
- **Anleitungs-Screenshots** (tour/*.png) zeigen die deutsche Oberfläche —
  werden aktualisiert, wenn alle Oberflächen-Änderungen durch sind.
