# Übergabe: MovieTaste (movietaste.de)

Stand: 2026-08-02. Diese Datei fasst zusammen, was in der letzten Sitzung entstanden
ist, was offen ist und welche Fallstricke es gibt. Für Architektur/Deployment siehe
zusätzlich `DEPLOYMENT.md` und `konzept-relaunch.md`.

---

## 1. SOFORT PRÜFEN: Streaming-Daten wiederherstellen

**Die Tabelle `streaming_cache` ist derzeit leer (0 statt ~20.000 Zeilen).**
Dadurch fehlen aktuell: Anbieter-Schildchen an den Titeln, der „Nur Streaming"-Filter
und die Streaming-Kandidaten in Discovery.

Ursache war ein Altfehler in `backend/routes/streaming.js`, der am 2026-08-02 zuschlug:
`now()` bleibt in Postgres für die gesamte Transaktion auf deren Startzeitpunkt
eingefroren. Die eingefügten Zeilen bekamen dadurch ein `fetched_at` VOR dem in
JavaScript gebildeten `runStartedAt`, und der `DELETE`-Cleanup am Ende löschte alles
gerade Übertragene wieder. Der Job meldete trotzdem Erfolg. Ob es kippte, hing daran,
ob beide Zeitstempel in dieselbe Millisekunde fielen — ein Münzwurf pro Lauf.

**Behoben** (Commit `9b5468f`, überall `clock_timestamp()`). Dieselbe Falle war in
`cinema.js` längst behoben, in `streaming.js` stehengeblieben.

