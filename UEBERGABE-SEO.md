# Übergabe: SEO-Texte movietaste.de

Stand: 19.08.2026 · 6157 Titeltexte in der Datenbank (de-de), 14.106 offen auf Stufe B · SEO-Seiten freigegeben · Fächer-Verfahren aktiv (Abschnitt 3b)

---

## Übergabeprompt für den neuen Chat

Kopiere alles ab hier bis zum Trennstrich in den neuen Chat:

---

Mach beim SEO-Rework für movietaste.de weiter. Lies zuerst `UEBERGABE-SEO.md` im Repo-Wurzelverzeichnis — dort steht der vollständige Arbeitsablauf, die Formatvorgabe und die Regeln.

Kurzfassung: Pro Durchgang vier bis fünf Blöcke à 8 Titel. Kandidaten aus der Produktionsdatenbank nach `vote_count` absteigend. Für jeden Titel Wikipedia recherchieren — **alle Abrufe eines Blocks parallel in einer Nachricht**, das ist der Flaschenhals. Dann im Vier-Abschnitte-Format schreiben, per `anhaengen.mjs` einspielen, committen, pushen. Deploy und Ladelauf nur alle ~20 Blöcke gesammelt, nicht nach jedem Block.

Absolute Regel: **keine erfundenen Fakten.** Nur schreiben, was in der abgerufenen Quelle steht. Vor jedem Einspielen einen Korrekturdurchgang machen und alles streichen, was aus Vorwissen statt aus der Quelle stammt. Das fängt pro Block 10–20 Behauptungen ab — ohne diesen Schritt stehen erfundene Details live.

---

## 1. Was das ist

movietaste.de hat neben der Web-App eigenständige SEO-Landingpages unter `/de-de/...`.
Jede Titelseite braucht einen eigenen redaktionellen Text in der Tabelle `seo_content`.
**Der TMDB-Kurztext wird nie verwendet** — Seiten ohne eigenen Text bleiben `noindex`.

**Indexierung — dauerhafte Regel (Christian, 17.08.2026):**
Eine Seite wird genau dann indexiert, wenn sie eigenen Inhalt hat. Angelegte URLs
ohne Inhalt bleiben erreichbar, tragen aber `noindex` — und kippen automatisch auf
`index`, sobald ein Text vorliegt. Es gibt keinen Gesamtschalter mehr; gesteuert wird
das je Seite über `indexierbar` in `backend/lib/seoData.js` (im Regelfall
`!!text`, bei Listen- und Personenseiten zusätzlich: es müssen Einträge da sein).

`indexierbar` **nie hart auf true setzen.** Wer neue Seitentypen ergänzt, folgt
derselben Regel. Abgesichert durch `backend/test/seoIndexierung.test.js` (6 Tests,
laufen ohne Datenbank).

Die `Sitemap:`-Zeile in `robots.txt` ist aktiv. Die Sitemap listet ausschließlich
Seiten mit vorhandener `seo_content`-Zeile — dieselbe Regel wie das Meta-Tag.

## 2. Pflichtformat für `bereich='titel'`

Exakt diese vier Überschriften, in dieser Reihenfolge, keine weiteren:

```
### Worum es geht
### Entstehungsgeschichte
### Hinter den Kulissen
### Einordnung & Wirkung
```

Mindestens 250 Wörter (wird vom Einspielskript erzwungen), Zielwert 300+.
Aktueller Schnitt: 339 Wörter.

## 3. Ablauf pro Runde

1. **Offene Kandidaten ermitteln**
   ```bash
   node -e "
   const fs=require('fs');
   import('./backend/scripts/seo-content-daten.mjs').then(m=>{
     const v=new Set(m.EINTRAEGE.filter(e=>e.bereich==='titel').map(e=>e.schluessel));
     const liste=JSON.parse(fs.readFileSync('backend/scripts/seo-kandidaten.json','utf8'));
     const offen=liste.filter(e=>!v.has(e.k));
     console.log('offen:',offen.length);
     console.log(offen.map(e=>e.k.padEnd(15)+' '+(e.t||'').padEnd(46)+e.y).join('\n'));
   });"
   ```

2. **Recherche — parallel!** Alle 8 WebFetch-Aufrufe eines Blocks in *einer* Nachricht.
   Sequenziell dauert das achtmal so lange.
   Bei jedem dritten bis vierten Titel führt die deutsche Wikipedia auf eine
   Begriffsklärungsseite oder einen 404 — dann englische Fassung nachziehen
   (`en.wikipedia.org/wiki/Titel_(YYYY_film)` oder `_(film)`).

