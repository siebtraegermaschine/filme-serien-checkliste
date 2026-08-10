# Plan: „Deine Kinos" — Kinos in der Nähe wählen und danach filtern

> **Noch nicht umgesetzt.** Dieses Dokument beantwortet zuerst die beiden
> Datenfragen, weil an ihnen hängt, ob die Funktion überhaupt so gebaut werden
> kann. Stand: 10. August 2026.

## Ziel

Auf der Kino-Seite ein Knopf **„Deine Kinos"** mit demselben Trichter-Zeichen wie
„Deine Streaming-Anbieter" unter Filme/Serien. Unter Einstellungen ein Punkt
**„Deine Kinos"**: Suchfeld für PLZ **oder** Stadtname mit Vervollständigung,
darunter die Kinos im Umkreis zum Anhaken.

---

## 1. Die beiden Fragen — beantwortet

### 1.1 Gibt es eine Kino-Datenbank für Standorte? — Ja, sogar kostenlos

**OpenStreetMap** führt Kinos als `amenity=cinema` mit Koordinaten, meist mit
Namen, Adresse und Website. Nachgemessen über die Overpass-API, Umkreis 30 km um
Koblenz: **9 Kinos**, davon 6 mit Postleitzahl, 4 mit Website.

```
Apollo Kinocenter      56068 Koblenz     odeon-apollo-kino.de
Odeon Kinocenter       56068 Koblenz     odeon-apollo-kino.de
Metropol               56564 Neuwied     kinoneuwied.de
Corso                  56727 Mayen       corso-mayen.de
cinema Boppard         56154 Boppard
Kino-Center Nastätten  56355 Nastätten
Capitol Montabaur      —                 kino-montabaur.de
Schauburg              —
Sommerkino             —
```

**Bewertung:** Für „welche Kinos gibt es in meiner Nähe" reicht das. Die
Koordinate ist immer da — daran hängt die Umkreissuche, nicht an der PLZ. Die
Adressfelder sind lückenhaft (3 von 9 ohne PLZ), was aber nur die Anzeige
betrifft. Lizenz ODbL, Namensnennung nötig.

**Grenze, offen benannt:** OSM ist von Freiwilligen gepflegt. Ein frisch
eröffnetes oder geschlossenes Kino kann fehlen bzw. noch dastehen. Für eine
Auswahlliste ist das verkraftbar, für eine Abrechnung wäre es das nicht.

**PLZ und Stadt zum Suchen:** Zwei freie Quellen, beide geprüft.

