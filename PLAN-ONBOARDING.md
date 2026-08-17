# Onboarding: vom ersten Besuch zum gefüllten Konto

> Stand 17. August 2026. Entschieden mit Christian; offene Punkte sind unten
> ausdrücklich als solche markiert. Ergänzt Vorschlag **A** aus
> `IDEEN-WACHSTUM.md` (Kennenlern-Strecke) um alles, was NACH der Anmeldung
> passiert.

## Das Ziel

Zwei Dinge sollen zusammenfallen: Vorfreude beim ersten Kontakt, und ein Konto,
das nicht leer ist. Wer die App nach der Anmeldung mit leerer Watchlist, ohne
Anbieter und ohne Taste-Score betritt, sieht ein Werkzeug, das nichts kann —
und kommt nicht wieder.

---

## 1. Der Ablauf

```
Erster Besuch (ohne Konto)
  └─ Kennenlern-Strecke  (existiert, bleibt unverändert)
       ├─ „Konto erstellen“  ──┐
       └─ „Nur Liste zeigen“ ──┤ später „Anmelden“ ──┐
                               │                     │
Registrierung / erste Anmeldung ◄────────────────────┘
  └─ Onboarding-Fenster, fünf Schritte
       1. Titel bewerten        (entfällt, wenn schon Marken da sind)
       2. Wie schaust du?
       3. Lieblings-Genres
       4. Streaming-Anbieter
       5. Deine Kinos
       ── Ergebnis: „Das passt zu dir“ (drei Titel aus dem frischen Score)
       ── Teilen-Fenster
```

Der Übergang von der Kennenlern-Strecke ins Konto ist **bereits gebaut**: die
Marken liegen in `localStorage` (`mt.kennenlernMarken`) und werden bei Login wie
Registrierung über `onboardingMarkenUebernehmen()` aufs Konto geschrieben, bevor
der Fortschritt geladen wird (`index.html`, Auth-Formular). Daran ändert dieser
Plan nichts.

---

## 2. Die fünf Schritte im Einzelnen

Alle Schritte sind **Pflicht** — es gibt keinen „Überspringen“-Link. Damit
„Pflicht“ aber keine Sackgasse wird, hat jeder Schritt eine gültige
Nein-Antwort (siehe „Ausweg“). Ohne die säßen Leute ohne Abo, ohne Kino in der
Nähe oder ohne Titelkenntnis dauerhaft fest — und ein Onboarding, aus dem man
nicht herauskommt, kostet genau die Person, die man gewinnen wollte.

Ein Zurück-Pfeil führt jederzeit einen Schritt zurück. Jeder Schritt speichert
sofort beim Weitergehen, nicht erst am Ende.

### Schritt 1 — Titel bewerten

Nur, wenn das Konto noch keine Markierungen hat (also: die Kennenlern-Strecke
wurde per ✕ abgebrochen, oder es kam nie eine). Sonst wird der Schritt
übersprungen und die Anzeige beginnt bei 2.

Technisch dieselbe Strecke wie beim ersten Besuch (`kennenlernStarten`), nur
angemeldet: die Marken gehen direkt per API aufs Konto.

- **Ziel:** 15 Titel, angezeigt als „7 / 15“
- **Ausweg:** ab **5** Marken wird „Weiter“ freigegeben. Wer 15 unbekannte
  Titel bekommt, käme mit „Kenn ich nicht“ sonst nie ans Ziel.

### Schritt 2 — „Wie schaust du?“

Mehrfachauswahl als Kacheln, mindestens eine. Mehrfach, weil sich die Typen
nicht ausschließen (Kino *und* Netflix).

| Schlüssel | Text (de) |
|---|---|
| `selten` | Eher selten – dann muss es sich lohnen |
| `serien` | Serien-Marathon am Wochenende |
| `kino` | Regelmäßig im Kino |
| `streaming` | Was gerade bei Netflix, Prime & Co läuft |
| `sammlung` | Eigene Sammlung (DVD, Blu-ray, 4K) |
| `klassiker` | Klassiker und Filmgeschichte |