**Zu tun:** Den Job „Streaming-Daten aktualisieren" im GitHub-Actions-Tab manuell
starten („Run workflow"). Läuft ~60–90 Minuten. Danach prüfen:

```sql
SELECT count(*) FROM streaming_cache;   -- erwartet: ~20.000
```

---

## 2. Zugang und Deployment

- Server: `ssh root@movietaste.de` (Key `~/.ssh/id_ed25519`), Projekt unter `/opt/movietaste`
- **Jeder Push auf `main` deployt automatisch** (GitHub Action `deploy.yml` → `/opt/movietaste/deploy.sh`)
- Docker-Befehle auf dem Server **immer mit `-f docker-compose.yml`** — ohne das lädt
  `docker-compose.override.yml` mit und öffnet Postgres/Backend öffentlich (ist einmal passiert)
- Datenbank: `docker compose -f docker-compose.yml exec -T postgres psql -U postgres -d filme_serien`

**Warteschleifen auf den Deploy:** Direkt nach dem Push existiert der neue Workflow-Lauf
noch nicht — eine Abfrage der jeweils neuesten Ausführung meldet dann fälschlich den
vorherigen als „erfolgreich". Besser gegen den konkreten Commit-Hash prüfen oder einfach
`ssh … 'cd /opt/movietaste && git log -1'`.

---

## 3. Was in dieser Sitzung entstanden ist

**Ansehen / Leihen / Kaufen / Trailer** in der Detailansicht. Daten von TMDB (Quelle
JustWatch), Zwischenspeicher `watch_providers_cache` (24 h). Reihenfolge: Trailer links,
dann Kaufen/Leihen/Ansehen rechts. Auf der Kino-Seite nur der Trailer (die Filme laufen
ja erst an).

- TMDB liefert **keine Deep-Links pro Anbieter** — verlinkt wird deren Suche nach dem Titel
- Funktionierend geprüft (im echten Browser, nicht nur per HTTP-Status): Amazon, Google Play,
  Rakuten TV, YouTube, Netflix
- **Nicht verlinkbar** und deshalb nur als Info dargestellt: Disney+ (404), Apple TV/Store
  (ignoriert den Suchbegriff beim Direktaufruf), MagentaTV, maxdome, WOW, Paramount+, HBO Max

**Trailer** über TMDB `/videos`, Zwei-Klick-Lösung: erst Vorschau mit Hinweis, dann
`youtube-nocookie.com`. Als Vorschaubild dient das TMDB-Poster, **nicht** das
YouTube-Thumbnail — letzteres wäre schon eine Verbindung zu Google. Kennt TMDB keinen
Trailer, öffnet der Button eine YouTube-Suche.

**Streaminganbieter-Auswahl** (Einstellungen). `users.watch_provider_ids`:
NULL = nie konfiguriert → 8 Standardanbieter, leeres Array = keine Filterung.

**„Zusammen schauen"** — Icon-Button oben links, Profile per Einladungslink verknüpfen.
Tabellen `user_links` (beidseitig), `user_link_invites` (nur Token-Hash, 7 Tage, einmalig).
Filme/Serien: Schnittmenge der Listen; Kino und Discovery: gemeinsamer Taste-Score.

**FSK-Filter** (bis 6 / bis 12 / bis 16 / ab 18) im selben Popup. Titel **ohne** hinterlegte
Freigabe werden bei aktivem Filter ausgeblendet.

**Ladegröße von 40,3 MB auf ~15 MB reduziert:** Inhaltsangaben werden nachgeladen
(`POST /api/titles/plots`), Base64-Poster durch TMDB-Pfade ersetzt (595 von 600).

**Gewichtete Bewertung** für Sortierung und Taste-Score:
`(v/(v+1000)) × Note + (1000/(v+1000)) × 6,76`. Angezeigt wird die echte Note samt
Stimmenzahl. Kein Titel wird ausgeblendet — wenig bewertete rutschen nur nach unten.

**Sonstiges:** „IMDb" heißt überall „TMDB" (die Bewertung kam schon immer von dort),
Rückfrage vor dem Entfernen aus Filme/Serien, Datenschutzerklärung um verknüpfte Profile
und anonyme Bewertungsstatistiken erweitert.

---

## 4. Offene Punkte

**Verknüpfung zweier Konten ist ungetestet.** Alle Einzelteile sind geprüft (Einladung
erzeugen, Token-Validierung, Ablehnungsfälle, Popup, Filterlogik), aber der Weg
„einladen → annehmen → gegenseitig sichtbar" wurde nie real durchlaufen — dafür braucht
es zwei Konten, und es existiert nur noch eines (`c.neubauer@digital-wings.com`, Name
„Christian"). Die beiden Testkonten wurden auf Wunsch gelöscht.

**FSK-Abdeckung ist unvollständig.** Nur ~68 % der Titel haben überhaupt eine deutsche
Freigabe. Aktueller Stand: Discovery 17.641 von 26.190, Katalog 579 von 600, Kino 180 von
545, Streaming 0 (siehe Punkt 1). Der Katalog ist auf hochbewertete Titel kuratiert und
damit überwiegend für Erwachsene — „bis 6" trifft geschätzt ~10 %.

**Anonyme Statistiken: Mindestzahl nicht durchgesetzt.** Die Datenschutzerklärung sagt zu,
dass Titel erst ab einer Mindestzahl an Bewertungen in Auswertungen einfließen. Im Code
gibt es das noch nicht — vor dem ersten Export nachrüsten, sonst steht dort etwas anderes
als das Programm tut.

**Poster-Sicherung kann weg**, wenn nichts auffällt: `titles_poster_base64_backup` (595
Bilder, 4,1 MB). Rückholung steht im Kopf von `backend/scripts/backfill-catalog-posters.mjs`.

**Ungenutzte Spalten:** `users.data_consent_at` / `data_consent_revoked_at` — die
Einwilligung wurde bewusst wieder entfernt (für anonyme Aggregate braucht es keine).
Als vorgehalten dokumentiert.

**Rechtlich zu prüfen** (vor Go-Live): die Formulierungen in `datenschutz.html`, besonders
Abschnitt 8, sowie die TODO-Platzhalter in `impressum.html` und `datenschutz.html`.

---

## 5. Fallstricke, die mich Zeit gekostet haben

**CSS-Spezifität.** Dreimal dieselbe Falle: `.modal-overlay .modal { max-width:360px }`
schlägt `.similar-modal { max-width:700px }`, weil zwei Selektoren einen schlagen.
Ebenso verlieren Regeln, die VOR der Grundregel stehen. Bei jeder Stiländerung prüfen,
ob sie tatsächlich greift (`getComputedStyle`), nicht nur ob sie im Stylesheet steht.

**Trennlinien im Menü** kommen teils aus `border-top` einzelner Einträge, nicht aus
`<hr>`-Elementen — eine reine Strukturprüfung übersieht sie.

**`esc()` escapt keine Anführungszeichen**, nur `& < >`. Für Attributwerte immer
`escAttr()` verwenden, sonst zerreißt ein Titel mit `"` das HTML.

**Die Meta-Zeile wird per Textsuche ausgewertet** (`metaRating`, `metaYear`, `metaGenre`).
Beim Ergänzen von Feldern aufpassen: Die Stimmenzahl steht bewusst IM ersten Segment,
`metaRating` ist inzwischen am Stern-Symbol verankert.

**`showDetails` kann aus dem localStorage `true` sein** — dann rendern alle Zeilen
aufgeklappt. Deshalb laden Anbieter und Trailer erst beim Klick, nicht beim Aufklappen.

**Zeilen-Klickhandler klappen die Details zu.** Neue Buttons in der Zeile brauchen einen
Listener in der **Capture-Phase** mit `stopPropagation()`, sonst schließt sich die Zeile.

**Die 600 Katalog-Titel fasst kein täglicher Job an.** Neue Felder bleiben dort leer, bis
sie gezielt nachgetragen werden (`backend/scripts/backfill-catalog-meta.mjs`).

**Alternativtitel bringen nichts.** Geprüft: Nur 18 % der Titel haben abweichende deutsche
Alternativtitel bei TMDB, und die sind meist Untertitel-Varianten, die die Suche ohnehin
findet. Der Auslöser („Elize Matsunaga" heißt bei Netflix „Schatten einer Frau") wäre nicht
gelöst worden — TMDB kennt dort gar keine Alternativtitel. Nicht bauen.

---

## 6. Ideen, die besprochen, aber nicht umgesetzt wurden

- **TMDB-Livesuche**, wenn die App im eigenen Bestand nichts findet — der wirksamere Hebel
  gegen abweichende Anbieter-Titel
- **Eigener Bewertungsdurchschnitt** neben der TMDB-Bewertung, ab ~5 Bewertungen pro Titel
- **Discovery**: Titel markieren, die bei einer verknüpften Person auf der Watchlist stehen
  („Max will das auch sehen") — die tauchen heute nirgends auf
- **Weitere Streaminganbieter** in `stream-fetch.mjs`: Ladegröße ist inzwischen kein
  Gegenargument mehr, die Laufzeit des Jobs (~60–90 Min.) bleibt aber der begrenzende Faktor
