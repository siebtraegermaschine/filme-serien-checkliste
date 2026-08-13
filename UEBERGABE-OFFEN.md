# Offene Punkte — Stand 2026-08-13

Ergänzt `UEBERGABE-CHAT.md` (Stand 2026-08-03). Für Architektur und Auslieferung
siehe `DEPLOYMENT.md` (enthält seit dem 11. August auch den server-seitigen
`deploy.sh` im Wortlaut), für den Weg zu nativen Apps `PLAN-NATIVE-APPS.md`,
für den bereits umgesetzten Filter-Umbau `PLAN-FILTER.md`, für den am
11. August übernommenen Rechtstext zum Mailversand `ENTWURF-DATENSCHUTZ-MAIL.md`,
für „Deine Kinos" `PLAN-KINOS.md`, für die Internationalisierung (41 Regionen,
sieben Sprachen) `PLAN-INTERNATIONALISIERUNG.md` — dessen **Abschnitt 9** ist
der Umsetzungsstand samt der noch offenen Betriebsschritte —, für bewusst
zurückgestellte Ideen `IDEEN.md`, und für die Wachstums-Analyse mit
priorisierten Vorschlägen `IDEEN-WACHSTUM.md` (Stand der Umsetzung steht
dort im Kopf).

**`PLAN-OEFFENTLICHER-TEST.md` ist am 11. August abgearbeitet** — alle sieben
Punkte umgesetzt (siehe Abschnitt 0.0). Der Plan bleibt als Beleg stehen, ist
aber kein Arbeitsauftrag mehr.

**Diese Datei ist der Einstiegspunkt.** Abschnitt 3 sagt, was noch zu tun ist;
Abschnitt 1, 2 und 6, was man vorher wissen sollte. Die Abschnitte 0 bis 2 stehen
nach Datum, das Neueste zuerst.

**Deployment läuft automatisch:** Jeder Push auf `main` stößt
`.github/workflows/deploy.yml` an, das auf dem Server `/opt/movietaste/deploy.sh`
ausführt (git fetch/reset, docker compose build/up, migrate). Alles unten
Beschriebene ist live — an movietaste.de gegen den ausgelieferten Inhalt geprüft,
nicht nur am Workflow-Lauf.

**Serverzugang:** `ssh -i ~/.ssh/id_ed25519 root@movietaste.de`. Der Schlüssel
`filme-serien-hetzner` funktioniert dafür **nicht** (der ist auf `deploy.sh`
eingeschränkt). SQL-Abfragen:

```bash
ssh -i ~/.ssh/id_ed25519 root@movietaste.de \
  "cd /opt/movietaste && docker compose exec -T postgres psql -U postgres -d filme_serien -c 'SELECT …'"
```

---

## 0.0.0.0 Was am 13. August dazukam (11 Commits)

Sechs Blöcke, chronologisch. Alles live verifiziert (Deploy je 15–60 s nach
dem Push, gegen den ausgelieferten Inhalt geprüft).

**Kopf-Umbau (`1f02988`, `bdb13f3`).** Neue Reihenfolge: Suchfeld zuerst,
darunter die einzige Linie im Kopf (border-bottom von `.head-controls`, volle
Breite), dann Filme/Serien/Kino und die Filterzeilen als EINE Gruppe ohne
Linien — auch zur Titelliste hin. Die drei Tab-Knöpfe stehen auf 660 px
spaltenbündig über den Statusknöpfen (Reihen-Abstand 4 px wie
`.filter-group`); der senkrechte Trennstrich vor Kino ist weg, die runde Form
trägt den Unterschied allein. Achtung: Die wirksamen `.tabs`-Regeln stehen im
späteren „Redesign"-Block (~Zeile 720), nicht bei den frühen Definitionen.
Außerdem: Match-Knopf so breit wie Watchlist (`.pi-aktionen` als Grid mit
1fr-Spalten), und **„Personen einladen" teilt direkt nativ** — der Link
entsteht schon während der Rückfrage, das „Ja" öffnet `navigator.share` aus
frischer Geste; das Einladungs-Fenster ist nur noch Rückfall, ein Abbruch
lässt den erstellten Link ungenutzt verfallen.

**Wachstums-Paket (`801d71f`) — Vorschläge A, B und „Messen" aus
`IDEEN-WACHSTUM.md`.**
- *Kennenlern-Strecke:* Beim ersten Besuch statt der Anleitung (gleicher
  Merker `top200-howto-seen-v2`; Bestandsbesucher bekommen sie nicht).
  Bekannteste Titel nacheinander, „Mochte ich" (gesehen, 8/10) / „Nicht
  meins" (gesehen, 4/10) / „Kenn ich nicht", Ziel 15 Marken. Der Taste-Score
  entsteht LOKAL ohne Konto; Marken liegen in `mt.kennenlernMarken` und
  werden bei der nächsten Anmeldung aufs Konto geschrieben
  (`onboardingMarkenUebernehmen`, vor `loadUserProgressAndRefresh`).
  Startet nicht über Einladungs-, geteilten oder Ansicht-Links.
- *Import im Einstieg:* „Schon bei Letterboxd, IMDb oder Trakt?" im
  Anmelde-Popup (Klick merkt den Import als Nach-Anmelde-Aktion vor) und im
  Watchlist-Leerzustand (`requireLogin(importOeffnen)`).
- *Messen ohne Tracking:* Tabelle `metrik_tage` (je Tag/Schritt EINE Zahl,
  keine Kennungen). Client meldet `besuch` (1×/Tag/Gerät) und
  `erste-markierung` (1× je Gerät) über `/api/metrik` (mengenbegrenzt);
  der Server zählt `konto` (Registrierung) und `zehn-titel`
  (`users.metrik_zehn`, je Konto genau einmal). Auslesen NUR per
  `npm run metrik` — erste echte Zahlen: 9 Konten, 5 über Einladungen
  geworben (alle von Christian), 5 Konten mit Markierungen in 7 Tagen,
  8 in 30 Tagen. Rechtstext-Vermerk in `IDEEN.md`.

**Einstellungen-Umbau (`886e037`).** „E-Mail-Einstellungen" ist ein
Aufklapp-Knopf (Pfeil ▸/▾, startet zu), der Benachrichtigungs-Schalter steht
eingerückt darunter; Streaminganbieter und Deine Kinos sind durch eine
Trennlinie abgesetzt. **„Sprache & Region" wohnt jetzt in den Einstellungen**
— dafür ist der Menüpunkt „Einstellungen" auch abgemeldet sichtbar
(`einstellungenSichtbarkeit` zeigt dann nur Sprache & Region und Credits).
**„Konto löschen" steht nur noch unten im Zugangsdaten-Fenster** (gleiche id
`settingsDeleteBtn`, Handler und Übersetzungen greifen weiter).

**Taste-Match (`f0915ca`).** Hinter jedem Namen in „Gemeinsam schauen" steht
in Klammern ein symmetrischer Kreuz-Score (0–99): deren positiv markierte
Titel gegen das eigene Profil, die eigenen gegen deren, Mittel beider
Richtungen — beide sehen dieselbe Zahl. „Positiv" = Watchlist oder Gesehen
ohne schlechte Bewertung (Rating < 6 zählt nicht). Erscheint erst, wenn
BEIDE Seiten mindestens 10 Titel markiert haben; bewusst kein
Schnittmengen-Ansatz (die Profile tragen über Filme/Serien/Kino hinweg, auch
ohne einen gemeinsamen Titel). Antippbar → neues Info-Popup `tastematch`.
Zwischengespeichert je Person am `PROFIL_STAND`. **Noch am selben Tag vorerst
ausgeblendet** (`TASTE_MATCH_SICHTBAR = false`) — Berechnung, Stil und
Erklärung bleiben komplett verdrahtet, siehe 3.8. Außerdem färbt bei aktivem
Match nur noch der Match-Knopf, nicht mehr die ganze Personenzeile.

