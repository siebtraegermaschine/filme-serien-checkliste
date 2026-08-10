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

## 2a. Nachtrag: Es reicht „läuft dort" statt genauer Spielzeiten

Nachgefragt und geprüft — **die Vereinfachung lohnt sich, in vier Punkten.**

**Sie ändert nicht, woher die Daten kommen.** Einen billigeren „läuft
gerade"-Feed gibt es nicht; diese Angabe *ist* zusammengefasste Spielzeit. Wer
sie hat, hat auch die Uhrzeiten. Aber sie ändert, **welchen Tarif** man braucht,
**wie viel** man abruft und **wie viel** zu bauen ist.

### Ein billigerer Tarif kommt in Frage

Der Basic-Tarif (149 €) enthält laut Preisseite **Kinolisten und „Published
Showtimes"**. Nicht enthalten sind: Websites & Geodaten, Genre/Cast/Laufzeit,
Poster/Trailer/Altersfreigabe, Sprache/Untertitel, Formate, Ticketing-Links.

Der Punkt ist: **Das meiste davon brauchen wir gar nicht.** Genre, Besetzung,
Laufzeit, Poster, Trailer und Altersfreigabe liefert TMDB längst — sie stehen
schon in `cinema_cache`. Buchungs-Links und Formate braucht man nur mit
Spielzeiten. Übrig bleibt als echte Lücke: **die Geodaten** — und die kommen aus
OpenStreetMap.

| | Business | Basic + OSM |
|---|---|---|
| je Monat | 299 € | **149 €** |
| je Jahr | 3.600 € | **1.800 €** |
| Kinos im Umkreis | vom Anbieter | aus OSM |
| „läuft in Kino X" | ✓ | ✓ |
| Uhrzeiten, Buchung, OV/3D | ✓ | — |

**Offen und im Trial zu klären:** Ob die Kinos im Basic-Tarif noch genug Adresse
tragen (Name, Ort), um sie mit den OSM-Einträgen zu verheiraten. Streicht
„Geo-locations" den ganzen `location`-Block samt Anschrift, wird das Zuordnen
mühsam. Der Filter `city_ids` deutet darauf hin, dass Orte weiter da sind.

### Deutlich weniger Abrufe

Statt Spielzeiten je Tag, Kino und Film genügt **ein Lauf am Tag**, der zu einem
Ja/Nein je Paar (Kino, Film) zusammengefasst wird. Bei MovieGlu, das nach
Abrufzahl staffelt, senkt das den Preis unmittelbar — und bei uns bleibt die
Tabelle klein.

### Deutlich weniger zu bauen

Weg: Tagesauswahl, Zeitplan je Titel, Zeitzonen, „Vorstellung schon vorbei",
Buchungs-Links. Phase 4 schrumpft von 3–4 Tagen auf **rund einen**.

### Robuster — und ehrlicher