- **Ausweg:** nicht nötig — `selten` deckt jeden Fall ab.
- **Entschieden:** Die Antwort steuert den Ablauf **nicht**. Schritt 5 kommt
  für alle, auch für die, die „Regelmäßig im Kino“ nicht angehakt haben.

### Schritt 3 — Lieblings-Genres

Chips zum Antippen, Zähler „2 von 3“, „Weiter“ ab drei Auswahlen.

Erste Reihe (die häufigsten, nach Katalogbestand): Action, Komödie, Drama,
Thriller, Science Fiction, Horror, Liebesfilm, Animation, Abenteuer, Krimi,
Dokumentarfilm, Fantasy.

Dazu die Themen-Schlagwörter, die keine TMDB-Genres sind, bei uns aber als
Schlagwort gepflegt werden (`backend/lib/themen.js`): **True Crime**, **Nach
wahrer Begebenheit**, **Superheld**, **Zeitreise**.

„Weitere Genres …“ klappt eine zweite Reihe auf: Western, Musik, Historie,
Kriegsfilm, Mystery, Familie, TV-Film. **Kein Freitextfeld** — Freitext ist
schlecht auswertbar und gehört nach unserer eigenen Regel (`backend/lib/track.js`)
nicht in Auswertungsdaten.

- **Ausweg:** nicht nötig — drei aus rund zwanzig findet jeder.
- **Entschieden:** Die Genres fließen **nicht** in den Taste-Score ein. Der
  Score rechnet weiter aus echten Bewertungen; behauptete Vorlieben würden ihn
  verwässern. Verwendung später: Vorauswahl der Filter, Vorschläge in der
  Wochenend-Mail.

### Schritt 4 — Streaming-Anbieter

„Welche Anbieter nutzt du?“ (nicht „bezahlst du“ — dieselbe Antwort, weniger
heikel, und Gratis-Angebote werden korrekt erfasst). Mehrfachauswahl aus der
bestehenden, regionsabhängigen Anbieterliste; „Weitere Anbieter …“ klappt die
vollständige Liste auf.

Gespeichert wird in `users.watch_provider_ids` — **dieselbe Spalte wie
Einstellungen → Streaminganbieter.** Kein zweiter Speicherort.

- **Ausweg:** „Ich nutze keinen“ → leeres Array. Das ist im bestehenden Modell
  bereits der Zustand „bewusst nichts gewählt, also nicht filtern“ und passt
  damit genau.

### Schritt 5 — Deine Kinos

PLZ-/Ortssuche wie in den Einstellungen (`/api/kinos/orte`), dazu ein Knopf
„Standort verwenden“. Nach der Suche die Kinos im 25-km-Umkreis, die nächsten
**zehn** zuerst, Mehrfachauswahl. Gespeichert in `user_kinos` — wieder
derselbe Ort wie in den Einstellungen.

**Standortermittlung im Browser:** funktioniert auch ohne native App
(`navigator.geolocation`), verlangt HTTPS (haben wir) und einen Klick als
Auslöser. Genauigkeit am Rechner oft nur stadtgenau — für 25 km reicht das.
Zwei Bedingungen: die Koordinate wird **nur zur Suche benutzt und nirgends
gespeichert**, und die Ortssuche steht gleichberechtigt daneben (wer im Browser
„Nie erlauben“ gewählt hat, bekommt sonst nie wieder einen Dialog).

- **Ausweg:** „Ich gehe nicht ins Kino“ — und derselbe Weg automatisch, wenn
  die Umkreissuche nichts findet (ländliche Gegenden, Länder mit dünnem
  OSM-Bestand). Ohne diesen Ausweg wäre der Pflichtschritt für diese Leute
  eine Sackgasse.
