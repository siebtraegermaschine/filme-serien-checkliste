# Offene Punkte — Stand 2026-08-10

Ergänzt `UEBERGABE-CHAT.md` (Stand 2026-08-03). Für Architektur und Auslieferung
siehe `DEPLOYMENT.md`, für den Weg zu nativen Apps `PLAN-NATIVE-APPS.md`,
für den bereits umgesetzten Filter-Umbau `PLAN-FILTER.md`.

**Diese Datei ist der Einstiegspunkt.** Abschnitt 2 sagt, was noch zu tun ist;
Abschnitt 1 und 5, was man vorher wissen sollte.

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

## 0. Was am 9. August dazukam (5 Commits)

Die Sitzung ging über den 7. hinaus weiter. Das Wichtigste zuerst, weil es die
Bedienung grundlegend geändert hat.

| Commit | Inhalt |
|---|---|
| `a762d66` | Plan für den Filter-Umbau (`PLAN-FILTER.md`) |
| `4641de6` | Watchliste, Gesehen und Neue entdecken frei kombinierbar — auch im Kino |
| `e9f1820` | Filme und Serien sind Filter statt Tabs — eine Liste, eine Sortierung |
| `4a7d4eb` | Datenschutz: Hinweisboxen entfernt |
| `52f5496` | Nachladen und Bereichswechsel springen nicht mehr aus dem Bild |

### 0.1 Der Filter-Umbau — alles frei kombinierbar

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

### 0.2 Drei Meldungen „der erste Klick wird nicht erkannt" — eine Ursache

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

### 0.3 Rechtstexte

Die vier gelben Hinweisboxen in `datenschutz.html` sind entfernt — sie waren für
die interne Arbeit gedacht, nicht für Besucher. **Zwei Angaben fehlen dadurch
still**, siehe 2.1.

Alle drei Rechtstexte setzten nur `color: #1a1a1a` und keine Hintergrundfarbe;
im Dunkelmodus stand fast schwarzer Text auf dunklem Grund. Sie haben jetzt
`color-scheme: light` und weißen Hintergrund.

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

> Dieser Abschnitt ist **Vorgeschichte**. Mehrere hier genannte Bezeichner
> (`einstiegOffen`, `startEinstiegSetzen`, `kinoStatus`) gibt es seit dem
> 9. August nicht mehr — sie sind mit dem Filter-Umbau entfallen, siehe 0.1. Wer
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

## 2. Was jetzt noch offen ist

Die Liste vom 7. August („Uneinheitliches in der Bedienung") ist durch den
Filter-Umbau vom 9. August weitgehend erledigt. Was davon übrig blieb, steht
unten mit dabei.

### 2.1 Zwei Angaben in der Datenschutzerklärung fehlen — vor Go-Live

Die Hinweisboxen sind auf Wunsch entfernt worden, die Lücken bestehen weiter und
sind jetzt **nicht mehr sichtbar**:

- **Abschnitt 5 (Hosting):** Der Serverstandort fehlt (Deutschland/Finnland).
  Der Absatz liest sich vollständig, nennt aber nur „Hetzner Online GmbH".
- **Abschnitt 6 (E-Mail-Versand):** Es steht „einen externen
  Versanddienstleister" statt eines Namens. Der Anbieter ist **Resend** (laut
  `MAIL_PROVIDER` auf dem Server). Bewusst nicht eingetragen: Wer in einer
  Datenschutzerklärung als Auftragsverarbeiter genannt wird, ist eine rechtliche
  Angabe — das gehört von Hand entschieden.

Ebenfalls weiter offen: `impressum.html` rechtlich prüfen, dazu Abschnitt 9 der
Datenschutzerklärung (kommerzielle Verwertung), der als Entwurf entstanden ist.

### 2.2 Englische Titel durchsuchbar machen — entschieden, aber nicht gebaut

**Der Nutzen ist gemessen, die Umsetzung steht aus.** Wer einen Film unter
seinem englischen Namen kennt, findet ihn heute nicht.

- **57 %** der Titel heißen auf Englisch anders (an 150 und an 2.000 zufälligen
  Titeln gemessen) — rund **15.000 Titel**.
- Die 188 echten Suchbegriffe aus `search_queries` sind **überwiegend englisch**
  (`unfamiliar`, `heat`, `will smith`, `hangover`, `rush hour`, `avengers`).
- Einige Serien stehen mit koreanischem oder japanischem Titel im Bestand
  (`로맨스는 별책부록`) und sind derzeit praktisch unauffindbar.

In der Datenbank steht es **nicht**: `original_title` ist nur bei **165 von
26.869** Titeln gefüllt und enthält obendrein den Originaltitel (`아가씨`), nicht
den englischen. TMDB liefert ihn unter `language=en-US`.

**Empfohlene Umsetzung (gemessen, nicht geschätzt):** Spalte `title_en`,
Backfill über ~27.000 TMDB-Abrufe (**~77 Minuten**), Anbindung an die Suche,
und der tägliche Job muss es für neue Titel mitschreiben (sonst wächst die Lücke
wieder).

Entscheidend ist **wie** gesucht wird — das war gemessen worden:

| englischer Titel … | Begriffe mit Zusatztreffern | Zusatztreffer je 2.000 Titel |
|---|---|---|
| als Teilstring (wie der Titel heute) | 30 von 188 | **230** |
| **wortgenau** (wie Besetzung/Regie heute) | 10 von 188 | **13** |