**Teilen-Knopf und kombinierbare Suche (`6d96da0`, `298fe8d`, `ceb66a7`).**
- Neuer Knopf unten mittig (Höhe des Nach-oben-Knopfs), in **Blau**
  (`--teilen`, einzige Stelle mit dieser Farbe — bewusst nicht das
  Akzent-Gold). Auswahlblatt direkt darüber mit drei Wegen: *Aktuelle
  Ansicht teilen* (Link `?ansicht=…&sortierung=…&suche=A|B|C`, entsteht
  lokal → natives Teilen direkt aus der Geste), *Einen Titel teilen* (nur
  Hinweis: mobil nach rechts wischen, am Rechner über die Detailansicht)
  und *Mein Profil teilen* (= „Personen einladen"). In fremder Liste oder
  mit aktivem Match: Fenster „Teilen nicht möglich".
- **Der Ansicht-Link überträgt EINSTELLUNGEN, keine Inhalte** — der
  Empfänger sieht seine eigenen Markierungen mit den Filtern des Absenders.
  Nur Such-Chips wirken inhaltlich (Titelnamen treffen dieselben Titel im
  Katalog). Beim Wiederherstellen gilt: erst die Suche anwenden, DANN die
  Filter aus dem Link — sonst überschreibt `sucheZustandAnwenden` („Suchen
  heißt überall suchen") die Link-Filter.
- *Kombinierte Suche:* „+" neben dem X friert die Suche als Chip ein (bis
  10, ODER-verknüpft, je Chip einzeln entfernbar; X und Logo räumen alles).
  **Ein angeklickter Vorschlag wird direkt zum Chip** (Feld leer, Liste zu);
  Enter ohne Auswahl klappt nur die Vorschläge ein und lässt den Begriff im
  Feld — Chips erzeugen ausschließlich Vorschlags-Klick und „+".
- Offen als Produktidee (vorgeschlagen, nicht entschieden): „Diese Titel
  teilen" — eine Momentaufnahme der konkret angezeigten Titel per
  Kennungen, unabhängig von den Markierungen des Empfängers.

**Nebenbei:** `import-kinos.mjs` überspringt Länderfehler statt abzubrechen
(`e85d952`, vor dieser Sitzung entstanden) und `npm run metrik` bekam
saubere Spaltenbreiten (`0929901`).

**Nachträge vom selben Tag (nach dem ersten Übergabe-Stand):**
- Der Teilen-Knopf ist **weiß** (`1af2fc0`, erst blau — `--teilen`/`--teilen-soft`).
- **Kino-Rückweg** (`617ed45`): Wer auf der Kino-Seite sucht, sieht am Ende
  „🎬 Auch unter Filme & Serien: X Treffer" (`listenHinweisAktualisieren`) —
  das Gegenstück zum „Auch im Kino"-Knopf; der Klick führt in die Titelliste,
  die Suche bleibt stehen.
- Teilen-Blatt: „Mein Profil teilen" heißt **„Gesamte Watchlist teilen"**
  (`fd36d18`), und **„Einen Titel teilen" steht zuerst** (`ce19aee`).
- Suche: Vorschlags-Klick wird **direkt zum Chip**, Enter klappt nur die
  Vorschläge ein (`ceb66a7`) — Chips entstehen ausschließlich über
  Vorschlags-Klick und „+".

---

## 0.0.0 Was am 12. August dazukam (41 Commits)

Der bisher umfangreichste Tag. Vier Blöcke: die Internationalisierung (morgens
bis früher Nachmittag), zwei neue Funktionen (Watchlist-Import und
Benachrichtigungs-Mails), Movie Night (Nachmittag bis Abend — gebaut und
wieder ausgeblendet) und Umbauten an „Gemeinsam schauen".

### 0.0.0.1 Internationalisierung: 41 Regionen, sieben Sprachen

**Vollständig dokumentiert in `PLAN-INTERNATIONALISIERUNG.md`, Abschnitt 9** —
das wird hier nicht wiederholt. Kurzfassung: Sprach- und Regionswahl im Menü
(je Gerät und am Konto), Oberfläche in de/en/fr/es/it/nl/pt, Titel und
Inhaltsangaben je Sprache aus denselben TMDB-Antworten
(`append_to_response=translations`, keine Zusatzabrufe), Streaming- und
Kinodaten je Region (EWR komplett plus GB/CH, dazu US/CA/AU/NZ/MX/AR/CL/CO/BR),
Altersfreigaben je Landessystem, Workflows als Regionsgruppen (Kernmärkte
täglich, der Rest in 4-Tage-Rotation).

Was daraus als **offene Arbeit** bleibt (Details in 3.7 und 3.1):

- Die einmaligen **Betriebsschritte auf dem Server** (Englisch- und
  Freigaben-Backfill, PLZ-/Kino-Importe der neuen Länder) — ihre Erledigung
  ist nirgends vermerkt, der Stand ist ungeprüft.
- **Muttersprachler-Review** der maschinellen Übersetzungen (Review-Dateien
  je Sprache liegen bei Christian).
- **Rechtsklärung für Nicht-EWR-Länder** vor aktivem Marketing dort.

Eine Nachwirkung erst am Abend gefunden (`ad3835d`): `cinema/ingest` fiel auf
das 1-MB-Default-Limit und brach seit dem Sprachausbau mit
`PayloadTooLargeError` ab — die Payloads tragen jetzt Übersetzungen in bis zu
sieben Sprachen je Titel. Kino hat nun ein eigenes 20-MB-Limit, Streaming
wuchs auf 60 MB, Discovery-Bulk auf 30 MB.

### 0.0.0.2 Watchlist-Import aus Letterboxd, IMDb und Trakt (`ad8bd7b`)

Neuer Einstellungen-Punkt (nur angemeldet): Exportdateien einlesen
(Letterboxd-CSV, IMDb-Listen-CSV, Trakt-JSON), **im Browser** gegen den
Katalog abgleichen (Titel+Jahr, auch Original- und Alias-Titel), Vorschau mit
Fehlliste, Übernahme über die vorhandene Progress-API inklusive Bewertungen
(Letterboxd 0,5–5 verdoppelt, IMDb/Trakt 1–10 direkt). Bewusst **ohne eigenen
Backend-Endpunkt** — was nicht im Katalog ist, wird benannt, aber nicht
angelegt. Parser mit Beispieldateien aller drei Formate getestet.

### 0.0.0.3 Benachrichtigungen: „Watchlist-Titel jetzt verfügbar" (`766b69e`)

Opt-in am Konto (`users.benachrichtigung`, Default **aus**, Schalter in den
Einstellungen). `backend/lib/benachrichtigung.js` verschickt täglich um
18:00 UTC eine Sammelmail je Person: Watchlist-Titel, die bei den gewählten
Anbietern neu verfügbar sind (`first_seen_at`, Region der Person), und
Kinostarts der Region. Die Tabelle `benachrichtigt` (je Person/Titel/Art)
verhindert Wiederholungen; der Vermerk wird erst **nach** erfolgreichem
Versand geschrieben. **Der Rechtstext-Nachtrag dafür steht in `IDEEN.md`**
und gehört in die Anwaltsprüfung (siehe 3.1).

### 0.0.0.4 Movie Night — gebaut, dann ausgeblendet

In rund 20 Commits entstanden und iteriert. Endzustand: Ein Knopf unter
„Gemeinsam schauen" erstellt aus den ersten 20 Titeln der **aktuellen**
Ansicht (Filter + Sortierung) eine Abstimmungsrunde
(`backend/routes/movieNight.js`, Tabellen `movie_night_runden` /
`movie_night_stimmen`, bis 30 Kandidaten, 48 h Verfall) und teilt einen Link
(`?nacht=TOKEN`). Abstimmen geht **ohne Konto** und **anonym** (das Namensfeld
wurde wieder entfernt), per Checkbox je Titel, jeder Tipp zählt sofort,
Zwischenstand alle 7 Sekunden, Kandidaten nach Sternen sortiert, Doppelstimmen
per Upsert je Teilnehmer-Kennung abgefangen, Stimmabgabe mengenbegrenzt.

**Derzeit ist die Funktion ausgeblendet** (`ed9a240`): `movieNightBtn` steht
auf `display:none`, Frontend und Backend bleiben komplett verdrahtet. Zum
Reaktivieren genügt es, das style-Attribut zu entfernen (siehe 3.8).

### 0.0.0.5 „Gemeinsam schauen" und Navigation — Endzustand nach mehreren Anläufen

- Ein Versuch, Herz und Verknüpfung-lösen hinter ein „…"-Menü zu legen, wurde
  noch am selben Abend zurückgenommen (`45292de` → Revert `65eb910`). Danach
  standen beide wieder in der Zeile hinter Match (`31c2a05`) — und zuletzt
  fiel das **Herz komplett weg** (`da0e399`): Die Favoriten-Sortierung
  sortierte bei einer Handvoll Verknüpfungen nichts Spürbares. Die
  Personenliste steht jetzt in Server-Reihenfolge (Verknüpfungsdatum); die
  alte Einschränkung „Favoriten liegen nur im Browser" ist gegenstandslos
  (Abschnitt 6 angepasst).
- **„Personen einladen" im Menü rechts oben ist ausgeblendet** (`0077535`,
  `display:none`, Handler und Übersetzungen bleiben stehen). Der Knopf
  „Watchlist teilen" unter „Gemeinsam schauen" heißt jetzt in allen sieben
  Sprachen „Personen einladen" — gleiche Funktion wie zuvor.

---

## 0.0 Was am 11. August dazukam (11 + 14 Commits, siehe 0.0.5)

**Der Plan für den öffentlichen Test ist vollständig abgearbeitet.** Dazu drei
Dinge, die nicht darin standen.

### 0.0.1 Der Serverquelltext lag offen — beim Anlegen der robots.txt gefunden

Der wichtigste Fund des Tages. `express.static(frontendRoot)` liefert im Image
`/app` aus, und dort liegt laut Dockerfile auch `backend/`. Live gemessen:
`/backend/server.js`, `/backend/routes/auth.js`, `/backend/lib/mailer.js` und
`/backend/db/schema.sql` kamen mit **HTTP 200**.