3. **Schlüsselabgleich vor dem Schreiben.** Prüfen, dass für *jeden* Schlüssel des
   Blocks tatsächlich ein Abruf vorliegt. Ist mir einmal durchgerutscht
   (*Sweet Home Alabama* komplett aus dem Gedächtnis geschrieben) — nur beim
   Durchsehen gefunden.

4. **Schreiben** in eine Datei `neu-NNN.mjs` im Scratchpad, Form:
   ```js
   export const NEU = {
     'movie:12345': `### Worum es geht

   ...`,
   };
   ```

5. **Korrekturdurchgang.** Jede Behauptung gegen die Quelle prüfen. Typische Fundstellen:
   Rollennamen, Ortsangaben, Altersangaben, Laufbahn-Einordnungen von Darstellern,
   Vergleiche mit anderen Filmen, "gilt als…"-Sätze. Alles streichen oder auf
   Interpretation umstellen. Interpretation ist erlaubt, erfundene Fakten nicht.

6. **Einspielen**
   ```bash
   node backend/scripts/seo-texte-anhaengen.mjs /tmp/neu-NNN.mjs "Block NNN"
   node --check backend/scripts/seo-content-daten.mjs
   ```
   Das Skript bricht atomar ab (nichts wird geschrieben), wenn ein Text
   das Format verletzt, unter 250 Wörter liegt oder der Schlüssel schon existiert.
   Bei Unterlänge: mit *belegtem* Material auffüllen, nicht mit Floskeln.

7. **Kennzahlen**
   ```bash
   node -e "
   import('./backend/scripts/seo-content-daten.mjs').then(m=>{
     const t=m.EINTRAEGE.filter(e=>e.bereich==='titel');
     const w=t.reduce((s,e)=>s+e.text.split(/\s+/).length,0);
     console.log('Titel:',t.length,'| Woerter:',w,'| Schnitt:',Math.round(w/t.length),
       '| Dupl:',t.length-new Set(t.map(e=>e.schluessel)).size,
       '| Format:',t.filter(e=>!/### Worum es geht[\s\S]*### Entstehungsgeschichte[\s\S]*### Hinter den Kulissen[\s\S]*### Einordnung & Wirkung/.test(e.text)).length);
   });"
   ```

8. **Tests** (`cd backend && npm test`): 32 Tests, 21 grün, 11 rot.
   Die 11 roten sind **immer** `ECONNREFUSED 127.0.0.1:55432` — keine lokale
   Postgres-Instanz. Das ist der Normalzustand, kein Regressionszeichen.

9. **Commit + Push**, ohne auf den Deploy zu warten.

10. **Nur alle ~20 Blöcke:** Deploy abwarten und Texte laden.
    ```bash
    until ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=20 root@movietaste.de \
      "docker exec movietaste-backend-1 grep -q 'movie:XXXXX' /app/backend/scripts/seo-content-daten.mjs" 2>/dev/null; do sleep 30; done
    ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=20 root@movietaste.de \
      "docker exec movietaste-backend-1 sh -c 'cd /app/backend && npm run seo-content'"
    ```
    **Wichtig: Der Deploy lädt die Texte nicht.** `npm run seo-content` muss von Hand laufen.
    `ServerAliveInterval` nicht weglassen — die Verbindung bricht sonst ab.

11. **Live prüfen**
    ```bash
    curl -s https://movietaste.de/sitemap-de-de-titel.xml | grep -c 'loc>'
    curl -s -o /dev/null -w '%{http_code}' https://movietaste.de/de-de/film/SLUG-ID
    curl -s https://movietaste.de/de-de/film/SLUG-ID | grep -o '<meta name="robots"[^>]*>'
    ```
    Erwartung: Sitemap-Zahl = Titelzahl, HTTP 200, und `index,follow` bei Seiten
    mit Text bzw. `noindex,follow` bei Seiten ohne.

---

## 3b. Fächer-Verfahren für den Langschwanz (ab 18.08.2026)

Der Ablauf unter 3. bleibt gültig für **Spitzentitel**, bei denen sich Wikipedia-
Recherche lohnt. Für die rund 18.000 übrigen Titel gilt ein zweites Verfahren:
Die Texte entstehen aus den **eigenen Metadaten**, mehrere Bearbeiter arbeiten
gleichzeitig, und die Faktenregel wird maschinell durchgesetzt statt von Hand.