| Quelle | Was sie liefert | Geprüft |
|---|---|---|
| [OpenPLZ API](https://openplzapi.org) | PLZ- und Ortssuche, auch nach Präfix („Kobl" → Koblenz) | 148 ms, ohne Schlüssel |
| [GeoNames DE.zip](https://download.geonames.org/export/zip/) | alle deutschen PLZ **mit Koordinate**, 384 kB, CC-BY 4.0 | HTTP 200 |

Empfehlung: GeoNames einmal in die eigene Datenbank importieren. Dann braucht
die Vervollständigung im Betrieb **keinen fremden Dienst** — sie ist eine
Abfrage auf eine eigene Tabelle, und die Umkreissuche hat die Koordinate sofort.

### 1.2 Gibt es eine Datenbank, die Titel den Kinos zuordnet? — Ja, aber nicht umsonst

Das ist der teure Teil. Geprüft wurde
[International Showtimes / CINEPASS](https://api.cinepass.de/documentation/v4/)
(deutscher Anbieter, Cinepass UG):

- `GET /cinemas/?location=50.36,7.59&distance=30` — Kinos im Umkreis, mit
  `location.lat/lon` und vollständiger Adresse
- `GET /showtimes?cinema_id=…&movie_id=…&time_from=…&time_to=…` — Spielzeiten,
  filterbar nach Kino **und** nach Film
- Filme tragen **`tmdb_id`** — genau der Schlüssel, den `cinema_cache` schon
  benutzt. Die Zuordnung zu unserem Bestand wäre damit ein Feldvergleich, kein
  Titel-Raten.
- Dazu Buchungs-Links und Formate (IMAX, OV, OmU, 3D)

**Das löst beide Fragen auf einen Schlag** — Standorte *und* Zuordnung aus einer
Hand, ohne OSM und ohne GeoNames.

**Der Preis, [laut Preisseite](https://www.internationalshowtimes.com/pricing):**

| Stufe | Preis je Monat und Markt | Haken |
|---|---|---|
| Free Trial | 0 € | **7 Tage**, alle Funktionen |
| Basic | ab **149 €** | **ohne Geodaten** — für „Kinos in der Nähe" damit unbrauchbar |
| Business | ab **299 €** | mit Geodaten, Sprache/Untertitel, Export |
| Enterprise | auf Anfrage | dazu Formate, Support |

Für uns heißt das **Business, also ab 299 € im Monat ≈ 3.600 € im Jahr** — die
Geodaten stecken erst dort drin. Bei derzeit acht Konten ist das die eigentliche
Entscheidung, nicht die Technik.

**Zweites Angebot einholen:** [MovieGlu](https://movieglu.com/pricing/) deckt
125 Länder ab und nennt keine öffentlichen Preise, wirbt aber ausdrücklich mit
niedrigen Einstiegspreisen und Staffelung nach Abrufzahl. Ein Angebot kostet
nichts und ist vor einer Entscheidung Pflicht.

**Nicht empfohlen: selbst von den Kinoseiten holen.** Technisch machbar für die
großen Ketten (CineStar, UCI, Cinemaxx, Kinopolis), aber je Kette ein eigener
Zerleger, der bei jeder Umgestaltung bricht — und rechtlich grau. Der Aufwand
läge nach kurzer Zeit über den 3.600 €, ohne die kleinen Häuser abzudecken,
also gerade die, für die man „Deine Kinos" überhaupt einstellt.

---

## 2. Der Knackpunkt: Ohne Spielzeiten filtert der Knopf nichts

Das ist die wichtigste Erkenntnis dieses Plans, und sie ist unangenehm.

„Deine Streaming-Anbieter" funktioniert, weil an jedem Titel steht, **wo** er
läuft (`providers` aus `streaming_cache`). Für Kino fehlt genau diese Angabe:
`cinema_cache` enthält **Kinostart-Daten von TMDB**, nicht Spielpläne. Die App
weiß heute, dass ein Film am 7. August in Deutschland angelaufen ist — sie weiß
nicht, ob er heute Abend im Apollo Koblenz läuft.

**Ein Knopf „Deine Kinos" hätte damit nichts zum Filtern.** Er wäre eine
Beschriftung ohne Wirkung.

Zweiter Punkt, unabhängig vom Geld: Der Filter ergibt nur für den Bereich
**„Aktuell im Kino"** Sinn. „In Kürze" und „Bald im Kino" laufen naturgemäß in
keinem Kino — dort müsste der Knopf ausgegraut sein oder der Bereich
ausgeblendet werden.

---

## 3. Drei Wege

### Weg A — nur Standorte, ohne Spielzeiten (kostenlos)

Einstellungen „Deine Kinos" mit Suche und Auswahl. Auf der Kino-Seite **kein
Filter**, sondern eine Zeile „Deine Kinos" mit Verweisen auf deren Spielpläne.

- **Kosten:** keine
- **Was es bringt:** Der Weg zum Spielplan wird kürzer. Die Auswahl liegt schon
  vor, wenn später Spielzeiten dazukommen.
- **Was es nicht bringt:** die eigentlich gewünschte Funktion

### Weg B — mit Spielzeiten (299 €/Monat)

Der Knopf filtert wirklich: „Aktuell im Kino" zeigt nur noch Titel, die in einem
deiner Kinos laufen; je Titel die nächsten Vorstellungen und ein Buchungs-Link.

- **Kosten:** ab 299 €/Monat, plus Angebot von MovieGlu abwarten
- **Nebenwirkung, positiv:** Der Bereich „Aktuell im Kino" wäre danach
  **inhaltlich richtiger als heute**. Er zeigt derzeit alles, was in den letzten
  60 Tagen angelaufen ist — auch Filme, die längst aus den Sälen sind.

### Weg C — erst A, später B

A bauen, dabei die Datenstruktur so schneiden, dass Spielzeiten später nur
danebengelegt werden. Die sieben Tage Free Trial vorher nutzen, um an echten
Daten zu messen, wie viele Titel und Kinos zusammenkommen — **bevor** Geld
fließt.

---

## 4. Datenmodell (für alle Wege gleich)

```sql
-- Kinos, einmal importiert und danach nachgeführt
CREATE TABLE kinos (
  id           BIGSERIAL PRIMARY KEY,
  quelle       TEXT NOT NULL,          -- 'osm' | 'cinepass'
  quelle_id    TEXT NOT NULL,          -- OSM-Knoten bzw. Anbieter-Kennung
  name         TEXT NOT NULL,
  strasse      TEXT, plz TEXT, ort TEXT,
  lat          DOUBLE PRECISION NOT NULL,
  lon          DOUBLE PRECISION NOT NULL,
  website      TEXT,
  UNIQUE (quelle, quelle_id)
);
CREATE INDEX ON kinos (lat, lon);

-- Die Auswahl einer Person. Gehoert zum Konto, nicht ins Geraet --
-- sonst waere sie je Telefon eine andere (vgl. Favoriten in der Personenliste).
CREATE TABLE user_kinos (
  user_id  BIGINT REFERENCES users(id) ON DELETE CASCADE,
  kino_id  BIGINT REFERENCES kinos(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, kino_id)
);

-- Postleitzahlen mit Koordinate (GeoNames, einmalig)
CREATE TABLE plz (
  plz   TEXT NOT NULL,
  ort   TEXT NOT NULL,
  land  TEXT,
  lat   DOUBLE PRECISION NOT NULL,
  lon   DOUBLE PRECISION NOT NULL
);

-- Nur bei Weg B
CREATE TABLE spielzeiten (
  kino_id     BIGINT REFERENCES kinos(id) ON DELETE CASCADE,
  tmdb_id     INTEGER NOT NULL,
  beginn      TIMESTAMPTZ NOT NULL,
  format      TEXT,                    -- OV, OmU, 3D, IMAX
  buchung_url TEXT,
  PRIMARY KEY (kino_id, tmdb_id, beginn)
);
```

Der Umkreis wird über ein Rechteck vorgefiltert (Index) und danach exakt
gerechnet. Für Entfernungen bis 100 km reicht das ohne PostGIS.

## 5. Frontend

- Knopf neben „Sortieren" auf der Kino-Seite, Trichter-Zeichen aus
  `#fInStream` übernommen, Zustand `kinoFilterOn` analog `inStreamFilterOn`.
- Einstellungen: neuer Eintrag zwischen „Streaminganbieter" und „Gelöschte
  Titel" (`settingsModal`, [index.html:1403](index.html:1403)).
- Suchfeld mit Vervollständigung gegen die eigene `plz`-Tabelle — dieselbe
  Mechanik wie die Titel-Vorschläge, inklusive der 120 ms Tippruhe aus
  `SUCHE_RENDER_VERZOEGERUNG`.
- Umkreis wählbar: 10 / 25 / 50 km, Vorgabe 25.

## 6. Phasen

| | Inhalt | Aufwand |
|---|---|---|
| 0 | Angebot MovieGlu einholen, Free Trial bei Cinepass, an echten Daten messen | 1 Tag + Wartezeit |
| 1 | Tabellen, GeoNames-Import, OSM-Import als Skript | 1–2 Tage |
| 2 | Einstellungen „Deine Kinos" mit Suche und Umkreis | 2 Tage |
| 3 | Knopf auf der Kino-Seite (bei Weg A: Verweise statt Filter) | 1 Tag |
| 4 | *(nur Weg B)* Spielzeiten holen, Filter, Vorstellungen je Titel | 3–4 Tage |

---

## 7. Offen — vor der Umsetzung zu klären

1. **Weg A oder B?** Also: Sind ~3.600 €/Jahr für Spielzeiten vertretbar,
   solange acht Konten bestehen? Das ist die eine Frage, an der alles hängt.
2. **Zweites Angebot abwarten?** MovieGlu nennt keine Preise, wirbt aber mit
   Staffelung nach Abrufzahl. Bei unserer Größe könnte das deutlich unter 299 €
   liegen. Kostet nur eine E-Mail.
3. **Was tut der Knopf bei „In Kürze" und „Bald im Kino"?** Vorschlag: ausgrauen
   mit demselben Muster wie „Neue entdecken" in fremden Listen — und diesmal mit
   einem Grund daneben, denn dass dort nichts läuft, ist nicht selbsterklärend.
4. **Soll „Aktuell im Kino" auf Spielzeiten umgestellt werden?** Bei Weg B wäre
   das die ehrlichere Liste, ändert aber das Verhalten für alle — auch für
   Personen ohne gewählte Kinos.
5. **Datenschutz.** Gewählte Kinos sind ein Hinweis auf den Wohnort, also
   personenbezogen. `datenschutz.html` braucht dafür eine Zeile in den
   Abschnitten 2 und 3 — am besten zusammen mit dem ohnehin offenen Abschnitt 6
   (siehe `ENTWURF-DATENSCHUTZ-MAIL.md`) in **einen** Anwaltsdurchgang.
6. **Standort statt Eingabe?** Eine Ortungsabfrage im Browser wäre bequemer, ist
   aber eine Berechtigung mehr und wieder ein Datenschutzthema. Vorschlag: erst
   nur Eingabe, später optional.
7. **Nur Deutschland?** Der Bestand ist auf `region=DE` ausgelegt. Österreich
   und die Schweiz wären je ein weiterer „Markt" — bei Cinepass je 299 €.

## 8. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Laufende Kosten ohne Nutzung | 3.600 €/Jahr für acht Konten | Free Trial zuerst, monatlich kündbar prüfen |
| OSM lückenhaft | ein Kino fehlt in der Auswahl | „Kino fehlt?"-Hinweis mit Rückmeldeweg |
| Spielzeiten nicht für jedes Haus | kleine Kinos ohne Daten | vor dem Kauf im Trial genau dafür messen |
| Knopf ohne Wirkung (Weg A) | wirkt wie ein Fehler | dann kein Filter, sondern sichtbar Verweise |
| Zuordnung über `tmdb_id` scheitert | Titel ohne Spielzeiten | im Trial die Trefferquote gegen `cinema_cache` messen |