**Zugangsdaten waren nicht betroffen:** `/backend/.env` gab 404, die Datei steht
in `.dockerignore` und kommt über `env_file` in den Container. Ebenfalls 404:
Caddyfile, docker-compose.yml und die gesamte Dokumentation — die kopiert das
Dockerfile gar nicht erst ins Image.

Behoben durch eine Sperre **vor** `express.static`: Das Backend muss im Image
liegen, es soll nur nicht ausgeliefert werden.

### 0.0.2 Die sieben Punkte des Plans

| Punkt | Ergebnis |
|---|---|
| Feedback speichern | Tabelle `feedback`, **erst speichern, dann mailen**. Lesen mit `npm run feedback` (`--alle`, `--tage N`, `--csv`). Aufbewahrung 12 Monate, täglich abgeräumt. |
| Datenschutz Abschnitt 6 (+2, 3, 10) | Resend namentlich genannt, USA-Übermittlung belegt, Feedback vollständig beschrieben. |
| Namensnennung | OpenStreetMap (ODbL) und GeoNames (CC BY 4.0) stehen in den Credits, nicht mehr nur im Code-Kommentar. |
| Missbrauchsschutz | Eigene Mengenbegrenzung je IP auf fünf Endpunkten, ohne neue Abhängigkeit. 429 mit Wartezeit im Klartext. |
| Indexierung | `robots.txt`: nur die Startseite, Bilder ausdrücklich erlaubt (sonst leere Vorschaukacheln). |
| Monitoring | `backend/lib/wache.js` — Mail nur im Fehlerfall, eine je Art und Tag. |
| Tour-Screenshots | Alle sechs neu, zeigen wieder die tatsächliche Bedienung. |

**Zur USA-Übermittlung:** Am 11.08.2026 auf der offiziellen DPF-Liste
nachgesehen (Eintrag 8907, LegalName „PLUS FIVE FIVE", Anzeigename „Resend").
Status der EU-US-Zertifizierung: **„Active — Re-certification under Review"**,
Nicht-HR-Daten erfasst, Prüfverfahren Selbstauskunft. Damit greift der
Angemessenheitsbeschluss vom 10.07.2023 (Art. 45 Abs. 1 DSGVO); die
Standardvertragsklauseln stehen zusätzlich im DPA und sind als Rückfall
genannt. **Wer das später prüfen lässt, fängt bei diesem Status an** — fällt
die Zertifizierung weg, muss Abschnitt 6 umgeschrieben werden.

### 0.0.3 Zwei kleine Oberflächen-Änderungen