Eine falsche Uhrzeit ist ein sichtbarer Fehler („18:30 gibt es gar nicht").
„Läuft derzeit im Apollo" verträgt Lücken und veraltet nicht innerhalb von
Stunden. Bei einem täglichen Abgleich stimmt die Aussage praktisch immer.

### Was dadurch neu ins Spiel kommt: Kinoheld

[Kinoheld](https://www.kinoheld.de) (Ticketing für viele deutsche Häuser, gehört
zu CTS Eventim) hat eine GraphQL-Schnittstelle, die laut
[Client-Bibliothek](https://github.com/janniksam/Kinoheld.Api.Client) genau das
kann, was hier gebraucht wird: Ort oder PLZ suchen, Kinos im Umkreis, und die
Filme, die **in einem bestimmten Kino laufen**. Nur Deutschland — also genau
unser Markt.

Geprüft: `graph.kinoheld.de` antwortet (HTTP 200), der Dienst besteht. Der
GraphQL-Pfad selbst ließ sich nicht auf Anhieb finden; er steht in der
Client-Bibliothek.

**Aber:** Das ist eine **undokumentierte interne Schnittstelle** ohne
veröffentlichte Nutzungsbedingungen für Dritte. Sie ohne Erlaubnis zur Grundlage
einer Funktion zu machen, wäre dasselbe Risiko wie das Auslesen der Kinoseiten —
nur bequemer. **Der richtige Weg ist eine Anfrage bei Kinoheld.** Kommt eine
Erlaubnis, ist es die naheliegendste Quelle für Deutschland; kommt keine, bleibt
es beim bezahlten Anbieter.

---

## 3. Drei Wege

### Weg A — nur Standorte, ohne Spielzeiten (kostenlos)

Einstellungen „Deine Kinos" mit Suche und Auswahl. Auf der Kino-Seite **kein
Filter**, sondern eine Zeile „Deine Kinos" mit Verweisen auf deren Spielpläne.

- **Kosten:** keine
- **Was es bringt:** Der Weg zum Spielplan wird kürzer. Die Auswahl liegt schon
  vor, wenn später Spielzeiten dazukommen.
- **Was es nicht bringt:** die eigentlich gewünschte Funktion

### Weg B — „läuft in deinen Kinos" (ab 149 €/Monat)

Der Knopf filtert wirklich: „Aktuell im Kino" zeigt nur noch Titel, die in einem
deiner Kinos laufen. **Ohne Uhrzeiten** (siehe 2a) — je Titel steht nur, in
welchen deiner Kinos er läuft, dazu der Verweis auf deren Spielplan.

- **Kosten:** ab 149 €/Monat (Basic + OSM), Angebote von MovieGlu und Kinoheld
  abwarten. Mit Uhrzeiten und Buchungs-Links wären es 299 €.
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

-- Nur bei Weg B. Bewusst KEINE Einzelvorstellungen, sondern das Ergebnis des
-- taeglichen Abgleichs: laeuft dieser Film derzeit in diesem Kino? Genau das
-- ist gefragt, und es haelt die Tabelle klein (siehe 2a). Uhrzeiten liessen
-- sich spaeter danebenlegen, ohne diese Tabelle zu aendern.
CREATE TABLE kino_laeuft (
  kino_id     BIGINT REFERENCES kinos(id) ON DELETE CASCADE,
  tmdb_id     INTEGER NOT NULL,
  zuletzt_am  DATE NOT NULL,           -- letzter Lauf, der ihn dort gesehen hat
  PRIMARY KEY (kino_id, tmdb_id)
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
| 4 | *(nur Weg B)* Täglicher Abgleich „läuft/läuft nicht", Filter, Kino-Namen am Titel | 1–2 Tage |
| 4b | *(optional, später)* Uhrzeiten und Buchungs-Links — braucht den 299-€-Tarif | 2–3 Tage |

---

## 7. Offen — vor der Umsetzung zu klären

1. **Weg A oder B?** Also: Sind ~1.800 €/Jahr vertretbar, solange acht Konten
   bestehen? Das ist die eine Frage, an der alles hängt.
2. **Drei Angebote einholen, nicht eines.** MovieGlu staffelt nach Abrufzahl —
   bei einem Abruf am Tag könnte das deutlich unter 149 € liegen. Und Kinoheld
   um Erlaubnis fragen (siehe 2a): Deutschland-only, aber die passendste Quelle.
   Kostet je eine E-Mail.
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
| Laufende Kosten ohne Nutzung | 1.800 €/Jahr für acht Konten | Free Trial zuerst, monatlich kündbar prüfen |
| Basic-Tarif trägt zu wenig Adresse | Kinos nicht mit OSM zu verheiraten | genau das im Trial zuerst prüfen (siehe 2a) |
| OSM lückenhaft | ein Kino fehlt in der Auswahl | „Kino fehlt?"-Hinweis mit Rückmeldeweg |
| Spielzeiten nicht für jedes Haus | kleine Kinos ohne Daten | vor dem Kauf im Trial genau dafür messen |
| Knopf ohne Wirkung (Weg A) | wirkt wie ein Fehler | dann kein Filter, sondern sichtbar Verweise |
| Zuordnung über `tmdb_id` scheitert | Titel ohne Spielzeiten | im Trial die Trefferquote gegen `cinema_cache` messen |