Wortgenau, denn die 13 sind fast alle berechtigt (`crime` → „True Crime",
`rush` → „The Gold Rush"). Als Teilstring entsteht Unsinn: `mil` träfe „In the
**Fam**i**l**y", `ar` allein 82 Zusatztreffer. Der Preis: Beim Tippen greift es
erst bei fertigem Wort — das fängt die Vorschlagsliste ab (dort als eigene Art
„Englischer Titel", nur wenn er sich deutlich vom deutschen unterscheidet, sonst
stünden zwei Vorschläge für denselben Film).

Abgespeckte Variante, falls 27.000 Abrufe zu viel sind: nur die ~5.000
meistbewerteten Titel (~15 Min.), später aufstocken.

### 2.3 Match filtert im Kino nicht — ausdrücklich so gewollt

| | Watchliste/Gesehen | Neue entdecken |
|---|---|---|
| Filme/Serien | Schnittmenge mit allen Ausgewählten | ungefiltert, gemeinsame Sortierung |
| Kino | **eigene** Markierungen, kein Filter | ungefiltert, gemeinsame Sortierung |

Am 7. August bestätigt („ok so lassen"). Einziger Hinweis darauf ist der
Leistentext: „Kino-Vorschläge für dich und X" statt „Gemeinsame Titel mit X".
**Nicht ändern, ohne das erneut zu besprechen.**

### 2.4 Eigene Titel verschwinden bei den anderen Sortierungen

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

### 2.5 Kleineres aus der Durchsicht vom 7. August

Alles im laufenden Build gemessen, nicht aus dem Code geschlossen.

- **Der Taste-Score bedeutet drei Dinge, ohne dass es dransteht.** Derselbe
  Titel: allein **37**, mit Abgleich + Entdecken **44**, in einer fremden Liste
  **37**. Vorschlag: bei gemeinsamer Rechnung an der Erklärung ergänzen („für
  dich und Pete"), die Zahl selbst muss nicht anders aussehen.
- **Ein Leerzustand behauptet etwas Falsches.** Fremde Liste + eigener
  Streaming-Filter ohne Treffer → „Pete hat hier nichts markiert." Falsch — Pete
  hat fünf Titel, der Anbieterfilter hat sie weggenommen.
- **Wischen in einer fremden Kino-Liste blendet den Titel für einen selbst aus.**
  `darfAusblenden` in `poolItemLi` prüft `discoverFilterOn || cinemaMode`; in
  einer fremden Liste greift `cinemaMode`. Unter Filme/Serien ist es dort schon
  gesperrt.
- **Zwei Zahlen für dasselbe:** Die leere Watchliste sagt „mind. **20** Titel",
  der Einstieg sagt „ab **10** gespeicherten Titeln", `effectiveSort` schaltet
  bei **10** um.
- **„Neue entdecken" ist in fremden Listen ausgegraut** — richtig so, aber es
  steht nirgends warum.

### 2.6 Erledigt (nicht erneut aufmachen)

- Kino führte eine eigene Statusauswahl → **behoben** (`kinoStatus` entfernt).
- Die drei Status schlossen sich aus → **behoben** (frei kombinierbar).
- Suche + Abgleich verhielten sich im Kino anders → **entfällt** mit dem
  gemeinsamen Zustand.
- Sortierung war je Bereich getrennt → **behoben** (eine Sortierung).
- Die Tab-Reihe sah aus wie ein Filter, war aber ein Seitenwechsel → **behoben**
  (Filme/Serien filtern jetzt wirklich, Kino ist abgesetzt).

## 3. Offen aus früheren Sitzungen

### Rechtliches, vor Go-Live bzw. App Store

- Serverstandort und Mailanbieter in `datenschutz.html`, `impressum.html`
  prüfen lassen — siehe 2.1, dort ausführlich.
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
- **Tour-Screenshots in `tour/` sind veraltet.** Sie zeigen die alte Tab-Reihe
  (genau ein Bereich aktiv) und die alte Statusreihe. Seit dem Filter-Umbau
  leuchten Filme und Serien gleichzeitig, Kino ist abgesetzt, und alle drei
  Status sind an. Neu erzeugen: `bash scripts/tour/aufnehmen.sh` (braucht Chrome
  und Netz). **Das ist die sichtbarste Altlast** — die Bilder widersprechen
  inzwischen dem, was man beim Öffnen sieht.
- **Einladungen lassen sich nicht zurückziehen**, und Links gelten für beliebig
  viele Personen. Eine Liste der offenen Einladungen mit Schließen-Knopf wäre der
  nächste Schritt.
- **`users.invited_by_user_id`** wird gefüllt, aber nirgends angezeigt.
- **Community-Bewertung fließt gar nicht in den Taste-Score** ein. Offen, ob sie
  in anderer Form zurück soll (Idee: Dämpfung nur am unteren Ende).
- **Aktionszeile bei 320px** bricht auf vier Zeilen um; nur über eine kürzere
  Beschriftung als „Ähnliche Titel" lösbar.

### Bewusst nicht gemacht

Rückseiten von DVD/Blu-ray (TMDB kennt sie nicht) · Wiederaufführungen im Kino
kennzeichnen · Match filtert im Kino nicht (siehe 2.3) · eigene Titel bei den
anderen Sortierungen vorziehen (siehe 2.4).

„Filme und Serien gemeinsam anzeigen" stand hier jahrelang als bewusst
abgelehnt. **Das ist seit dem 9. August umgesetzt** — der Typ ist keine
Tab-Achse mehr, sondern ein Filter.

---

## 4. Fallstricke, die in dieser Sitzung Zeit gekostet haben

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

## 5. Bekannte Einschränkungen

- **Favoriten in der Personenliste** liegen nur im Browser, gelten also je Gerät.
- **Match im Kino** filtert nicht, sondern sortiert um (siehe 2.3).
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
