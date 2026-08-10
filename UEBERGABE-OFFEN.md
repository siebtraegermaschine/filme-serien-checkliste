# Offene Punkte — Stand 2026-08-10

Ergänzt `UEBERGABE-CHAT.md` (Stand 2026-08-03). Für Architektur und Auslieferung
siehe `DEPLOYMENT.md`, für den Weg zu nativen Apps `PLAN-NATIVE-APPS.md`,
für den bereits umgesetzten Filter-Umbau `PLAN-FILTER.md`, für den offenen
Rechtstext zum Mailversand `ENTWURF-DATENSCHUTZ-MAIL.md`.

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

### 3.1 Abschnitt 6 der Datenschutzerklärung — vor Go-Live

**Der Serverstandort ist am 10. August erledigt** (`2dd9f2c`). Ermittelt statt
geschätzt: IP `167.233.54.20`, RIPE-Netz `CLOUD-FSN1` (country `DE`), Hostname
`ubuntu-2gb-fsn1-1`, Rechenzentrum `fsn1-dc14` — **Falkenstein, Sachsen**, nicht
Finnland. Abschnitt 5 nennt jetzt Standort und Anschrift und stellt fest, dass die
Verarbeitung die EU nicht verlässt.

Offen bleibt **Abschnitt 6 (E-Mail-Versand)**, und zwar in drei Punkten. Der
fertige Text dafür liegt in `ENTWURF-DATENSCHUTZ-MAIL.md`, samt der Ergänzungen
für die Abschnitte 2, 3 und 10 — bewusst **neben** dem Rechtstext, nicht darin.

- **Der Anbieter ist nicht genannt.** Es steht „einen externen
  Versanddienstleister". Bestätigt auf dem Server: `MAIL_PROVIDER=resend`,
  Versand über `api.resend.com`. Wer den Namen einträgt, muss zugleich die
  Übermittlung in die USA und den AV-Vertrag beschreiben — Aussagen über
  Verträge, die von Hand entschieden gehören. Deshalb Platzhalter im Entwurf.
- **Genannt, existiert aber nicht:** „Registrierungs-E-Mails". Im Code gibt es
  nur `sendPasswordResetMail` — bei der Registrierung geht keine Mail raus.
- **Existiert, ist aber nirgends genannt: die Feedback-Mails.** Sie laufen
  ebenfalls über Resend und enthalten bis zu **5.000 Zeichen Freitext** plus,
  bei angemeldeten Personen, die **E-Mail-Adresse des Kontos**; Empfänger ist
  `info@digital-wings.com`. Das Wort „Feedback" kommt in `datenschutz.html`
  **überhaupt nicht** vor — auch nicht in Abschnitt 2, 3 oder 10. Das wiegt
  schwerer als die fehlende Anbieternennung: Hier ist eine ganze Verarbeitung
  nicht beschrieben.

Ebenfalls weiter offen: `impressum.html` rechtlich prüfen, dazu Abschnitt 9 der
Datenschutzerklärung (kommerzielle Verwertung), der als Entwurf entstanden ist.
Sinnvollerweise in **einem** Durchgang mit Abschnitt 6, statt zweimal zu fragen.

### 3.2 Englische Titel durchsuchbar machen — entschieden, aber nicht gebaut

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
- **Wischen in einer fremden Kino-Liste blendet den Titel für einen selbst aus.**
  `darfAusblenden` in `poolItemLi` prüft `discoverFilterOn || cinemaMode`; in
  einer fremden Liste greift `cinemaMode`. Unter Filme/Serien ist es dort schon
  gesperrt.
- **Zwei Zahlen für dasselbe:** Die leere Watchliste sagt „mind. **20** Titel",
  der Einstieg sagt „ab **10** gespeicherten Titeln", `effectiveSort` schaltet
  bei **10** um.
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

## 4. Offen aus früheren Sitzungen

### Rechtliches, vor Go-Live bzw. App Store

- Abschnitt 6 von `datenschutz.html` und `impressum.html` prüfen lassen — siehe
  3.1, dort ausführlich; fertiger Textentwurf in `ENTWURF-DATENSCHUTZ-MAIL.md`.
  Der Serverstandort ist seit dem 10. August eingetragen.
- Privacy Nutrition Labels und Altersfreigabe im Store-Formular; Konten
  (Apple 99 $/Jahr, Google 25 $ einmalig).

### Technisch

- **Feedback wird nicht gespeichert**, nur per Mail verschickt. Schlägt Resend
  fehl, ist die Nachricht weg. Hängt mit 3.1 zusammen: Der Entwurf sagt zu, dass
  die Nachricht nicht in der Datenbank landet — wer das ändert, muss den Satz
  mitändern.
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

- **Favoriten in der Personenliste** liegen nur im Browser, gelten also je Gerät.
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