**Warum überhaupt:** Von den 27.019 Titeln haben nur 30–40 Prozent im
Langschwanz einen brauchbaren Wikipedia-Artikel. Das Handverfahren ist dort
nicht langsam, sondern nicht zu Ende führbar. Aus der Datenbank dagegen lassen
sich 23.439 Titel belegen — Quelle ist dann der Datensatz statt eines Artikels.

**Ein Durchgang:**

```bash
# 1. Pakete schneiden (auf dem Server, wegen DB-Zugriff)
ssh root@movietaste.de "docker exec movietaste-backend-1 sh -c \
  'cd /app/backend && node scripts/seo-pakete.mjs --pakete 10 --je 15 --ziel /tmp/pakete'"

# 2. Pakete herunterladen, je Paket einen Bearbeiter starten
#    (Auftragsbeschreibung: scratchpad/auftrag.md — steht EINMAL dort,
#     nicht in jedem Prompt, damit Regeländerungen an einer Stelle passieren)

# 3. Fertige Texte hochladen und prüfen lassen
ssh root@movietaste.de "docker exec movietaste-backend-1 sh -c \
  'cd /app/backend && node scripts/seo-einspielen.mjs --verzeichnis /tmp/texte --dry-run'"

# 4. Wenn sauber: ohne --dry-run wiederholen. Schreibt direkt nach seo_content,
#    kein Umweg über seo-content-daten.mjs und keinen Ladelauf.
```

**Gemessen am 18.08.2026:** 4 Bearbeiter × 12 Titel = 48 Texte in ~4,5 Minuten,
~6.200 Token je Text, 48 von 48 durch die Prüfung. Bindende Grenze ist das
Nutzungsfenster, nicht das Verfahren.

**Die Prüfung ist die halbe Miete.** `seo-einspielen.mjs` verwirft jeden Text,
der durchfällt, und schreibt ihn nicht. Geprüft wird auf Format, auf Zahlen ohne
Beleg, auf Beteiligte, die im Datensatz nicht vorkommen, und auf Wendungen, die
typischerweise eine unbelegte Behauptung einleiten (Auszeichnungen, Einspiel-
ergebnisse, Drehorte, Rezeption, Werkbezüge).