- **Bekannt:** Die Kinoauswahl hat heute keine Wirkung in der App — Spielpläne
  sind eine andere, kostenpflichtige Quelle (siehe `PLAN-KINOS.md`). Der
  Schritt sammelt also vorerst nur Daten. Das ist eine bewusste Entscheidung.

### Abschluss — „Das passt zu dir“

Kein reines „Gespeichert“. Der frisch gerechnete Taste-Score und drei
Titel mit Poster, die dazu passen — der Beweis, dass die letzten zwei Minuten
etwas gebracht haben. Darunter „Los geht’s“.

### Danach — Teilen

Eigenes Fenster: „Teile die App mit Freunden – seht gegenseitig eure
Watchlists und stimmt für den gemeinsamen Filmabend ab.“

Technisch der bestehende Referral-Weg: `POST /api/links/invite` mit
`kind: 'referral'` erzeugt einen `?ref=`-Link ohne Ablaufdatum, und wer sich
darüber anmeldet, bekommt `users.invited_by_user_id` gesetzt. **Die Zuordnung
zum teilenden Konto ist damit ohne weiteres Zutun vorhanden** und taucht in
`npm run metrik` auf.

Wichtig: `navigator.share` öffnet auf iOS nur innerhalb einer frischen
Nutzergeste. Das Fenster darf also **nicht** automatisch teilen — geteilt wird
erst auf den Knopf darin (dieselbe Fußangel ist in `einladungTeilen` schon
kommentiert).

---

## 3. Abbruch und Wiedervorlage

Das Fenster lässt sich per ✕ schließen — „Pflicht“ heißt, dass es keinen
Überspringen-Link gibt, nicht dass man gefangen ist.

- Der Stand wird je Schritt gespeichert; beim nächsten Anlauf geht es dort
  weiter, wo aufgehört wurde.
- **Drei Anläufe insgesamt:** der erste direkt nach der Anmeldung, danach noch
  zwei Wiedervorlagen bei je einer späteren Anmeldung (nicht im selben Besuch
  erneut).
- Danach nie wieder automatisch. Wer dreimal weggeklickt hat, will nicht.

## 4. Bestandskonten

Bekommen den Prozess einmalig beim nächsten Login, nach denselben Regeln
(drei Anläufe). Schritt 1 entfällt bei ihnen praktisch immer, weil schon
Markierungen vorhanden sind; Schritt 4 und 5 zeigen die bereits gewählten
Anbieter und Kinos angehakt an, sodass ein Klick auf „Weiter“ genügt.

---

## 5. Datenmodell

Zwei getrennte Ablagen — das ist der Kern der Datenschutz-Entscheidung.

### a) Personenbezogen, verschwindet mit dem Konto

```sql
CREATE TABLE IF NOT EXISTS user_onboarding (
  user_id         BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  schauverhalten  TEXT[] NOT NULL DEFAULT '{}',   -- Schritt 2
  genres          TEXT[] NOT NULL DEFAULT '{}',   -- Schritt 3
  schritt         SMALLINT NOT NULL DEFAULT 1,    -- zuletzt erreichter Schritt
  anlaeufe        SMALLINT NOT NULL DEFAULT 0,
  begonnen_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
  abgeschlossen_am TIMESTAMPTZ
);
```

Anbieter und Kinos stehen **nicht** hier — sie liegen weiter in
`users.watch_provider_ids` und `user_kinos`. Zwei Speicherorte für dieselbe
Angabe wären zwei Wahrheiten, die auseinanderlaufen, sobald jemand die
Einstellungen ändert.

Der Datenbestand bleibt, solange das Konto besteht (`ON DELETE CASCADE` räumt
ihn bei der Löschung mit ab — dasselbe Verhalten wie bei Watchlist und
Markierungen).

### b) Anonym, bleibt für immer