- **Teilen-Fenster:** nur noch ein Knopf („Mit anderen teilen"). Der gestrichene
  war zugleich der Rückfall, wenn das Story-Bild nicht gebaut werden kann —
  deshalb springt der verbliebene in dem Fall auf Text und Adresse um.
- **Bewertungsfenster:** Der Taste-Score-Satz steht in eigener Zeile und in
  Klammern. Der Zwischenspeicher musste dafür von `textContent` auf `innerHTML`
  umgestellt werden, sonst wäre der Umbruch nach der ersten Bewertung weg.

### 0.0.4 Was dabei NICHT geprüft werden konnte

Hier läuft weder Docker noch Postgres. **Alles Datenbanknahe ist erst live
belegt** — die `feedback`-Tabelle entsteht beim Deploy über `migrate`.

Zwei Dinge stehen ausdrücklich noch aus:

- **Dass Caddy `X-Forwarded-For` wirklich setzt.** Lokal ist bewiesen, dass
  `req.ip` bei `trust proxy: 1` daraus liest. Steht im Protokoll beim Abweisen
  eine `172.x`/`10.x`-Adresse, teilen sich **alle Leute einen Topf** — deshalb
  schreibt der Zähler die erkannte Adresse mit.
- **Dass eine gemerkte Wache-Meldung beim nächsten erfolgreichen Versand
  mitfährt.** `mailer.js` liest den Anbieter beim Laden einmal, Fehlschlag und
  Erfolg sind im selben Lauf nicht zu erzeugen.

### 0.0.5 Nach dem Nachziehen der Übergabe: 14 weitere Commits am Abend

Die Abschnitte 0.0.1 bis 0.0.4 beschreiben den Stand von Commit `dfd9778`.
Danach lief am 11. August noch eine Sicherheits-Durchsicht (Opus) plus
Korrekturen — hier nachgetragen am 12. August.

**Härtung (fünf Commits):**

- **Session-ID wird beim Anmelden erneuert** (`d5c373d`) — Schutz vor
  Session-Fixation: `regenerate()` vor dem Setzen der `userId`, die alte
  Vor-Login-Cookie ist danach ausdrücklich nicht mehr eingeloggt.
- **Ingest-Secrets konstant-zeitig verglichen** (`71663db`, neuer Helfer
  `backend/lib/vergleich.js`): SHA-256 beider Seiten, dann
  `crypto.timingSafeEqual` — das Hashen gleicht zugleich die Pufferlängen an.
- **Caddy setzt Sicherheits-Header für jede Antwort** (`ff9af39`): HSTS ein
  Jahr (bewusst ohne `preload`), `X-Frame-Options: DENY` plus CSP
  `frame-ancestors 'none'` (der CSP-Header enthält **nur** diese Regel und
  berührt das Inline-Skript nicht), `nosniff`, `Referrer-Policy` (der
  Reset-Token leckt nicht über den Referer), Server-Header entfernt.
- **Rate-Limit auch für die öffentlichen Lese-Endpunkte** (`b856238`):
  `plots` 240/min, `kinos/orte`, `kinos`, `share/title`, `/t/…`, `share/qr`
  je 120/min je IP. `/api/titles` und `/api/streaming` bleiben bewusst
  ungedeckelt — sie laufen über den `listenCache` und treffen im Normalfall
  die Datenbank gar nicht.
- **`/api/search-log` bekommt ein IP-Limit** (`c5fb671`): 60 je Stunde — der
  anonyme Schreibpfad ließ sich vorher unbegrenzt vollschreiben.

**Korrekturen:**

- **Fremde Kino-Liste: Wischen blendet nicht mehr aus** (`df15578`).
  `darfAusblenden` prüft jetzt zusätzlich `!personenAnsicht()` — damit ist
  die dritte Ungereimtheit aus 3.5 erledigt. In sechs Zuständen gegengeprüft:
  nur die eigenen Ansichten erlauben weiterhin das Ausblenden.
- **Geteilter Titel zeigte den falschen Status** (`9dcad2b`): Das Popup
  zeichnete Watchlist/Gesehen, bevor `PROGRESS` geladen war — der erste Klick
  tat deshalb das Gegenteil des Angezeigten. Jetzt wartet
  `zeigeGeteiltenTitel` auf `STARTLADUNG`. Dazu ein neuer Knopf „Trailer
  ansehen" über die volle Breite, der auch ohne Konto funktioniert.
- **„Personen einladen" funktioniert ausgeloggt** (`859be0b`) — teilt dann
  den blanken App-Link ohne `?ref=`-Token. „Watchlist teilen" bleibt
  ausgeloggt bewusst gesperrt (dabei werden zwei Konten verknüpft).

**Dokumentation:** `DEPLOYMENT.md` enthält jetzt den server-seitigen
`deploy.sh` im Wortlaut (`eaeb143`) — der lag vorher nur auf dem Server und
hatte über einen veralteten Single-File-Mount schon einen stillen
Caddy-Fehler verursacht. Außerdem entstand `PLAN-INTERNATIONALISIERUNG.md`
(`3dfaac8`), der Arbeitsauftrag für den 12. August.

---

## 0. Was am 10. August dazukam (6 Commits)

| Commit | Inhalt |
|---|---|
| `e4f2057` | Filme, Serien und die Statusknöpfe schlagen sofort um statt nach der Liste |
| `b8e825d` | Suche: das getippte Zeichen wartet nicht mehr auf die Liste |
| `2dd9f2c` | Datenschutz: Serverstandort eingetragen, Entwurf für den Mailversand daneben |
| `f0a3c5e` | Anonyme Statistiken: Titel unter der Mindestzahl kommen gar nicht erst vor |
| `2d04e92` | Startlisten kommen aus dem Zwischenspeicher statt jedes Mal aus der Datenbank |
| `26350ca` | Taste-Score wird nur noch gerechnet, wenn sich die Markierungen geändert haben |

### 0.1 „Die Klicks sind nicht flüssig" — zwei Ursachen, beide gemessen

Gemeldet als „dauert immer etwas oder man muss ein zweites Mal klicken", für
Filme/Serien/Kino **und** für Watchliste/Gesehen/Neue entdecken.

**`setTab` zeichnete die Liste in derselben Aufgabe.** Die Hervorhebung am Tab
erschien deshalb erst, wenn die Liste fertig war — 27–50 ms auf dem Rechner, auf
dem Telefon ein Vielfaches. Genau das Muster aus 1.2, für das es
`nachDemZeichnen()` längst gibt: Die Statusknöpfe und die FSK-Stufen benutzten es
schon, **bei den Tabs war es übersehen worden.** Jetzt auch dort.

**Die Liste selbst war zu teuer.** `render()` legte für jeden der 33.000–41.000
Einträge einen Sortwert in eine `Map` und sortierte alles durch, um 25 Zeilen zu
zeigen. Der Vergleich holte dabei zweimal aus der Map: **26 ms allein fürs
Sortieren**, bei jedem Klick auf einen der fünf Knöpfe. `besteNachSortwert()`
sucht die besten `limit` Einträge stattdessen in einem Durchlauf über ein
`Float64Array` heraus.

| gemessen an 32.698 Einträgen | vorher | nachher |
|---|---|---|
| Tab-Klick, bis der Knopf umschlägt | 27–50 ms | **0,1 ms** |
| Liste bauen (Community-Bewertung) | 37 ms | **5 ms** |
| Liste bauen (Taste-Score) | 57 ms | **20 ms** |

Beim Taste-Score bleiben 17 ms fürs Ausrechnen der Punktwerte übrig — das ist
jetzt der Rest, und er blockiert den Knopf nicht mehr. Wer ihn auch noch loswerden
will, müsste `punkteFuer()` zwischenspeichern; der Preis dafür wäre, jede Stelle
zu kennen, die den Wert ungültig macht.

**Gegengeprüft, dass sich die Reihenfolge nirgends verschiebt:** vier Sortierungen
× fünf Statuskombinationen × drei Typkombinationen ergeben Zeichen für Zeichen
dieselben Top-25 wie vorher, ebenso Top-100, Top-500 und die vollständige Liste —
auch über die „Mehr laden"-Grenze hinweg. Möglich ist das, weil bei Gleichstand
nur bei **echt** größerem Wert verdrängt wird; das entspricht der bisherigen
Vollsortierung, denn `Array.prototype.sort` ist stabil.

### 0.2 Die Suche blockierte das eigene Tippen

Jeder Tastendruck baute die Trefferliste synchron neu auf: **76 ms**, bevor das
Zeichen überhaupt im Feld erschien. Aufgeteilt — sofort passiert nur das Billige
(der Zustand, den eine Suche herstellt, und die Knopfleiste dazu, zusammen unter
1 ms), die Liste folgt nach `SUCHE_RENDER_VERZOEGERUNG` = 120 ms Tippruhe.
Dieselbe Wartezeit wie die Vorschlagsliste darunter, beide erscheinen damit
gemeinsam statt versetzt. Gemessen: **76 ms → 0,1 ms** je Tastendruck.

`goHome()` bricht den wartenden Render ab — es leert das Feld und zeichnet selbst,
sonst käme 120 ms später dasselbe noch einmal.

### 0.3 Bewusst nicht geändert: das Wechseln zwischen Filme und Serien

Zur Sprache gekommen, mit „so lassen" entschieden. Der Vollständigkeit halber,
was dabei bekannt war:

```
Kino → „Filme"   ⇒ nur Filme
      → „Serien" ⇒ Filme UND Serien   ← kein Wechsel, Serien kommen dazu
      → „Serien" ⇒ wieder nur Filme   ← der zweite Klick nimmt sie zurück
```

Von „nur Filme" zu „nur Serien" braucht es zwei Klicks auf **verschiedene**
Knöpfe. Dazu ist der Klick auf den bereits alleinigen Typ **komplett tot**
(`setTab`, „letzter aktiver — läuft ins Leere") — er verhindert, dass beide Typen
ausgehen, sieht aber aus wie ein nicht erkannter Klick.

Die verworfene Alternative, falls es doch wieder aufkommt: *Klick auf einen Typ
zeigt nur diesen; ist er schon der einzige, kommt der andere dazu.* Eine Regel
statt zweier Sonderfälle, der Kino-Zweig in `setTab` fiele ersatzlos weg, und
kein Klick liefe mehr ins Leere. Preis: „beide" ist dann nicht mehr auf den ersten
Blick erreichbar.

### 0.4 Die Mindestzahl bei den anonymen Statistiken wird jetzt eingehalten

Abschnitt 9 der Datenschutzerklärung sagt zu, dass Titel „erst ab einer
Mindestzahl von Bewertungen einbezogen" werden. Im Code gab es das nicht —
allerdings auch gar keine Auswertung, in der es hätte greifen können. Es fehlte
also nicht eine Prüfung, sondern **die Stelle, an der so etwas entsteht.**

Die gibt es jetzt: `backend/lib/bewertungsstatistik.js`, ausgeleitet über
`npm run statistik` (`--csv` für die Datei). Bewusst **keine HTTP-Route** — was
an Dritte geht, soll ein Schritt von Hand sein und keine URL, die irgendwann
offen im Netz steht.

- **`MINDESTZAHL_BEWERTUNGEN = 20`**, durchgesetzt als `HAVING` auf der
  zusammengefassten Zahl. Hoch angesetzt, weil die Verteilung feiner ist als die
  Gesamtzahl: Sie zerfällt in zehn Stufen, und bei wenigen Bewertungen steht in
  einer Stufe schnell eine einzelne Person.
- **Neue Tabelle `title_rating_stufen`.** Zugesagt ist die *Verteilung* auf die
  Sterne-Stufen; `title_rating_stats` kennt nur Anzahl und Summe, daraus lässt
  sie sich nicht zurückrechnen. Ohne die Tabelle hätten die Bewertungen
  gelöschter Konten in der Verteilung still gefehlt. `kontoAufraeumen()` schreibt
  sie in derselben Transaktion mit, ebenfalls ohne Kennung und Zeitstempel.
- **Heute kommt damit kein einziger Titel in die Auswertung.** Gemessen auf dem
  Server: 247 Bewertungen auf 217 Titel, der meistbewertete hat drei; 218 Titel
  zurückgehalten, 0 aufgenommen. Das ist der Zweck, nicht ein Fehler.

Die Zahl 20 steht bewusst **nicht** in der Datenschutzerklärung — dort ist von
„einer Mindestzahl" die Rede. Sie lässt sich also ändern, ohne eine Zusage zu
ändern; nach unten sollte sie trotzdem niemand ohne Not schieben.

Eine Grenze bleibt offen benannt: Gezählt wird je `title_id`, und 591 Titel
stehen doppelt im Bestand (siehe 2.2). Ein solcher Titel erschiene zweimal mit
geteilter Zahl — was die Mindestzahl eher zu streng macht, also in die
unschädliche Richtung irrt.

### 0.5 Kaltstart und Klicks — zwei Stellen, an denen zu oft gerechnet wurde

Gemeldet als „die Hülle ist sofort da, die Titel erst nach drei Sekunden" und
„der Klick auf Filme und die Wechsel bei Watchliste/Gesehen/Neue entdecken sind
langsamer als alles andere". Zwei getrennte Ursachen, beide dasselbe Muster:
Etwas wurde bei jedem Aufruf neu gerechnet, was sich zwischen den Aufrufen gar
nicht ändert.

**Der Kaltstart lag am Server, nicht an der Leitung.** Beide Startlisten sind
für jeden Besucher identisch und ändern sich nur beim nächtlichen Import —
gebaut wurden sie trotzdem bei jedem Seitenaufruf, gleichzeitig, auf einem
2-GB-Server.

| | vorher | nachher |
|---|---|---|
| `/api/titles` bis zum ersten Byte | 1.583 ms | **41 ms** |
| `/api/streaming` bis zum ersten Byte | 1.649 ms | **193 ms** |
| beide Startlisten vollständig | ~2.460 ms | **942 ms** |
| zweiter Besuch (mit ETag) | — | **304, 0 Byte, 83 ms** |

`backend/lib/listenCache.js` hält die fertige Zeichenkette **und** die gepackte
Fassung — Caddy packt nicht noch einmal, wenn schon ein `Content-Encoding`
gesetzt ist. Beim Start werden beide Listen vorgewärmt, geleert wird an den drei
schreibenden Stellen (`bulk-ingest`, `streaming/ingest`, `/ensure`). Dazu holt
die Abfrage `plot` nicht mehr aus der Datenbank, wenn die Liste sie ohnehin
nicht mitschickt: 13 MB, die bisher bei jedem Aufruf von Postgres nach Node
gingen und dort weggeworfen wurden.

**Die Klicks lagen am Taste-Score.** Er hängt an den Markierungen, nicht an den
Filtern — gerechnet wurde er trotzdem bei jedem Klick für alle 41.271 Einträge.
Nachgestellt mit 600 markierten Titeln:

| Render mit Taste-Score | Zeit |
|---|---|
| vorher | **1.372 ms** |
| nur `scoreCand` entschlackt | 62 ms |
| dazu der Zwischenspeicher | **4 ms** |

Zwei Dinge zusammen. Erstens rechnete `scoreCand` teurer als nötig: Drei
`Object.keys`-Aufrufe legten je Kandidat ein Feld über das ganze Profil an (bei
600 Titeln gut 2.000 Namen), nur um zu fragen, ob überhaupt etwas drinsteht —
41.000 Mal. Und die Jahresnähe lief je Kandidat einmal komplett durch die
Jahresliste. Beides einmal in `profilAbschluss` vorbereitet.

Zweitens hält `punkteFuer` den Wert jetzt am POOL-Eintrag fest, mit einer
Kennung aus `PROFIL_STAND`, den beim Abgleich gewählten Personen und dem Zustand
von „Neue entdecken". `profilStandErhoehen()` zählt hoch, wo sich Markierungen
ändern — zusätzlich in `rebuild()` als Sicherheitsnetz. Ein eigenes Profil ohne
Kennung („Ähnliche Titel") wird bewusst nicht zwischengespeichert.

**Gegengeprüft:** 13.757 Kandidaten mit alter und neuer Rechnung im selben Lauf
und mit demselben Profil verglichen — keine einzige Abweichung, auch nicht in
den Rohbestandteilen. Und nach einer neuen Markierung liefert `punkteFuer`
wieder den frisch gerechneten Wert.

Was offen bleibt: Der **erste** Render nach einer Markierung kostet weiterhin
~47 ms, weil dann alle Werte neu entstehen. Das ist der Preis dafür, dass der
Score global von den Markierungen abhängt.

**Fallstrick beim Nachmessen:** Ein nachgestelltes Profil muss die richtigen
Feldnamen benutzen (`{seen, watchlist, rating}`, nicht `{s, w, r}`). Mit den
falschen Namen wirkt gar nichts markiert, das Profil bleibt leer — und die
Messung zeigt 40 ms, wo in Wirklichkeit 1.372 ms stehen.

## 1. Was am 9. August dazukam (5 Commits)

Die Sitzung ging über den 7. hinaus weiter. Das Wichtigste zuerst, weil es die
Bedienung grundlegend geändert hat.

| Commit | Inhalt |
|---|---|
| `a762d66` | Plan für den Filter-Umbau (`PLAN-FILTER.md`) |
| `4641de6` | Watchliste, Gesehen und Neue entdecken frei kombinierbar — auch im Kino |
| `e9f1820` | Filme und Serien sind Filter statt Tabs — eine Liste, eine Sortierung |
| `4a7d4eb` | Datenschutz: Hinweisboxen entfernt |
| `52f5496` | Nachladen und Bereichswechsel springen nicht mehr aus dem Bild |

### 1.1 Der Filter-Umbau — alles frei kombinierbar

Aus vier Listen, zwischen denen man umschaltete, ist **eine Liste mit Filtern**
geworden. Alle fünf Knöpfe verhalten sich gleich: an- und abwählbar, nichts
schaltet sich von selbst ab. **Beim Start ist alles an**, die Auswahl wird nicht
gemerkt — jeder Start sieht gleich aus.

```
[ Filme ✓ ] [ Serien ✓ ]  ‖  ( 🍿 Kino )
[ Watchliste ✓ ] [ Gesehen ✓ ] [ Neue entdecken ✓ ]
```

Kino bleibt eine eigene Seite (drei Zeitabschnitte), benutzt aber **dieselbe**
Statusauswahl und ist in der Reihe sichtbar abgesetzt (Trennlinie, runde Form) —
weil es als einziges dort die Seite wechselt statt zu filtern.

**Der Umbau hat mehr Code entfernt als hinzugefügt.** Weg sind: die
Ausschlussregel (`enforceDiscoverLock`), der eigene Kino-Zustand (`kinoStatus`),
der automatische Einstieg (`startEinstiegSetzen`/`EINSTIEGE`/`einstiegOffen`),
der zweite Typzustand der Suche (`sucheTypen`), die zweite Sortier-Erinnerung
und `applyFilter()`. Neu sind `TYPEN`, `typenAngleichen()`, `alleFilterAn()` und
`listenAnsichtHerstellen()`.

Zwei Dinge, die man beim Weiterbauen wissen muss:

- **`setTab(t)` schaltet UM.** Wer die Listenansicht nur herstellen will (Start,
  Logo), nimmt `listenAnsichtHerstellen()` + `alleFilterAn()`. Ein `setTab('filme')`
  beim Seitenaufbau würde Filme **abwählen**.
- **`aktiveTypen()` ist die einzige Wahrheit** dazu, welche Typen in der Liste
  stehen. `activeTab` gibt es noch, aber nur als abgeleiteten Bezugstyp für
  Leertexte — nie als Auswahl lesen.

Eine Ausnahme ist geblieben: **In einer fremden Liste ist „Neue entdecken"
gesperrt** — was jemand nicht markiert hat, ist keine Liste von ihm.

### 1.2 Drei Meldungen „der erste Klick wird nicht erkannt" — eine Ursache

Dreimal gemeldet, dreimal dasselbe Muster: **Der Klick wirkte sofort, aber an der
Stelle, auf die getippt wurde, stand danach nicht das Erwartete.** Nie ein
Klick- oder Geschwindigkeitsproblem.

| Fall | gemessen | behoben durch |
|---|---|---|
| Watchliste in „Neue entdecken" | Handler wartete auf die Server-Antwort (2–3 s) | erst zeichnen, dann senden — 27 ms |
| „Mehr anzeigen" im Kino | Knopf sprang 3733 px nach unten aus dem Bild, Neuaufbau dauerte 5 ms | `nachladenOhneSprung()` scrollt um die Differenz mit |
| Kino → Filme | `scrollY` blieb bei 3000, Tab-Reihe außerhalb des Bildes | `setTab` scrollt nach oben |

**Merksatz für die nächste solche Meldung:** Erst messen, ob der Klick ankommt
(er kam jedes Mal an), dann messen, was sich unter dem Finger bewegt.

### 1.3 Rechtstexte

Die vier gelben Hinweisboxen in `datenschutz.html` sind entfernt — sie waren für
die interne Arbeit gedacht, nicht für Besucher. **Zwei Angaben fehlen dadurch
still**, siehe 3.1.

Alle drei Rechtstexte setzten nur `color: #1a1a1a` und keine Hintergrundfarbe;
im Dunkelmodus stand fast schwarzer Text auf dunklem Grund. Sie haben jetzt
`color-scheme: light` und weißen Hintergrund.

---

## 2. Was am 6./7. August entstanden ist (14 Commits)

Der Reihe nach, weil mehrere davon aufeinander aufbauen:

| Commit | Inhalt |
|---|---|
| `bc5cc9c` | Startansicht greift wieder: Merker nicht schon beim Seitenaufbau verbrauchen |
| `d13fd89` | „Neue entdecken" schließt Watchliste/Gesehen aus, nicht nur beim Abgleich |
| `1e5f118` | Fremde Liste im Kino: „hat nichts markiert" ist nicht „keine fremde Liste" |
| `ac1cf83` | Einstieg: Blättern per Wischgeste nach links/rechts |
| `0edbb58` | Texte: Einstieg Seite 1, Hinweis zur angenommenen Einladung |
| `1b6c31e` | Match ohne Treffer: Satz zum Aufheben der Auswahl raus |
| `84eb40a` | Details: Genre-Reihe nur ab zwei Genres, getrennt von den Schlagwörtern |
| `0d3f2a2` | Jede Titelliste zeigt 25 Titel, „Mehr laden" hängt 25 an |
| `89726b5` | Nach dem Abgleich-Fenster: Filme mit Watchliste, Gesehen nur wenn nötig |
| `ab77e56` | Einstieg: beim Wischen gleitet der Inhalt, nicht das Fenster |
| `3c175d5` | Logo-Klick setzt auch die Sortierung auf die Automatik zurück |
| `915c18d` | Watchliste/Gesehen in „Neue entdecken" wirken sofort statt nach Sekunden |
| `ae25b3c` | Dubletten ausblenden: derselbe Titel erscheint nur noch einmal |
| `843b3bc` | Zweitnamen bleiben durchsuchbar, Fehlzuordnungen legen nichts mehr zusammen |

Dazu Änderungen an den Produktivdaten, die **nicht** im Git stehen (siehe
Abschnitt 2.3).

### 2.1 Die drei Fehler, die Nutzer gemeldet hatten

> Dieser Abschnitt ist **Vorgeschichte**. Mehrere hier genannte Bezeichner
> (`einstiegOffen`, `startEinstiegSetzen`, `kinoStatus`) gibt es seit dem
> 9. August nicht mehr — sie sind mit dem Filter-Umbau entfallen, siehe 1.1. Wer
> wissen will, wie es heute funktioniert, liest 0.1 statt hier.

**„Der Knopf reagiert erst beim dritten Klick."** Zwei unabhängige Ursachen, die
zusammen genau dieses Bild ergaben:

1. `setTab('filme')` beim Seitenaufbau verbrauchte den Merker `einstiegOffen`,
   den `startEinstiegSetzen()` danach braucht — die App startete deshalb für
   **jeden** im Katalog statt in der eigenen Watchliste.
2. Die drei Statusknöpfe waren additiv. Wer unter „Neue entdecken" stand und
   „Gesehen" antippte, hatte danach beides an — und weil die gemeinsame Liste
   nach Bewertung sortiert und bei 250 abgeschnitten wurde, gingen die eigenen
   Titel unter. Der Knopf leuchtete, die Liste blieb.

Beides behoben. Die Knöpfe schließen sich jetzt aus (Ausnahme: während einer
Suche sind bewusst alle drei an).

**„In Petes Liste stehen unter Kino 150 Titel, die er nie markiert hat."**
`/api/links/progress` liefert eine Person gar nicht erst zurück, wenn sie nichts
markiert hat (die Abfrage verbindet mit `user_progress`). `LINKED_PROGRESS[id]`
war dann `undefined` — und die Kino-Seite las das als „wir sind gar nicht in
einer fremden Liste" und fiel auf den **eigenen** Fortschritt zurück. Unter
Filme/Serien passierte das nicht, weil `sammleEintraege` einen eigenen Riegel
davor hat. Behoben an der Wurzel (jede verknüpfte Person bekommt beim Laden eine
Liste, auch eine leere) plus `fremderFortschritt()` als einzige Lesestelle, die
nie `undefined` liefert.

**„Der Watchliste-Knopf reagiert nicht."** Kein Klickproblem, sondern Wartezeit:
Beide Handler warteten auf die Server-Antwort, bevor überhaupt etwas passierte.
Jetzt wird erst gezeichnet, dann gesendet; bei einem Fehler kommt die Zeile
zurück. Gemessen mit künstlich um 3 s verzögertem Server: **27 ms** statt 2–3 s.
Die eigenen Listen waren davon nie betroffen (`toggleWatched` hat schon immer
nicht gewartet).

### 2.2 Dubletten — der größte Eingriff

Die 600 ursprünglich kuratierten Katalog-Titel kamen ohne TMDB-Kennung herein;
denselben Film gibt es meist ein zweites Mal aus dem TMDB-Abzug. **591 von 600.**
Wer einen davon markierte, bekam den Zwilling weiter unter „Neue entdecken".

Erkannt wird über die längst vorhandene, nur nie genutzte Tabelle
`title_tmdb_resolution` — **nicht über den Namen.** Der Name taugt dafür in
beide Richtungen nicht:

- gleicher Film, anderer Name: „Baby Reindeer"/„Rentierbaby",
  „Eternal Sunshine of the Spotless Mind"/„Vergiss mein nicht!",
  „Black Bird"/„In with the Devil"
- ähnlicher Name, anderer Film: „Gabriel's Inferno Part II"/„Part III",
  „Kill Bill Volume 1"/„Volume 2", „Inception"/„Inception: The Cobol Job"

Es bleibt der Eintrag mit den meisten Bewertungen, die anderen werden
**ausgeblendet, nicht gelöscht**. Drei Dinge hängen daran und dürfen bei
Änderungen nicht verlorengehen:

- `dublettenUmlegen()` zieht Markierungen und ausgeblendete Titel auf den
  beibehaltenen Eintrag um. **Ohne das verschwände die Liste von jedem, der
  seinerzeit den Katalog-Eintrag markiert hat** — beim Konto „Jan Schlö" wären
  das 21 von 27 Titeln gewesen.
- `luecken()` füllt Angaben auf, die nur der kuratierte Eintrag hat (bei 27
  Titeln steht die Regie nur dort). Das Poster gesondert und nur, wenn gar keines
  da ist: `poster64` hat beim Zeichnen Vorrang vor dem TMDB-Pfad.
- `aliasAufnehmen()` behält den Namen des ausgeblendeten Eintrags als
  Suchbegriff. 51 Titel sind dadurch unter zwei Namen auffindbar. Nötig, weil
  `original_title` nur bei **165 von 26.849** Titeln überhaupt gefüllt ist.

**Die Absicherung `passtZusammen()` ist kein Beiwerk.** Ein Paar wird nur
zusammengelegt, wenn zusätzlich die Regie übereinstimmt **oder** die Titel
ähnlich sind. Ohne sie wären „Your Name." und „Der letzte Samurai" aus der App
verschwunden (siehe unten). Vier Paare lehnt sie derzeit ab — sie stehen doppelt
da, was die richtige Richtung zu irren ist.

### 2.3 Vier falsche Zuordnungen gefunden und korrigiert (Datenänderung)

`title_tmdb_resolution` ist per TMDB-Suche entstanden und trifft nicht immer.
Alle 600 Katalog-Titel wurden gegen vier Größen geprüft, die kein Backfill
überschrieben hat (Titel, Regie, Jahr, Bewertung):

| Katalog-Titel | zeigte auf | korrigiert auf |
|---|---|---|
| `Your Name.` (55) | Call Me by Your Name | 372058 |
| `The Handmaiden` (132) | „Making of The Handmaiden" (5 Min.) | 290098 (Die Taschendiebin) |
| `Der letzte Samurai` (221) | The Last Sword (壬生義士伝) | 616 (Last Samurai) |
| `Birdman` (249) | Birdman 2015 (13 Min., Bolongaro) | 194662 |

Der Schaden war größer als die reine Zuordnung: `backfill-catalog-meta.mjs`
hatte **Stimmenzahl und Altersfreigabe**, `backfill-catalog-posters.mjs` den
**Poster-Pfad** vom falschen Film übernommen — und dabei das kuratierte
Base64-Bild gelöscht. Diese vier Felder wurden auf den vier Zeilen geleert, damit
der jeweils richtige Zwilling die Entdopplung gewinnt. Ohne diesen zweiten
Schritt hätte „Your Name." weiterhin das Poster von „Call Me by Your Name"
gezeigt: Der verfälschte Eintrag hatte mit 12.856 Stimmen mehr als der echte
Film mit 12.799.

**Sicherungen auf dem Server:** `title_tmdb_resolution_backup_20260807` (600
Zeilen) und `titles_backfill_backup_20260807` (4 Zeilen). Beide Änderungen sind
reine Datenkorrekturen und stehen **nicht** im Git — bei einem Neuaufbau der
Datenbank aus einem älteren Stand wären sie wieder weg.

**Restrisiko, offen benannt:** Eine Fehlzuordnung, bei der zufällig *sowohl*
Titel als *auch* Bewertung passen, entgeht dieser Prüfung. Bei 99 % der Paare
liegt die Bewertungsabweichung unter 1,0 und die Titel stimmen überein — klein,
aber nicht null.

Fünf Katalog-Titel haben gar keine Zuordnung (`tmdb_id IS NULL` in
`title_tmdb_resolution`): Die grüne Meile, Der Aviator, Twin Peaks: The Return,
Killing Eve, Das Boot (Serie). Sie sind unbeschädigt — nur ohne Stimmenzahl und
noch mit ihrem Originalbild.

---

## 3. Was jetzt noch offen ist

Die Liste vom 7. August („Uneinheitliches in der Bedienung") ist durch den
Filter-Umbau vom 9. August weitgehend erledigt. Was davon übrig blieb, steht
unten mit dabei.

### 3.1 Rechtstexte — nur noch die anwaltliche Prüfung

**Abschnitt 6 (E-Mail-Versand) ist seit dem 11. August geschrieben**
(`682ab97`, nach dem Entwurf aus `ENTWURF-DATENSCHUTZ-MAIL.md`): Resend
namentlich genannt, USA-Übermittlung mit DPF-Status belegt (siehe 0.0.2),
Feedback vollständig beschrieben. Der Serverstandort steht seit dem 10. August
in Abschnitt 5 (Falkenstein, ermittelt statt geschätzt).

Offen ist allein die **Prüfung durch eine Anwältin oder einen Anwalt**,
ausdrücklich vertagt (Entscheidung 4 des Test-Plans). Sinnvollerweise als
**ein** Sammelauftrag, denn die Liste ist seit dem 12. August gewachsen:

- `datenschutz.html` komplett — inklusive Abschnitt 6 und des als Entwurf
  entstandenen Abschnitts 9 (kommerzielle Verwertung) — und `impressum.html`.
- Die **englischen Arbeitsfassungen** `imprint.html`/`terms.html`/
  `privacy.html` (seit dem 12. August bei Sprache EN verlinkt; jede trägt den
  Hinweis, dass die deutsche Fassung maßgeblich ist).
- Der **Nachtrag zu den Benachrichtigungs-Mails** (siehe 0.0.0.3, Text in
  `IDEEN.md`).
- Die **Nicht-EWR-Frage**: USA (CCPA/CPRA/COPPA), dazu CA/AU/NZ/MX/AR/CL/CO/BR
  mit ihren nationalen Gesetzen — bis zur Klärung kein aktives Marketing
  außerhalb des EWR (`PLAN-INTERNATIONALISIERUNG.md`, Abschnitt 4).

### 3.2 Englische Titel durchsuchbar — am 12. August umgesetzt, anders als geplant

Der hier zuvor beschriebene Einzelplan (Spalte `title_en`, wortgenaue Suche)
ist in der Internationalisierung aufgegangen: `title_en` kommt seither aus den
Fetch-Skripten über `append_to_response=translations` (keine Zusatzabrufe),
und die Suche findet anderssprachige Titel über `titleAlt` (`63e5933`) — der
englische Titel für die deutsche Oberfläche und umgekehrt, nur wenn
abweichend, in den Suchvorschlägen als „Alternativtitel".

**Für den Bestand greift das erst nach dem Englisch-Backfill** — dessen
Erledigung ist ungeprüft, siehe 3.7. Die Messwerte des alten Plans (57 % der
Titel heißen englisch anders, wortgenau statt Teilstring) stehen in der
Git-Historie dieser Datei, falls sie wieder gebraucht werden.

### 3.3 Match filtert im Kino nicht — ausdrücklich so gewollt

| | Watchliste/Gesehen | Neue entdecken |
|---|---|---|
| Filme/Serien | Schnittmenge mit allen Ausgewählten | ungefiltert, gemeinsame Sortierung |
| Kino | **eigene** Markierungen, kein Filter | ungefiltert, gemeinsame Sortierung |

Am 7. August bestätigt („ok so lassen"). Einziger Hinweis darauf ist der
Leistentext: „Kino-Vorschläge für dich und X" statt „Gemeinsame Titel mit X".
**Nicht ändern, ohne das erneut zu besprechen.**

### 3.4 Eigene Titel verschwinden bei den anderen Sortierungen

Mit allen Filtern an hängt es an der Sortierung, ob man seine eigenen Titel noch
sieht. Gemessen, eigene Titel unter den ersten 25:

| Sortierung | 561 markiert | 50 markiert | 12 markiert |
|---|---|---|---|
| **Taste-Score** (Standard ab 10 Titeln) | 18 von 25 | 18 von 25 | 8 von 25 |
| Community-Bewertung | **0 von 25** | 0 von 25 | 0 von 25 |
| Veröffentlichungsdatum | 2 von 25 | 0 von 25 | 0 von 25 |

Der Taste-Score wird aus den markierten Titeln gebaut, deshalb stehen sie dort
oben. Bei den anderen beiden nicht.

**Bewusst so belassen** (Entscheidung vom 9. August): Wer nur die eigenen sehen
will, schaltet „Neue entdecken" ab — das ist eine Entscheidung der Person, nicht
des Programms. Hier notiert, falls es sich in der Praxis doch als störend
erweist; die Abhilfe wäre, eigene Titel bei den anderen Sortierungen vorzuziehen
oder beim Umschalten darauf hinzuweisen.

### 3.5 Kleineres aus der Durchsicht vom 7. August

Alles im laufenden Build gemessen, nicht aus dem Code geschlossen.

- **Der Taste-Score bedeutet drei Dinge, ohne dass es dransteht.** Derselbe
  Titel: allein **37**, mit Abgleich + Entdecken **44**, in einer fremden Liste
  **37**. Vorschlag: bei gemeinsamer Rechnung an der Erklärung ergänzen („für
  dich und Pete"), die Zahl selbst muss nicht anders aussehen.
- **Ein Leerzustand behauptet etwas Falsches.** Fremde Liste + eigener
  Streaming-Filter ohne Treffer → „Pete hat hier nichts markiert." Falsch — Pete
  hat fünf Titel, der Anbieterfilter hat sie weggenommen.
- **Zwei Schwellen für dasselbe:** Die Texte nennen inzwischen einheitlich
  **20** Titel (`4621a26` hat die Anleitung angepasst), aber `effectiveSort`
  schaltet weiterhin bei **10** markierten Titeln auf den Taste-Score um. Kein
  Widerspruch mehr im Wortlaut, doch die Zahl im Text und die Schwelle im Code
  sind verschiedene Werte.
- **„Neue entdecken" ist in fremden Listen ausgegraut** — richtig so, aber es
  steht nirgends warum.

### 3.6 Erledigt (nicht erneut aufmachen)

- Kino führte eine eigene Statusauswahl → **behoben** (`kinoStatus` entfernt).
- Die drei Status schlossen sich aus → **behoben** (frei kombinierbar).
- Suche + Abgleich verhielten sich im Kino anders → **entfällt** mit dem
  gemeinsamen Zustand.
- Sortierung war je Bereich getrennt → **behoben** (eine Sortierung).
- Die Tab-Reihe sah aus wie ein Filter, war aber ein Seitenwechsel → **behoben**
  (Filme/Serien filtern jetzt wirklich, Kino ist abgesetzt).
- Tab- und Statusknöpfe reagierten träge → **behoben** am 10. August (siehe 0.1).
  Die Liste wird nicht mehr vollständig sortiert, und `setTab` zeichnet sie erst
  nach dem Bildaufbau.
- Tippen in der Suche hakte → **behoben** am 10. August (siehe 0.2).
- Serverstandort fehlte in der Datenschutzerklärung → **eingetragen** (siehe 3.1).
- **Mindestzahl bei den anonymen Statistiken nicht durchgesetzt** →
  **behoben** am 10. August (siehe 0.4). Es gibt jetzt genau eine Stelle, an der
  eine solche Auswertung entsteht, und die Mindestzahl steckt darin.
- **„4,2 MB Base64-Poster gehen über die Leitung"** → **erledigt, nicht wieder
  aufnehmen.** Am 10. August in der Produktionsdatenbank nachgezählt: Von den
  600 eingebetteten Bildern sind noch **5** übrig, zusammen **31 kB**. Die
  anderen **595** hat `backfill-catalog-posters.mjs` durch echte TMDB-Pfade
  ersetzt; die Originale liegen in `titles_poster_base64_backup` (595 Zeilen),
  der Rückweg steht im Kopf des Skripts. Die Auslieferung besteht heute aus
  Besetzung (21 %), Poster-Pfaden (13 %) und Genres (11 %) — Base64 kommt darin
  nicht mehr vor. Wer die Auslieferung kleiner machen will, fängt bei der
  Besetzung an, nicht bei den Bildern.
- **Wischen in einer fremden Kino-Liste blendete den Titel für einen selbst
  aus** → **behoben** am 11. August (`df15578`, siehe 0.0.5).
- **Geteilter Titel zeigte den falschen Status** (erster Klick tat das
  Gegenteil) → **behoben** am 11. August (`9dcad2b`, siehe 0.0.5).
- **Englische Titel waren nicht durchsuchbar** → **umgesetzt** am 12. August
  über die Internationalisierung (siehe 3.2); für den Bestand hängt es noch
  am Backfill (3.7).

### 3.7 Betriebsschritte der Internationalisierung — Stand ungeprüft

`PLAN-INTERNATIONALISIERUNG.md`, Abschnitt 9, listet einmalige Schritte, die
**auf dem Server** laufen müssen. Ob sie schon gelaufen sind, ist nirgends
vermerkt — **vor dem Abarbeiten also erst auf dem Server nachsehen** (etwa:
wie viele `titles` haben `title_en`? Gibt es PLZ-/Kino-Zeilen für AT und die
neuen Länder?). Die Schritte:

1. **Englisch-Backfill für den Bestand**: `backend/scripts/backfill-english.mjs`
   (~27.000 TMDB-Abrufe, mehrere Stunden, abbrechbar/fortsetzbar — erst mit
   `--limit=500` probelaufen). Bis dahin fällt die App bei EN und den anderen
   Sprachen auf deutsche Titel/Plots zurück; nichts bricht.
2. **Freigaben-Backfill**: dasselbe Skript mit `--nur-freigaben` — ergänzt die
   Altersfreigaben der neuen Länder auf dem ganzen Bestand. Bis dahin blendet
   der Familienfilter dort im Zweifel aus statt ein.
3. **PLZ- und Kino-Importe** für AT und die 38 weiteren Länder
   (`import-plz.mjs`, `import-kinos.mjs` — die vollständigen Befehlszeilen
   stehen im Plan). Overpass braucht bei US/CA/AU deutlich länger; GR hat
   keinen GeoNames-Abzug und wird übersprungen (`63e5933`).
4. Die **Workflows** befüllen die Regionen von selbst — dort ist nichts zu tun.

### 3.8 Ausgeblendete Funktionen warten auf eine Entscheidung

Alle fertig gebaut und nur abgeschaltet; Handler, Routen und Übersetzungen
stehen bereit:

- **Movie Night** (`ed9a240`, siehe 0.0.0.4) — inklusive Backend-Routen und
  Tabellen. Die Tabellen entstehen beim Deploy mit; es sammelt sich dort
  nichts an, solange der Knopf unsichtbar ist.
- **„Personen einladen" im Menü rechts oben** (`0077535`, siehe 0.0.0.5) —
  der Referral-Weg mit `?ref=`-Token. Solange er unsichtbar ist, wird
  `users.invited_by_user_id` bei Neuregistrierungen kaum noch gefüllt.
- **Taste-Match hinter den Namen** (13. August, siehe 0.0.0.0) — die Zahl in
  Klammern unter „Gemeinsam schauen". Zum Reaktivieren
  `TASTE_MATCH_SICHTBAR = true`; Berechnung, neutraler Stil und das
  Info-Popup `tastematch` (sieben Sprachen) sind fertig.

Wer davon etwas reaktiviert, sollte danach die Tour-Screenshots prüfen
(3.9).

### 3.9 Übersetzungen und Tour-Screenshots

- **Muttersprachler-Review**: Die Oberflächentexte in fr/es/it/nl/pt sind
  maschinell erstellt und nicht muttersprachlich geprüft. Je Sprache liegt
  eine Review-Datei (alle Texte mit englischer Referenz nebeneinander) bei
  Christian für die Durchsicht.
- **Die Tour-Screenshots (`tour/*.png`) sind wieder veraltet.** Sie wurden am
  11. August neu erzeugt — seither kamen das Sprach-/Regionsmenü, neue
  Einstellungen-Punkte (Import, Benachrichtigungen), der Umbau bei „Gemeinsam
  schauen" und die Umbenennung „Watchlist teilen" → „Personen einladen" dazu.
  Entschieden ist, sie erst zu aktualisieren, **wenn die Oberflächen-Änderungen
  durch sind** — dieser Punkt hält fest, dass es dann wirklich passieren muss.

## 4. Offen aus früheren Sitzungen

### Rechtliches, vor Go-Live bzw. App Store

- ~~Abschnitt 6 von `datenschutz.html`~~ — **am 11. August geschrieben**
  (siehe 0.0.2). Offen bleibt allein die **anwaltliche Prüfung** — deren
  Umfang ist seit dem 12. August gewachsen und steht vollständig in 3.1.
- Privacy Nutrition Labels und Altersfreigabe im Store-Formular; Konten
  (Apple 99 $/Jahr, Google 25 $ einmalig).

### Technisch

- ~~**Feedback wird nicht gespeichert**~~ — **am 11. August erledigt.** Es geht
  jetzt zuerst in die Datenbank und danach als Mail hinaus; `npm run feedback`
  liest es aus.
- ~~**Tour-Screenshots in `tour/` sind veraltet.**~~ — **am 11. August neu
  erzeugt** und gegen die Beschriftungen gehalten (siehe 0.0.2).

- **Einladungen lassen sich nicht zurückziehen**, und Links gelten für beliebig
  viele Personen. Eine Liste der offenen Einladungen mit Schließen-Knopf wäre der
  nächste Schritt.
- **`users.invited_by_user_id`** wird gefüllt, aber nirgends gelesen oder
  angezeigt. Seit dem 11. August teilt der ausgeloggte Einladungsweg ohnehin
  ohne `?ref=`-Token (`859be0b`), und der Navi-Einstieg ist seit dem
  12. August ausgeblendet (siehe 3.8) — die Spalte wächst also kaum noch.
- **Community-Bewertung fließt gar nicht in den Taste-Score** ein. Offen, ob sie
  in anderer Form zurück soll (Idee: Dämpfung nur am unteren Ende).
- **Aktionszeile bei 320px** bricht auf vier Zeilen um; nur über eine kürzere
  Beschriftung als „Ähnliche Titel" lösbar.
- **Prüfung von außen fehlt.** Die Wache meldet Störungen per Mail, aber ein
  stehender Server meldet nichts — wer nicht läuft, schreibt auch keine Mail.
  Bewusst vertagt (Entscheidung 4 des Plans). Wer es nachrüstet, braucht einen
  Dienst außerhalb des Servers, der movietaste.de regelmäßig abruft.

### Bewusst nicht gemacht

Rückseiten von DVD/Blu-ray (TMDB kennt sie nicht) · Wiederaufführungen im Kino
kennzeichnen · Match filtert im Kino nicht (siehe 3.3) · eigene Titel bei den
anderen Sortierungen vorziehen (siehe 3.4).

„Filme und Serien gemeinsam anzeigen" stand hier jahrelang als bewusst
abgelehnt. **Das ist seit dem 9. August umgesetzt** — der Typ ist keine
Tab-Achse mehr, sondern ein Filter.

---

## 5. Fallstricke aus den bisherigen Sitzungen

**Ein einmal eingeführtes Muster gehört überall hin, wo es passt.**
`nachDemZeichnen()` existiert seit dem 7. August und stand danach an den
Statusknöpfen und den FSK-Stufen — bei `setTab` fehlte es, und genau dort kam
einen Tag später dieselbe Meldung („reagiert träge") wieder herein. Nach so einer
Einführung einmal danach suchen, wer sonst noch synchron rendert.

**Teuer ist selten das Zeichnen, sondern das Rechnen davor.** Die Liste zeigt 25
Zeilen; die Zeit ging für das Sortieren von 33.000 Einträgen drauf, die nie
jemand sieht (siehe 0.1). Vor dem Optimieren messen, welcher Teil es ist — hier
waren es 26 der 37 ms, und das Zeichnen selbst nur 2,5 ms.

**„Reagiert nicht" hiess dreimal „bewegt sich unter dem Finger weg".** Bei jeder
der drei Meldungen kam der Klick an — messbar, sofort. Verwirrend war jedes Mal,
dass an der getippten Stelle danach etwas anderes stand. Vorgehen, das jedes Mal
funktioniert hat: erst per `elementFromPoint` prüfen, ob der Knopf ueberhaupt
getroffen wird, dann die Dauer des Handlers messen, dann die Position des
Elements VOR und NACH dem Klick vergleichen. Die Position war zweimal die
Antwort, die Dauer einmal.

**Nach einem Umbau der Auswahl-Logik zuerst die Aufrufer prüfen, nicht die
Funktion.** `setTab` schaltet seit dem 9. August um statt zu wechseln — die
beiden bestehenden Aufrufe (Seitenaufbau, Logo) hätten damit „Filme"
**abgewählt**. Das fiel nur auf, weil ich die Aufrufliste durchgegangen bin,
nicht weil ein Test fehlschlug.

**Die Vorschau ist zwischen zwei Werkzeugaufrufen unsichtbar.** `document.hidden`
ist dort `true`, und damit feuert **`requestAnimationFrame` nicht**. Alles, was
über `nachDemZeichnen()` läuft (Statuswechsel, FSK-Knöpfe), passiert dann
schlicht nicht — eine Messung „der Klick bewirkt nichts" ist in dieser Umgebung
wertlos. Vor der Messung einen Screenshot machen, das holt die Seite nach vorn.
Hat mich beim ersten Anlauf auf eine völlig falsche Fährte geführt.

**Wortweise Ähnlichkeit: Wiederholungen zählen doppelt.** „The Last Sword — **Der**
letzte Feldzug **der** Samurai" enthält „der" zweimal und kam gegen „Der letzte
Samurai" auf 4/7 statt 3/7 — knapp über der Schwelle, und damit hätte die
Absicherung genau den Fall durchgelassen, für den es sie gibt. `titelAehnlich()`
entdoppelt deshalb vor dem Vergleich.

**Die TMDB-Suche stellt „Making of X" vor X.** Bei „The Handmaiden" ist der
5-Minuten-Clip der erste Treffer. Wer per Suche auflöst, braucht eine Prüfung
gegen Laufzeit oder Regie — die Laufzeit (5 gegen 145 Minuten) ist das
eindeutigste Merkmal und steht bei uns nirgends.

**`title_tmdb_resolution` wird auch von den Backfill-Skripten gelesen.** Eine
falsche Zeile dort schreibt Poster, Stimmenzahl und Freigabe des falschen Films
in `titles` — und löscht dabei das kuratierte Base64-Bild unwiederbringlich. Vor
dem nächsten Backfill-Lauf lohnt eine Kontrolle der Zuordnungen.

**Commits aufteilen ohne `git add -p`:** `git diff -U6 > x.patch`, die Hunks per
Skript auf mehrere Patch-Dateien verteilen, dann je Commit
`git apply --cached --recount`. Vorher einmal alle Patches nacheinander anwenden
und `git show :index.html` gegen den geprüften Endstand diffen — das fängt einen
Fehler in der Aufteilung, bevor Commits entstehen.

**Zum Testen ohne eigene Datenbank:** `node scripts/tour/server.mjs` liefert die
lokale `index.html` aus und reicht `/api` an die Produktion durch (Port 4600).
Man ist dabei abgemeldet — angemeldete Fälle lassen sich nachstellen, indem man
`PROGRESS`, `LINKED_PROFILES` und `LINKED_PROGRESS` in der Konsole setzt und
`rebuild()` aufruft.

---

## 6. Bekannte Einschränkungen

- ~~Favoriten in der Personenliste liegen nur im Browser~~ — **gegenstandslos**
  seit dem 12. August: Das Herz ist komplett entfernt (`da0e399`), die
  Personenliste steht in Server-Reihenfolge (Verknüpfungsdatum).
- **Match im Kino** filtert nicht, sondern sortiert um (siehe 3.3).
- **Manuelle Sortierung verfällt nach 24 Stunden** (`SORT_MANUAL_MAX_AGE_MS`) und
  wird bei Login/Logout sowie beim Logo-Klick zurückgesetzt. Seit dem 9. August
  gibt es nur noch **eine** Sortierung für die Liste (Schlüssel `top200-sort-v3`).
- **Die Filterauswahl wird nicht gemerkt.** Jeder Start beginnt mit allem an;
  das ist so entschieden, nicht vergessen worden.
- **Alte Einladungslinks sind einlösbar**, auch mehrfach benutzte.
- **Vier von 591 Dubletten bleiben doppelt stehen** — die Absicherung lehnt sie
  ab, weil weder Regie noch Titel übereinstimmen („Komm und sieh"/„Come and
  See", „Engel in Amerika"/„Angels in America"). Das ist die richtige Richtung
  zu irren.
