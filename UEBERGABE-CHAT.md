# Übergabe: MovieMatch (movietaste.de)

Stand: 2026-08-03. Diese Datei ersetzt die vorherige Übergabe. Für Architektur
und Deployment siehe zusätzlich `DEPLOYMENT.md` und `konzept-relaunch.md`, für
den Weg zu nativen Apps `PLAN-NATIVE-APPS.md`.

**Die App heißt seit dieser Sitzung MovieMatch.** Die Domain bleibt
`movietaste.de` — überall sonst (Seitentitel, Manifest, Mail-Absender,
Vorschau-Angaben, Rechtstexte) steht der neue Name.

Zahlen zum Stand: 26.825 Titel, 22.357 Streaming-Einträge, 546 Kinostarts,
98 Titel mit Schlagwort „TrueCrime", 3 Konten.

---

## 1. Vor der Einreichung im App Store

**Erledigt:** „Konto löschen" ist eingebaut (Einstellungen → Konto löschen).
Apple verlangt das zwingend für jede App mit Registrierung (Richtlinie
5.1.1(v)) — ohne diese Funktion wird abgelehnt.

Der Ablauf im Einzelnen, weil daran mehrere Zusagen hängen:

- Die Löschung wird **beantragt**, nicht sofort ausgeführt. `users.
  deletion_requested_at` wird gesetzt, alle Sitzungen werden beendet, das Konto
  bleibt **14 Tage** unverändert bestehen.
- Meldet man sich in dieser Zeit wieder an, erscheint der Hinweis mit
  Fälligkeitsdatum und ein Widerruf per Klick (`POST /api/auth/account/restore`).
- Der Aufräumlauf liegt im Backend (`backend/lib/kontoAufraeumen.js`), läuft
  beim Start und danach einmal täglich. Bewusst **kein** eigener GitHub-Job:
  Das bräuchte ein weiteres Secret und eine öffentliche Route, während der
  Container ohnehin durchläuft. Ein verpasster Lauf holt sich beim nächsten
  Start nach — die Bedingung ist zeitbasiert, nicht ereignisgesteuert.
- **Zwei Dinge überleben die Löschung, ohne Personenbezug:** Suchbegriffe
  (nur die E-Mail-Adresse wird entfernt, der Begriff bleibt auswertbar) und die
  Sterne-Bewertungen, die je Titel in der neuen Tabelle `title_rating_stats`
  aufsummiert werden — nur Anzahl und Punktsumme, **keine Zeitstempel und keine
  Kennung**. Das ist Absicht: Mit einem gemeinsamen Löschzeitstempel ließen sich
  alle Zeilen einer Person wieder zusammenführen, der Bestand wäre dann nicht
  mehr anonym. Der Gesamtschnitt eines Titels ergibt sich aus dieser Tabelle
  **plus** den Bewertungen der bestehenden Konten in `user_progress`.
- Alles in einer Transaktion: Die Bewertungen sind erst gesichert, wenn der
  Nutzer wirklich weg ist.

Vollständig am Live-System durchgespielt (Antrag → Konto bleibt → Widerruf →
erneuter Antrag → Frist zurückdatiert → Aufräumlauf löscht → Suchbegriff ohne
E-Mail vorhanden, Bewertungen in der Summe angekommen, keine verwaisten Daten).

**Noch offen:**

- **Drei TODO-Platzhalter in `datenschutz.html`.** Der vierte (Selbstbedienungs-
  Löschung) ist mit der neuen Funktion entfallen.
- **`impressum.html` rechtlich prüfen.** Ebenso Abschnitt 9 der
  Datenschutzerklärung (kommerzielle Verwertung) — der ist ausdrücklich als
  Entwurf gekennzeichnet.
- **Anonyme Statistiken: Mindestzahl nicht durchgesetzt.** Die
  Datenschutzerklärung sagt zu, dass Titel erst ab einer Mindestzahl an
  Bewertungen in Auswertungen einfließen. Im Code gibt es das nicht. Das ist
  eine Zusage, die das Programm derzeit nicht einhält — vor dem ersten Export
  nachrüsten. Die neue Tabelle `title_rating_stats` liefert dafür schon die
  halbe Grundlage: Eine Auswertung müsste ihre `anzahl` plus die Bewertungen
  aus `user_progress` zusammenzählen und Titel unterhalb der Schwelle
  weglassen.