```sql
CREATE TABLE IF NOT EXISTS onboarding_aggregat (
  frage   TEXT NOT NULL,   -- 'schauverhalten' | 'genre' | 'anbieter' | 'kino_ort' | 'abschluss'
  antwort TEXT NOT NULL,   -- 'kino' | 'Thriller' | '8' | 'DE:Koblenz' | 'fertig'
  monat   DATE NOT NULL,   -- Monatserster
  region  TEXT NOT NULL,   -- ISO-Region, 'XX' wenn unbekannt
  anzahl  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (frage, antwort, monat, region)
);
```

Hochgezählt per `UPSERT`, wenn ein Schritt abgeschlossen wird — **nicht** bei
jedem Klick, sonst zählt eine Korrektur doppelt. Keine `user_id`, kein
Zeitstempel feiner als der Monat, keine Zeile, die eine Person beschreibt: nur
Summen je Antwortmöglichkeit. Solche Aggregate sind nach Erwägungsgrund 26
DSGVO keine personenbezogenen Daten mehr und dürfen deshalb eine Kontolöschung
überleben.

Zwei Vorsichtsmaßnahmen, die dazugehören:

1. **Kinos nur auf Ortsebene** (`kino_ort` = `DE:Koblenz`), nicht je Kino. Ein
   einzelnes Kino in einer kleinen Stadt ist praktisch eine Wohnadresse.
2. **Auswertung erst ab einer Mindestzahl.** Bei den heutigen Nutzerzahlen kann
   eine Zeile mit `anzahl = 1` in Verbindung mit anderen Zeilen desselben
   Monats theoretisch auf eine Person zurückführen. Die Auswertung (`npm run
   metrik`) blendet Werte unter der Schwelle aus — dieselbe Regel wie bei der
   Bewertungsstatistik.

### c) Trichter messen

`EVENT_NAMEN` in `backend/lib/track.js` bekommt `onboarding_step` dazu, mit
`props: { schritt, aktion: 'fertig'|'abgebrochen', anlauf }` — keine Inhalte,
nur Position. Geschrieben **serverseitig** beim Speichern eines Schritts, damit
`CLIENT_EVENT_NAMEN` unverändert bleibt und niemand die Zahlen von außen
aufblasen kann. Damit ist sichtbar, welcher Schritt Leute verliert.

---

## 6. Schnittstellen

| Route | Zweck |
|---|---|
| `GET /api/onboarding` | Stand (Schritt, Anläufe, bisherige Antworten) **plus** die Antwortmöglichkeiten und Grenzwerte |
| `PUT /api/onboarding/schritt` | Einen Schritt abschließen (`{schritt, daten}`), zählt das Aggregat hoch und schreibt das KPI-Ereignis |
| `POST /api/onboarding/abbruch` | Anläufe +1 beim Schließen per ✕ |
| `POST /api/onboarding/fertig` | Abschluss vermerken |

Der Stand kommt über die **eigene Route**, nicht über `publicUser()`:
`publicUser` wird an sieben Stellen aus unterschiedlichen SELECTs gebaut, die
alle um einen Join erweitert werden müssten. Die Abfrage läuft im Frontend
parallel zu den übrigen Anmeldeabfragen (`loadUserProgressAndRefresh`) und
kostet dort keine zusätzliche Wartezeit.

`GET /api/onboarding` liefert auch die Listen für Schauverhalten und Genres.
Sie stehen damit **nur** in `backend/lib/onboarding.js` — eine zweite Liste im
Browser wäre eine, die auseinanderläuft, und der Bruch fiele erst auf, wenn
eine gültige Antwort abgelehnt wird.

Schritt 4 und 5 benutzen die **bestehenden** Routen (Anbieter speichern,
`/api/kinos/*`) und melden nur ihren Abschluss an `/api/onboarding/schritt`.

---

## 7. Frontend

**Ein** Fenster (`#onboardModal`), das die Schritte intern wechselt — nicht
fünf einzelne Modale. Ein Kopf mit „Schritt 3 von 5“ und Zurück-Pfeil, ein
Rumpf, der neu gezeichnet wird. Weniger DOM, ein Fortschrittsbalken, eine
Tastatur- und Escape-Behandlung.

