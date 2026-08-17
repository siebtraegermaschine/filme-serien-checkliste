# Übergabe: SEO-Texte movietaste.de

Stand: 17.08.2026 · 1453 Titeltexte · letzter Commit `34c8391`

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

Alle SEO-Seiten stehen aktuell auf `noindex`, bis Christian sie freigibt.
Schalter: `SEO_FREIGEGEBEN = false` in `backend/lib/seoRender.js`.
Ebenso die auskommentierte `Sitemap:`-Zeile in `robots.txt`.
**Beides nicht ohne ausdrückliche Anweisung ändern.**

## 2. Pflichtformat für `bereich='titel'`

Exakt diese vier Überschriften, in dieser Reihenfolge, keine weiteren:

```
### Worum es geht
### Entstehungsgeschichte
### Hinter den Kulissen
### Einordnung & Wirkung
```

Mindestens 250 Wörter (wird vom Einspielskript erzwungen), Zielwert 300+.
Aktueller Schnitt: 326 Wörter.

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

8. **Tests** (`cd backend && npm test`): 26 Tests, 15 grün, 11 rot.
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
    Erwartung: Sitemap-Zahl = Titelzahl, HTTP 200, `noindex,follow`.

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
| `backend/scripts/seo-kandidaten.json` | Kandidatenliste, 528 Einträge, 152 davon offen. |

Container: `movietaste-backend-1`, `movietaste-caddy-1`, `movietaste-postgres-1`.