**Warnung aus Erfahrung:** Der erste Entwurf dieser Prüfung meldete 36 von 36
Texten als verdächtig — ausnahmslos falsch, weil er im Deutschen nach zwei
großgeschriebenen Wörtern hintereinander suchte („Die Altersfreigabe"). Eine
Prüfung, die immer anschlägt, ist schlechter als keine: Sie erzieht dazu, sie zu
ignorieren. Wer sie ändert, misst sie an echten Texten nach und lässt
`backend/test/seoFaktenpruefung.test.js` laufen — die Tests halten **beide**
Richtungen fest, auch die Fehlalarme.

**Indexierung:** Titelseiten tragen `index` erst ab 250 Wörtern Fließtext
(`MINDESTWOERTER_INDEX` in `seoData.js`). Damit können Texte gefahrlos
geschrieben werden, ohne dass dünne Seiten in den Index laufen und dort
abgewertet werden. Die Schwelle gilt **nur** für Titelseiten — Genre-, Hub- und
Anbieterseiten haben bewusst kurze Einleitungen, ihr Inhalt sind die Listen.

**Falls doch über die API:** `seo-batch.mjs` macht dasselbe unbeaufsichtigt,
inklusive Prompt-Caching und Verbrauchszählung. Kosten mit Sonnet 5 über die
Batch-API rund 66 € für Deutsch, 463 € für sieben Sprachen. Braucht
`ANTHROPIC_API_KEY` in `/opt/movietaste/backend/.env` — getrennte Abrechnung,
nicht vom Abo gedeckt.

---

## 4. Kandidatenliste nachladen

Wenn die vorbereitete Liste zur Neige geht — Schwellwert aus der bestehenden Liste ablesen
und darunter nachladen:

```bash
ssh -o StrictHostKeyChecking=no root@movietaste.de \
  "docker exec movietaste-postgres-1 psql -U postgres -d filme_serien -t -A -F'|' -c \
  \"SELECT type || ':' || tmdb_id, title, COALESCE(year::text,''), COALESCE(director,''), vote_count \
    FROM titles WHERE vote_count < SCHWELLE AND tmdb_id IS NOT NULL \
    ORDER BY vote_count DESC LIMIT 300\"" > /tmp/roh-liste.txt
```
Spalten der Tabelle `titles`: `tmdb_id`, `type`, `title`, `year`, `director`, `vote_count`.
(Nicht `media_type` — die Spalte gibt es nicht.)

Danach in `neue-liste.json` mergen, Feldnamen: `k` (Schlüssel), `t` (Titel), `y` (Jahr),
`d` (Regie), `v` (vote_count).

## 5. Redaktionelle Linie

- **Schlusswendungen zurückhalten**, wenn sie der Punkt des Films sind
  (*Zeugin der Anklage*, *House of Flying Daggers*, *Audition*, *Sorry to Bother You*).
- **Kontroversen sachlich benennen**, nicht glätten und nicht moralisieren.
  Beispiele im Bestand: *365 Days* (0 % RT, Vorwurf der Verklärung übergriffigen
  Verhaltens), *Detroit* (Perspektivdebatte), *Der Zoowärter* (toter Giraffe, PETA),
  *30 Minuten oder weniger* (realer Todesfall als Komödienstoff),
  *Bowling for Columbine* (Methodenkritik), *Trumbo* (Auslassungen).
- **Reale Opfer respektvoll behandeln**: *Verónica*, *The Forest*, *Hotel Mumbai*,
  *Judas and the Black Messiah*, *Auf meiner Haut*.
- Keine erfundenen Biografien bei Personenseiten.

## 6. Zwei offene Entscheidungen für Christian

1. **Subagenten** — würden den Durchsatz nochmals etwa verdreifachen. Ich starte keine
   ohne ausdrückliche Zustimmung. Vorbehalt: Jeder Entwurf müsste gegen die Quelle
   gegengeprüft werden, sonst greift der Faktencheck nicht.
2. **Textlänge** — aktuell 326 Wörter im Schnitt bei 250 Minimum. Absenkung auf ~260
   brächte etwa 25 % mehr Titel pro Zeiteinheit. Qualitätsabtausch, seine Entscheidung.

## 7. Zwei Fehlerklassen, die wiederkehren

- **Details aus Vorwissen statt aus der Quelle.** Der häufigste Fall. Der
  Korrekturdurchgang fängt pro Block 10–20 davon ab. Nicht weglassen.
- **Deutsche Verleihtitel ohne Bezug zum Original.** *Die Highligen drei Könige* ist
  „The Night Before", *Wie Jodi über sich hinauswuchs* ist „Tall Girl". Bei jedem Titel,
  dessen deutscher Name nicht rückübersetzbar ist, erst Jahr und Regie gegen die
  Kandidatenliste prüfen.

## 8. Dateien

| Pfad | Zweck |
|---|---|
| `backend/scripts/seo-content-daten.mjs` | Die Texte. Einziger Ort, der wächst. |
| `backend/scripts/seo-content-laden.mjs` | Lädt sie in die DB (`npm run seo-content`). |
| `backend/lib/seoRender.js` | HTML-Erzeugung, `SEO_FREIGEGEBEN`-Schalter. |
| `backend/lib/seoData.js` | Datenbeschaffung für die Seiten. |
| `backend/routes/seo.js` | Routen. `/:locale` muss zuletzt registriert bleiben. |
| `backend/scripts/seo-texte-anhaengen.mjs` | Einspielskript mit Validierung. |
| `backend/scripts/seo-kandidaten.json` | Kandidatenliste für das Handverfahren, 828 Einträge. |
| `backend/scripts/seo-pakete.mjs` | Schneidet offene Titel in Arbeitspakete (Fächer-Verfahren). |
| `backend/scripts/seo-einspielen.mjs` | Sammelt die Texte ein, prüft sie, schreibt nach `seo_content`. |
| `backend/scripts/seo-batch.mjs` | Dasselbe über die API. Enthält die Prüffunktionen, die beide Wege nutzen. |
| `backend/test/seoFaktenpruefung.test.js` | Sichert die Faktenprüfung ab, in beide Richtungen. |
| `backend/test/seoIndexierung.test.js` | Sichert die Indexierungsregel und die 250-Wörter-Schwelle ab. |

Container: `movietaste-backend-1`, `movietaste-caddy-1`, `movietaste-postgres-1`.
