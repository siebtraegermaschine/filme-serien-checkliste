# Plan: Filme, Serien und die drei Status frei kombinierbar

> **Erledigt am 9. August 2026.** Alle fünf Phasen sind umgesetzt und live
> (`4641de6`, `e9f1820`). Dieses Dokument bleibt als Begründung stehen — warum
> der Umbau so geschnitten wurde und was dabei bewusst entfernt worden ist.
> Der aktuelle Stand steht in `UEBERGABE-OFFEN.md`, Abschnitt 1.1.
>
> Zwei Abweichungen vom Plan beim Umsetzen:
> - Der automatische Einstieg (`startEinstiegSetzen`) fiel schon in Phase 1 weg
>   statt in Phase 3 — er gehört zur Statusachse, nicht zur Typachse.
> - `listenAnsichtHerstellen()` kam ungeplant dazu: `setTab` schaltet jetzt um,
>   die beiden bestehenden Aufrufe (Seitenaufbau, Logo) hätten damit „Filme"
>   abgewählt.

## Ziel

Aus vier getrennten Listen, zwischen denen man umschaltet, wird **eine Liste mit
Filtern**. Alle Knöpfe verhalten sich gleich: an- und abwählbar, nichts schaltet
sich von selbst ab.

```
[ Filme ✓ ] [ Serien ✓ ]        ‖  [ 🍿 Kino ]     ← Typ-Filter | abgesetzt: Seitenwechsel
[ Watchliste ✓ ] [ Gesehen ✓ ] [ Neue entdecken ✓ ]
[ Deine Streaming-Anbieter ]   [ Sortieren ]
```

Entschieden: Beim Start ist **alles an**, die Auswahl wird **nicht gemerkt**.
Kino bleibt eine eigene Seite (Variante c), sitzt weiter in der Reihe, ist aber
sichtbar abgesetzt — und benutzt **dieselbe** Statusauswahl.

---

## Was wegfällt

Der Umbau entfernt mehr Code als er hinzufügt. Das ist der eigentliche Gewinn:

| Weg | Warum |
|---|---|
| `kinoStatus` (9 Stellen) | Kino teilt sich die Auswahl mit Filme/Serien |
| `enforceDiscoverLock()` (6) | die Ausschlussregel entfällt |
| Ausschluss-Zweig in `toggleStatus` | dito |
| `EINSTIEGE` / `startEinstiegSetzen` / `einstiegOffen` (10) | beim Start ist alles an, es gibt nichts zu wählen |
| `sortManual.serien` | eine Liste, eine Sortierung |
| `effectiveCat()` | hat nur noch einen Wert |

## Was ersetzt wird

`activeTab` (26 Stellen, davon ~10 echter Code) wird zu einer Typmenge.
`aktiveTypen()` **existiert bereits** und liefert während einer Suche schon
heute beide Typen — sie wird zur einzigen Wahrheit:

```js
var TYPEN = { filme: true, serien: true };     // beim Start beides an
function aktiveTypen(){
  var t = [];
  if (TYPEN.filme) t.push('filme');
  if (TYPEN.serien) t.push('serien');
  return t;
}
```

`sucheTypen` (13 Stellen) geht darin auf — die Suche braucht dann keinen
eigenen Typzustand mehr, weil der reguläre schon beides kann.

---

## Phasen

Jede Phase ist für sich lauffähig und wird einzeln geprüft, bevor die nächste
beginnt. Reihenfolge so gewählt, dass die riskanteste Änderung (Typmenge) auf
bereits vereinfachtem Code aufsetzt.

### Phase 1 — Statusachse frei kombinierbar

- Ausschluss-Zweig aus `toggleStatus` entfernen, `enforceDiscoverLock()` löschen
- „Mindestens einer bleibt an" bleibt (sonst leere Liste ohne erkennbaren Grund)
- Ausnahme bleibt: in einer fremden Liste ist „Neue entdecken" gesperrt
- Startwerte: alle drei an

**Prüfen:** Alle acht Kombinationen durchklicken; die Liste enthält jeweils
genau die erwarteten Anteile. Fremde Liste: Entdecken weiterhin gesperrt.

### Phase 2 — Kino teilt sich die Statusauswahl

- `kinoStatus` entfernen, `statusLesen`/`statusSchreiben` auf die globalen
  Schalter zusammenziehen