Die Anbieterliste und die Kinosuche werden **nicht kopiert**, sondern aus den
bestehenden Modalen herausgelöst und mit einem Ziel-Container als Parameter
aufgerufen. Sie greifen heute auf feste IDs zu (`#providersList`,
`#kinosList`); das wird parametrisiert. Doppelter Code hier wäre die Stelle,
an der in einem halben Jahr zwei Anbieterlisten unterschiedlich aussehen.

**Texte:** wie bei der Kennenlern-Strecke steht im HTML nur die Hülle, alle
Texte setzt das JS aus `TXT`. Damit entfällt die DOM-Übersetzungstabelle
komplett — es bleibt bei den `TXT`-Blöcken.

---

## 8. Übersetzungen

Sieben Sprachen: de, en, fr, es, it, nl, pt. Grob 80 neue Textbausteine —
das ist der größte einzelne Aufwandsposten des Vorhabens, größer als die Logik.
Alle sieben werden zusammen fertig; ein Prozess, der für sechs von sieben
Sprachen auf Deutsch steht, ist schlimmer als keiner.

Die Genre-Namen sind bereits vollständig gepflegt (`GENRE_EN` für Englisch,
`GENRE_NAMEN` für fr/es/it/nl/pt) — das Fenster übersetzt sie mit derselben
Funktion wie die Genre-Schildchen an den Titelzeilen. Nur die vier
Themen-Schlagwörter (True Crime usw.) brauchen eigene Übersetzungen.

---

## 9. Rechtstexte

Beides ist Pflicht, nicht optional:

- **`datenschutz.html` und `privacy.html`, Abschnitt 8/10:** die neuen Angaben
  benennen (Schauverhalten, Genres), Rechtsgrundlage (Art. 6 Abs. 1 lit. b/f),
  Speicherdauer „solange das Konto besteht“, und ausdrücklich die anonymen
  Aggregate, die die Kontolöschung überdauern — mit der Begründung aus
  Erwägungsgrund 26, so wie es Abschnitt 8 für die Bewertungsstatistik schon
  formuliert.
- **Abschnitt 11 („Was dann gelöscht wird“):** die neue Tabelle in die
  Aufzählung aufnehmen.

Ein eigener Einstellungen-Punkt zum Ändern von Schauverhalten und Genres ist
**nicht** nötig: Auskunft und Berichtigung laufen über die Kontaktadresse
(Abschnitt 11), Anbieter und Kinos bleiben ohnehin über die bestehenden
Einstellungen änderbar.

---

## 10. Reihenfolge der Umsetzung

1. **Schema + Routen** — `user_onboarding`, `onboarding_aggregat`,
   `/api/onboarding/*`, `publicUser` erweitern, `onboarding_step` in
   `EVENT_NAMEN`. Läuft über `npm run migrate` (idempotentes `schema.sql`,
   kein Migrationsframework).
2. **Fenster-Gerüst** — Schrittwechsel, Fortschritt, Zurück, Abbruch/Anläufe,
   Wiedervorlage beim Login. Zuerst mit Platzhalter-Inhalten.
3. **Schritte 2 und 3** — die beiden wirklich neuen.
4. **Schritte 1, 4, 5** — bestehende Bausteine einhängen (Kennenlern-Strecke,
   Anbieterliste, Kinosuche + Standortknopf).
5. **Abschluss-Schritt und Teilen-Fenster.**
6. **Übersetzungen** in allen sieben Sprachen, `GENRE_NAMEN` um pt ergänzen.
7. **Rechtstexte** in beiden Sprachfassungen.
8. **Prüfen:** Registrierung mit und ohne vorherige Kennenlern-Strecke,
   Abbruch und Wiedervorlage (drei Anläufe), Bestandskonto, Kontolöschung
   (personenbezogene Zeile weg, Aggregat unverändert), Ort ohne Kinos,
   abgelehnte Standortfreigabe, iPhone-Teilen.

Deployment wie immer: erst live, dann live geprüft.
