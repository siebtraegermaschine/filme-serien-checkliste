# Offene Punkte — Stand 2026-08-07

Ergänzt `UEBERGABE-CHAT.md` (Stand 2026-08-03) und ersetzt die Fassung vom
5. August. Für Architektur und Auslieferung siehe `DEPLOYMENT.md`, für den Weg
zu nativen Apps `PLAN-NATIVE-APPS.md`.

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

## 1. Was am 6./7. August entstanden ist (14 Commits)

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
Abschnitt 1.3).

### 1.1 Die drei Fehler, die Nutzer gemeldet hatten

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

### 1.2 Dubletten — der größte Eingriff

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

### 1.3 Vier falsche Zuordnungen gefunden und korrigiert (Datenänderung)

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

## 2. Offen: Uneinheitliches in der Bedienung

Diese Liste entstand aus einer Durchsicht aller drei Nutzungsarten (allein,
fremde Liste, Abgleich) und ist **im laufenden Build nachgemessen**, nicht aus
dem Code geschlossen. Punkt 2.1 war zur Umsetzung vorgesehen, wurde aber
zurückgestellt („kläre ich später mit den anderen").

### 2.1 Die Statusauswahl springt beim Wechsel ins Kino — größter Punkt

Filme/Serien und Kino führen **zwei getrennte Auswahlen**
(`watchlistFilterOn`/`seenFilterOn`/`discoverFilterOn` gegen `kinoStatus`).
Gemessen:

| | Filme | nach Klick auf Kino |
|---|---|---|
| allein | `Watchliste` | `Watchliste + Gesehen + Neue entdecken` |
| mit Abgleich | `Watchliste` | `Watchliste + Gesehen + Neue entdecken` |

`W+G+E` ist seit dem 5. August eine Kombination, die es unter Filme/Serien gar
nicht mehr geben kann. Der erste Tipp im Kino wirkt dadurch falsch:

```
Kino-Start:  W G E
1x Gesehen:  W - E     ← "Gesehen" aus, Entdecken bleibt
2x Gesehen:  W G -     ← erst jetzt ein Zustand wie unter Filme
```

Das ist derselbe Fehlertyp, der als „reagiert erst beim dritten Klick" gemeldet
wurde — nur im Kino noch drin. **Empfehlung: Kino soll dieselbe Auswahl
benutzen, ein Zustand statt zwei.** `enforceDiscoverLock()` fasst `kinoStatus`
ebenfalls nicht an.

### 2.2 Match filtert im Kino nicht — bewusst so entschieden

| | Watchliste/Gesehen | Neue entdecken |
|---|---|---|
| Filme/Serien | Schnittmenge mit allen Ausgewählten | ungefiltert, gemeinsame Sortierung |
| Kino | **eigene** Markierungen, kein Filter | ungefiltert, gemeinsame Sortierung |

Am 7. August ausdrücklich bestätigt („ok so lassen"). Einziger Hinweis darauf
ist der Leistentext: „Kino-Vorschläge für dich und X" statt „Gemeinsame Titel
mit X". Nicht ändern, ohne das erneut zu besprechen.

### 2.3 Der Taste-Score bedeutet drei Dinge, ohne dass es dransteht

Derselbe Titel, gemessen: **allein 37 · Match + Entdecken 44 · in einer fremden
Liste 37.** Die 44 ist der gemeinsame Geschmack. Nichts an der Zahl sagt, welche
man gerade sieht. Vorschlag: bei gemeinsamer Rechnung an der Erklärung ergänzen
(„für dich und Pete"), die Zahl selbst muss nicht anders aussehen.

### 2.4 Ein Leerzustand behauptet etwas Falsches

Gemessen: fremde Liste + eigener Streaming-Filter, kein Treffer → **„Pete hat
hier nichts markiert."** Falsch — Pete hat fünf Titel, der Anbieterfilter hat sie
weggenommen. Wenn Streaming- oder Altersfilter die Liste geleert haben, sollte
das dort stehen, statt es der Person zuzuschreiben. Kleiner Aufwand.

### 2.5 Wischen in einer fremden Kino-Liste blendet den Titel für einen selbst aus

`darfAusblenden` in `poolItemLi` prüft `discoverFilterOn || cinemaMode`. In einer
fremden Liste ist Entdecken aus — im Kino greift aber `cinemaMode`. Man sieht
Petes Liste, wischt, und der Titel verschwindet aus der **eigenen**
Entdecken-Liste. Unter Filme/Serien ist das dort schon gesperrt.

### 2.6 Kleineres

- **Suche + Abgleich:** Filme/Serien schalten „Neue entdecken" aus, Kino lässt es
  an (`sucheZustandAnwenden` setzt `kinoStatus` auf alle drei,
  `enforceDiscoverLock` fasst es nicht an).
- **Sortierung:** Kino hat eine eigene (`cinemaSortKey`), getrennt von
  `sortManual`. Nach einem Wechsel steht dort wieder die Standardsortierung.
- **Zwei Zahlen für dasselbe:** Die leere Watchliste sagt „mind. **20** Titel",
  der Einstieg sagt „ab **10** gespeicherten Titeln", `effectiveSort` schaltet
  bei **10** um. Drei Stellen, zwei Zahlen.
- **„Neue entdecken" ist in fremden Listen ausgegraut** — richtig so, aber es
  steht nirgends warum.

---

## 3. Offen aus früheren Sitzungen

### Rechtliches, vor Go-Live bzw. App Store

- **Drei TODO-Platzhalter in `datenschutz.html`** (Zeilen 21, 64, 72:
  Vorlagenhinweis, Serverstandort, Mailanbieter).
- **`impressum.html` rechtlich prüfen**, ebenso Abschnitt 9 der
  Datenschutzerklärung (kommerzielle Verwertung, als Entwurf gekennzeichnet).
- **Mindestzahl bei anonymen Statistiken nicht durchgesetzt.** Die
  Datenschutzerklärung sagt zu, dass Titel erst ab einer Mindestzahl an
  Bewertungen in Auswertungen einfließen. Im Code gibt es das nicht. **Das ist
  eine Zusage, die das Programm nicht einhält** — vor dem ersten Export
  nachrüsten. `title_rating_stats` liefert die halbe Grundlage.
- Privacy Nutrition Labels und Altersfreigabe im Store-Formular; Konten
  (Apple 99 $/Jahr, Google 25 $ einmalig).

### Technisch

- **4,2 MB Base64-Poster gehen weiterhin über die Leitung.** Die 591 verdeckten
  Zeilen werden unverändert ausgeliefert, ausgeblendet wird erst im Browser. In
  der Anzeige stecken nur noch 5 statt 600 eingebettete Bilder — die
  Übertragungsgröße sinkt dadurch **nicht**. Nächster Schritt wäre, die
  verdeckten Zeilen serverseitig wegzulassen; dann braucht das Frontend die
  Umleitungstabelle vom Server statt aus eigener Rechnung.
- **Feedback wird nicht gespeichert**, nur per Mail verschickt. Schlägt Resend
  fehl, ist die Nachricht weg.
- **Tour-Screenshots in `tour/`** sind statisch und veralten bei
  Oberflächenänderungen. Neu erzeugen: `bash scripts/tour/aufnehmen.sh` (braucht
  Chrome und Netz). Nach den Änderungen vom 6./7. August sind sie nicht mehr
  aktuell — die Statusreihe und die Listenlänge sehen inzwischen anders aus.
- **Einladungen lassen sich nicht zurückziehen**, und Links gelten für beliebig
  viele Personen. Eine Liste der offenen Einladungen mit Schließen-Knopf wäre der
  nächste Schritt.
- **`users.invited_by_user_id`** wird gefüllt, aber nirgends angezeigt.
- **Community-Bewertung fließt gar nicht in den Taste-Score** ein. Offen, ob sie
  in anderer Form zurück soll (Idee: Dämpfung nur am unteren Ende).
- **Aktionszeile bei 320px** bricht auf vier Zeilen um; nur über eine kürzere
  Beschriftung als „Ähnliche Titel" lösbar.

### Bewusst nicht gemacht

Filme und Serien gemeinsam anzeigen (der Typ ist die Tab-Achse) · Rückseiten von
DVD/Blu-ray (TMDB kennt sie nicht) · Wiederaufführungen im Kino kennzeichnen ·
Match filtert im Kino nicht (siehe 2.2).

---

## 4. Fallstricke, die in dieser Sitzung Zeit gekostet haben

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

## 5. Bekannte Einschränkungen

- **Favoriten in der Personenliste** liegen nur im Browser, gelten also je Gerät.
- **Match im Kino** filtert nicht, sondern sortiert um (siehe 2.2).
- **Manuelle Sortierung verfällt nach 24 Stunden** (`SORT_MANUAL_MAX_AGE_MS`) und
  wird bei Login/Logout sowie beim Logo-Klick zurückgesetzt.
- **Alte Einladungslinks sind einlösbar**, auch mehrfach benutzte.