- `renderCinemaSection` liest dieselben Schalter
- Kino behält seine eigene Sortierung (`cinemaSortKey`) — andere Datenquelle,
  „Neu im Kino" gibt es woanders nicht

**Prüfen:** Auswahl unter Filme setzen, auf Kino wechseln, zurück — sie steht
unverändert da. Das ist Punkt 2.1 der Übergabe, damit erledigt.

### Phase 3 — Typachse frei kombinierbar

- `TYPEN` einführen, `activeTab` an den ~10 echten Stellen ersetzen
- `setTab(t)` wird zu `typUmschalten(t)`: an/aus statt Wechsel, letzter aktiver
  nicht abwählbar
- Knopf-Hervorhebung: beide Tabs können gleichzeitig leuchten
- `sucheTypen` und der Typ-Teil von `sucheZustandAnwenden` entfallen
- `applyFilter()` liest `state[activeTab]` — die Funktion ist seit der
  25er-Umstellung ohnehin nur noch für den leeren Suchbegriff erreichbar und
  wird ersatzlos entfernt

**Prüfen:** Gemischte Liste zeigt „· Film" und „· Serie" (steht schon in der
Metazeile). Suche über beide Typen. Leerzustände stimmen.

### Phase 4 — Eine Sortierung

- `sortManual` von `{filme, serien}` auf einen Wert
- `effectiveSort()` ohne Argument, `effectiveCat()` entfällt
- Der gespeicherte Wert im Browser (`top200-sort-v2`) bekommt ein neues Format;
  alte Einträge gelten als abgelaufen (der Mechanismus dafür existiert schon)

**Prüfen:** Sortierung bleibt beim Ab- und Anwählen von Typen stehen. Automatik
ab 10 markierten Titeln greift weiter.

### Phase 5 — Kino sichtbar absetzen

- Trenner und eigene Form für den Kino-Knopf, damit erkennbar ist, dass er die
  Seite wechselt statt zu filtern
- Bei 320px prüfen (dort ist die Zeile ohnehin eng, siehe Übergabe)

---

## Was dabei kaputtgehen kann

**Der Einstieg.** `startEinstiegSetzen` fällt weg — genau die Funktion, die in
dieser Sitzung schon zweimal Ärger gemacht hat. Nach dem Umbau darf beim Start
nichts mehr an der Auswahl drehen. Prüfen: nach dem Laden sind alle fünf Knöpfe
an, und sie bleiben es auch nach dem Nachladen des Fortschritts.

**Der Logo-Klick.** `goHome()` setzt heute Tab, Status, Suche und Sortierung.
Künftig: alles wieder an, Suche leer, Sortierung auf Automatik.

**Die Suche.** Sie stellt heute einen Sonderzustand her und stellt ihn danach
wieder her (`sucheZustandVorher`). Wenn ohnehin alles an ist, ist der Sonderfall
fast leer — aber der Streaming-Filter wird weiterhin für die Dauer der Suche
abgeschaltet, das bleibt.

**Fremde Listen und Abgleich.** Beide hängen an `aktiveTypen()` und der
Statusauswahl. `einstiegSetzen()` und `matchEinstiegSetzen()` setzen heute
gezielt Tab und Status — die müssen auf die neue Welt umgestellt werden, sonst
landet man nach dem Abgleich-Fenster in einem Zustand, den es nicht mehr gibt.

---

## Prüfung

Nach jeder Phase im laufenden Build gegen die Produktionsdaten messen (lokaler
Server auf Port 4600, `/api` an die Produktion durchgereicht), so wie in dieser
Sitzung: Zustände durchschalten, Zeilenzahlen und Knopfzustände auslesen, nicht
nur draufschauen.

Vor dem Push zusätzlich: die vier Bereiche allein / fremde Liste / Abgleich
einmal vollständig durchspielen, weil der Umbau alle drei Nutzungsarten
gleichzeitig berührt.

---

## Aufwand und Risiko

Ein zusammenhängender Umbau an etwa 60 Fundstellen in `index.html`, kein
Backend, keine Daten. Aufgeteilt in fünf Commits entlang der Phasen.

Das Risiko liegt nicht in der Menge, sondern darin, dass Sortierung, Einstieg,
Suche, Abgleich und fremde Listen **gleichzeitig** berührt werden — dieselbe
Konstellation, in der in dieser Sitzung zwei Fehler entstanden sind. Deshalb die
Aufteilung in einzeln prüfbare Phasen statt eines großen Wurfs.