- **Datenschutz-Angaben („Privacy Nutrition Labels")** und **Altersfreigabe**
  im App-Store-Formular ausfüllen.
- **Konten:** Apple Developer 99 $/Jahr, Google Play 25 $ einmalig.

---

## 2. Gedanken zur nativen App

> **Dieser Abschnitt ist inzwischen ausgearbeitet:** `PLAN-NATIVE-APPS.md`
> enthält den vollständigen Umsetzungsplan in elf Phasen — mit getroffenen
> Entscheidungen (Capacitor, Vite, Apple-Konto auf digital-wings, iOS zuerst),
> Tabellenschemata, Aufwandsschätzung und Abhak-Liste. Drei kritische Punkte
> kamen dabei hinzu, die unten noch fehlen: das Sitzungs-Cookie funktioniert in
> der nativen Hülle nicht (`sameSite: 'lax'`, cross-site), die Kontolöschung
> muss zusätzlich Anmelde-Token und Push-Kennungen entfernen, und der ~27 MB
> große Katalog gehört auf einem schwachen Gerät gemessen, bevor Arbeit in
> Feinschliff fließt. Das Folgende bleibt als Begründung der Richtung stehen.

### Empfehlung: einpacken, nicht neu bauen

Die Sorge „jede Änderung dreifach pflegen" trifft genau dann zu, wenn die
Oberfläche in SwiftUI und Kotlin nachgebaut wird. **Das sollte nicht passieren.**
Der Weg heißt **Capacitor**: Die bestehende `index.html` läuft unverändert in
einer nativen Hülle, es bleibt **eine** Codebasis. Dass die Web-App erst bei
etwa 85 % steht, ist dabei kein Hindernis — es gibt keinen zweiten Code, der
parallel altert.

### Warum die native App mehr ist als Kosmetik

Apple lehnt reine Webseiten-Verpackungen ab (Richtlinie 4.2, „Minimum
Functionality"). Die App braucht echte native Fähigkeiten — und ausgerechnet
die lösen zwei Defekte, die in dieser Sitzung nicht lösbar waren:

| Problem in der Web-App | Löst die native App |
|---|---|
| Ein geteilter Link öffnet auf dem iPhone **Safari**, nicht die installierte App. Dort ist man womöglich abgemeldet, weil die Home-Bildschirm-App eine eigene Anmeldung hat. | **Universal Links** öffnen direkt die App, angemeldet. |
| Das Teilen-Blatt zeigt eine leere Kachel statt eines Vorschaubilds (iOS erzeugt für Web-Dateien keine Miniatur). | Natives Teilen mit echtem Vorschaubild. |
| Niemand merkt, wenn eine verknüpfte Person etwas auf die Liste setzt. | **Push-Nachrichten.** |

### Zwei Wege bei der Aktualisierung

- **Oberfläche mitliefern** (empfohlen): robust, offlinefähig — dafür braucht
  jede Änderung an der Oberfläche ein Store-Update. Mit Capacitor Live Updates
  gehen kleine Text- und Stiländerungen ohne Store-Freigabe durch.
- **Oberfläche von movietaste.de laden**: jede Web-Änderung sofort in der App,
  aber höheres Ablehnungsrisiko (näher an „nur eine Webseite") und nichts
  offline.

### Reihenfolge

1. Apple-Entwicklerkonto anlegen (Freischaltung dauert)
2. Capacitor-Hülle um die bestehende App
3. Universal Links (`/t/...` muss die App öffnen) — löst den größten Bruch
4. Push-Nachrichten
5. Erst danach Store-Einreichung mit den Punkten aus Abschnitt 1

---

## 3. Funktionsideen, nach Wirkung sortiert

1. **Push-Nachrichten bei gemeinsamen Titeln.** Macht „Gemeinsam schauen" erst
   lebendig; heute merkt niemand, wenn der andere etwas hinzufügt.
2. **TMDB-Livesuche**, wenn im eigenen Bestand nichts gefunden wird. Stand
   schon in der vorherigen Übergabe als wirksamster Hebel gegen abweichende
   Anbieter-Titel.
3. **In Discovery markieren, was bei einer verknüpften Person auf der Liste
   steht** („Jenny will das auch sehen"). Taucht heute nirgends auf.
4. **Eigener Bewertungsdurchschnitt** neben der TMDB-Bewertung, ab etwa fünf
   Bewertungen pro Titel.
5. **Weitere Streaminganbieter** in `stream-fetch.mjs`. Die Ladegröße ist kein
   Gegenargument mehr, die Laufzeit des Jobs (~60–90 Min.) bleibt begrenzend.

---

## 4. Bewusst offen gelassen

- **Wiederaufführungen im Kino** werden nicht gekennzeichnet. Die Daten sind
  vollständig da (`cinema_cache.original_release_date`, 38 von 546 Einträgen);
  geprüft: kein Titel rutscht unerkannt durch. Einzige Lücke:
  Wiederaufführungen **innerhalb desselben Jahres** werden nicht markiert, weil
  der Job das Erstdatum verwirft, wenn das Jahr gleich ist. Mögliche Varianten:
  Schildchen in der Zeile, Filter „Wiederaufführungen ausblenden", eigener
  vierter Bereich.
- **Zahlenwiderspruch:** Der Text der leeren Watchlist empfiehlt „mind. 20
  Titel", die automatische Umstellung auf Taste-Score-Sortierung greift laut
  Code und Erklärung aber ab **10**. Kein Fehler, aber vielleicht angleichen.
- **Bild-Teilen:** Der Link steht in der Bildunterschrift statt in einem
  eigenen Link-Feld (Variante C). Grund: Sobald ein Link-Feld dabei ist, stellt
  iOS die Kachel als Weblink dar statt als Datei. WhatsApp macht aus der
  Adresse in der Bildunterschrift trotzdem einen anklickbaren Link.
- **`UEBERGABE.md`** (die ältere Datei) ist nicht aktualisiert.

---

## 5. Fallstricke, die in dieser Sitzung Zeit gekostet haben

**`bigint` kommt als String an — zweimal zugeschlagen.** `users.id` und
`titles.id` sind `bigint`; der Postgres-Treiber liefert sie als **String**.
`POOL.realId` und die Schlüssel von `PROGRESS` sind deshalb Strings.
- Erster Fall: `/api/links` schickte `id: "9"`, während `MATCH_WITH` Zahlen
  enthielt. Folge: kein Haken im Popup, „Gemeinsame Titel mit **Unbekannt**",
  gelöste Verknüpfungen blieben in der Liste stehen.
- Zweiter Fall: Die Teilen-Schnittstelle gab `id` als Zahl zurück. Ein über
  einen geteilten Link gespeicherter Titel wäre erst nach einem Neuladen in der
  Liste aufgetaucht.

**Bei jedem neuen Endpunkt prüfen, in welchem Typ IDs herausgehen.**

**CSS-Spezifität — ebenfalls zweimal.** `header .sub` (Element + Klasse) schlägt
`.sub-zweit` (nur Klasse); die gesetzte Regel wirkte nicht. Ebenso griff
`.modal-actions button` nicht, weil das Teilen-Fenster eine eigene
Container-Klasse benutzte — die Knöpfe hatten dadurch die Browser-Grundform.
**Jede Stiländerung mit `getComputedStyle` nachmessen, nicht nur im Stylesheet
nachsehen.**

**`<base href="/">` muss vor allen Elementen mit relativen URLs stehen.** Es
stand hinter den Icon-Angaben; auf einer geteilten Seite löste
`apple-touch-icon.png` dadurch zu `/t/movie/apple-touch-icon.png` auf und lief
in einen 404 — iOS zeigte nur seinen grauen Platzhalter.

**Die lokale Vorschau über `file://` ist seit dem `<base href="/">` wertlos.**
Dort zeigt „/" auf die Festplattenwurzel, alle Bilder brechen. Zum Ansehen
einen kleinen Webserver nehmen: `python3 -m http.server 8777` im Projektordner.

**TMDB erlaubt Canvas-Export.** Die Bilder kommen mit
`Access-Control-Allow-Origin: *`; mit `crossOrigin = 'anonymous'` lässt sich
daraus ein PNG/JPEG erzeugen, ohne dass die Canvas „vergiftet" wird. Darauf
beruht das Story-Bild.

**Vorschau-Roboter führen kein JavaScript aus.** Nachträglich gesetzte
Open-Graph-Angaben bleiben wirkungslos — deshalb rendert der Server unter
`/t/...` eigene Angaben ins HTML.

**iOS und WhatsApp merken sich Linkvorschauen lange.** Nach Änderungen an den
Vorschau-Angaben mit einem Titel testen, der noch nie geteilt wurde.

**Deploy-Warteschleife:** Direkt nach dem Push existiert der neue Workflow-Lauf
noch nicht. Besser gegen einen konkreten Inhalt prüfen (`curl … | grep …`) oder
`ssh … 'cd /opt/movietaste && git log -1'`.

---

## 6. Was in dieser Sitzung entstanden ist (37 Commits)

**Titel teilen.** Rechtswisch auf jeder Zeile öffnet ein Fenster mit zwei Wegen:
als Nachricht (Text + Link) oder als Bild (1080×1920, im Browser auf einer
Canvas gebaut: Breitbild-Hintergrund, Poster, Titel, QR-Code). Geteilt wird auf
`/t/id/<titles.id>` bzw. `/t/movie|series/<tmdb_id>` — beide Formen sind nötig,
weil Katalog-Titel keine `tmdb_id` und Kinostarts keine `titles.id` haben. Der
Server liefert dort titelspezifische Vorschau-Angaben aus; das Breitbild
(`backdrop_path`, neue Spalte) wird beim ersten Teilen von TMDB nachgeladen.
Empfänger bekommen eine Karte mit Watchlist/Gesehen — kein automatisches
Speichern, „Gesehen" fragt die Sterne ab, beide schließen sich gegenseitig aus.

**Kino:** eigener Tab neben Filme/Serien statt Menüpunkt, Sortierung „Neu im
Kino" (Kinostart) getrennt von „Veröffentlichungsdatum" (echtes Erstdatum),
Vorschau 3 statt 6 Titel, Metazeile mit Kinostart statt Erscheinungsjahr.
Dabei behoben: `/api/cinema` lieferte Stimmenzahl und Freigabe gar nicht aus —
dadurch war die Sortierung nach TMDB-Bewertung dort wirkungslos und ein aktiver
FSK-Filter leerte die Seite vollständig.

**Kopfbereich neu geordnet:** Tabs, Linie, „Alle Filme & Serien entdecken",
Suche, Linie. Alle drei Zeilen exakt 44 px hoch. Zweite Kopfzeile „Matche deine
Watchlist mit anderen!".

**True Crime** als Schlagwort nachgetragen (98 Titel), über TMDBs eigenes
Schlagwort 33722 statt über eine Genre-Heuristik. Schlagwörter sind jetzt
durchsuchbar, auch getrennt geschrieben („zweiter weltkrieg" findet
`ZweiterWeltkrieg`).

**Sonstiges:** „Nach oben"-Knopf, einmalige Rückfrage beim ersten Linkswisch je
Bereich (vier getrennte Merker), „X" statt „0" bei fehlender Bewertung,
Kontolöschung mit 14 Tagen Widerrufsfrist, Auffrischen beim Zurückkehren aus dem
Hintergrund, neues Logo. Die Filterauswahl (Watchlist/Gesehen/Gratis im Abo)
bleibt beim Wechsel zwischen Filme und Serien jetzt stehen, statt auf „nur
Watchlist" zurückzufallen — die Sortierung bleibt bewusst getrennt je Bereich.

---

## 7. Hinweis zu den Testdateien

Für die größeren Änderungen entstanden fünf Testdateien, die den Code **wörtlich
aus `index.html` ziehen** (Personen-IDs, Auffrischen aus dem Hintergrund, True
Crime, Kino-Sortierung, Teilen). Sie lagen im Sitzungs-Zwischenspeicher und sind
mit dieser Sitzung verloren. Falls so etwas dauerhaft nützlich erscheint, wäre
ein Ordner `tests/` im Projekt der richtige Ort — bewusst nicht ungefragt
angelegt.
