# Plan: MovieMatch auf drei Wegen — Web, iOS, Android

Stand: 2026-08-03. Diese Datei ist die Umsetzungsvorlage für den Weg von der
heutigen Web-App zu zusätzlichen nativen Apps für iOS und Android, **ohne die
Web-App zu schwächen und ohne eine zweite Codebasis**.

Ergänzt `UEBERGABE-CHAT.md` (aktueller Stand, offene Punkte), `DEPLOYMENT.md`
(Server, Container, Auslieferung) und `konzept-relaunch.md`.

Der Plan ist nicht als Fließtext zum Einmal-Lesen gedacht, sondern als
Nachschlagewerk: Abschnitt 3 vor dem Start lesen, danach Phase für Phase aus
Abschnitt 5 abarbeiten. Abschnitt 11 ist die Abhak-Liste vor der Einreichung.

---

## 1. Zielbild

Ein Backend, eine Oberfläche, drei Auslieferungswege:

```
                    ┌───────────────────────────────┐
                    │  Express-Backend (Hetzner)    │
                    │  Postgres · REST unter /api   │
                    │  Vorschau-Angaben unter /t/…  │
                    └───────────────┬───────────────┘
                                    │  dieselbe REST-Schnittstelle
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
    ┌─────────┴────────┐  ┌─────────┴────────┐  ┌────────┴─────────┐
    │  Browser         │  │  iOS-App         │  │  Android-App     │
    │  movietaste.de   │  │  Capacitor-Hülle │  │  Capacitor-Hülle │
    │  Cookie-Sitzung  │  │  Token + Keychain│  │  Token + Keystore│
    └──────────────────┘  └──────────────────┘  └──────────────────┘
              └──────────── dieselbe Oberfläche aus web/src ────────┘
```

Die Oberfläche wird **einmal** gebaut und in alle drei Ziele ausgeliefert.
Plattformunterschiede (Teilen, Push, Speicher, Anmeldung) liegen hinter einer
schmalen Schicht `web/src/platform/`, die je Ziel eine andere Umsetzung lädt.
Das ist die einzige Stelle im Frontend, an der „Web oder nativ" überhaupt
vorkommt.

---

## 2. Getroffene Entscheidungen

Diese Punkte sind entschieden und werden im Plan nicht mehr aufgerollt.

| Frage | Entscheidung | Begründung |
|---|---|---|
| Native Technik | **Capacitor** | Die bestehende Oberfläche läuft unverändert weiter. Eine Codebasis, Web bleibt erstklassig. Ein Neubau in React Native oder Flutter würde die Web-Seite schwächen — und die trägt über geteilte Links das Wachstum. |
| Oberfläche in der App | **mitgeliefert**, nicht vom Server geladen | Robust und offlinefähig. Eine App, die nur movietaste.de lädt, ist für Apple „nur eine Webseite" (Richtlinie 4.2) und wird abgelehnt. |
| Frontend-Struktur | **Module + Vite** | Ohne Modulgrenzen gibt es keine plattformabhängigen Teile und keine echten Tests. Kein Framework-Wechsel — derselbe Vanilla-Code, nur aufgeteilt. |
| Anmeldung in der App | **Token**, Cookie bleibt fürs Web | Zwingend, siehe Abschnitt 3.1. Kein Nice-to-have. |
| Apple-Konto | **Organisation (digital-wings)** | Firmenname im Store, passt zu Impressum und Rechtstexten. D-U-N-S-Nummer nötig — deshalb zuerst beantragen. |
| Reihenfolge | **iOS zuerst**, Android danach | Apples Prüfung ist die eigentliche Hürde. Android ist danach eine Sache von Tagen. |
| Push-Zustellung | **Firebase Cloud Messaging für beide** | FCM leitet auf iOS an APNs weiter. Ein Dienst, ein Server-Schlüssel, ein Code-Pfad. |
| Token-Format | **undurchsichtiger Zufallswert**, kein JWT | Muss serverseitig widerrufbar sein (Abmelden auf einem Gerät, Kontolöschung). Ein JWT ist das nicht. |
| Aktualisierung ohne Store | **Capgo** (`@capgo/capacitor-updater`), selbst gehostet | Ionics „Live Updates" kostet vierstellig im Jahr. Capgo lässt sich gegen den eigenen Server betreiben, der ohnehin läuft. |

**Bewusst nicht entschieden:** iPad-Unterstützung (siehe Abschnitt 9).

---

## 3. Kritische Punkte — vor dem ersten Store-Build klären

Die folgenden fünf Punkte sind keine Aufgaben unter vielen. Wer sie überspringt,
steht später vor einer App, die aussieht wie sie soll, aber nicht funktioniert
oder nicht angenommen wird.

### 3.1 Die Anmeldung funktioniert in der App nicht — Cookie-Problem

**Befund.** `backend/server.js:58` setzt das Sitzungs-Cookie mit
`sameSite: 'lax'`. In der Capacitor-Hülle läuft die Oberfläche unter
`capacitor://localhost` (iOS) beziehungsweise `https://localhost` (Android), die
Schnittstelle liegt auf `https://movietaste.de`. Aus Sicht des WebViews ist das
**cross-site** — das Cookie wird nicht mitgeschickt. Jede Anfrage an
`/api/…` kommt als „nicht angemeldet" zurück.

**Warum `sameSite: 'none'` nicht die Antwort ist.** Es würde den Fall formal
lösen, aber WKWebView auf iOS beschneidet Drittanbieter-Cookies. Das Verhalten
hat sich über iOS-Versionen mehrfach geändert und kann sich wieder ändern. Eine
Anmeldung, die von Apples Cookie-Politik abhängt, ist keine tragfähige Grundlage.

**Lösung: Token-Authentifizierung parallel zur Cookie-Sitzung.** Details in
Phase 1. Das Web behält seine Cookie-Sitzung unverändert — beides nebeneinander
im selben Backend ist unkritisch, `requireAuth` prüft künftig beides.

**Muss vor der Capacitor-Hülle stehen.** Sonst sucht man den Fehler in der
falschen Schicht.

### 3.2 Apple lehnt reine Webseiten-Verpackungen ab (Richtlinie 4.2)

Eine Hülle um `index.html` ohne native Fähigkeiten wird abgelehnt. Das ist kein
Restrisiko, das ist der Regelfall. Die App braucht Funktionen, die im Browser
nicht möglich sind — und zwar sichtbar, nicht im Verborgenen:

- **Push-Nachrichten** bei gemeinsamen Titeln (Phase 6)
- **Universal Links** — geteilte Links öffnen die App statt Safari (Phase 4)
- **Natives Teilen** mit echtem Vorschaubild (Phase 5)
- **Offline-Zugriff** auf Watchlist und Gesehen-Liste (Phase 7)
- **Haptik** beim Wischen, native Statusleiste, echte Sicherheitsabstände

Das ist der Grund, warum die Phasen 4 bis 7 **vor** der Einreichung liegen und
nicht danach. Sie sind nicht Kür, sie sind die Eintrittskarte.

### 3.3 D-U-N-S-Nummer braucht Vorlauf

Für ein Apple-Entwicklerkonto als Organisation ist eine D-U-N-S-Nummer nötig.
Beantragung bei Dun & Bradstreet ist kostenlos, dauert aber typischerweise ein
bis zwei Wochen, gelegentlich länger. Danach folgt Apples eigene Prüfung.

**Das ist der einzige Punkt im ganzen Plan, der nicht durch Arbeit zu
beschleunigen ist.** Deshalb Phase 0, Tag 1, parallel zu allem anderen.

### 3.4 Die Zusage zur Mindestzahl ist eingelöst — die Rechtstexte noch nicht

> **Erledigt am 10. August 2026.** Die Mindestzahl steckt jetzt in
> `backend/lib/bewertungsstatistik.js` (`MINDESTZAHL_BEWERTUNGEN = 20`), der
> einzigen Stelle, an der eine solche Auswertung entsteht. Für das Formular der
> Datenschutz-Hinweise („Privacy Nutrition Labels") ist die Angabe damit
> belegbar. Einzelheiten in `UEBERGABE-OFFEN.md`, Abschnitt 0.4.

Offen bleibt der rechtliche Teil: Abschnitt 6 von `datenschutz.html` (Anbieter
des Mailversands, Übermittlung in die USA, die bisher nicht erwähnten
Feedback-Mails — fertiger Entwurf in `ENTWURF-DATENSCHUTZ-MAIL.md`) und die
Prüfung von `impressum.html` samt Abschnitt 9. **Vor Phase 8 erledigen**, nicht
danach.

### 3.5 Der Katalog ist groß — auf dem Gerät messen, nicht schätzen

Der Caddyfile-Kommentar nennt rund 27 MB unkomprimierte Kataloglisten, der
Bestand liegt bei 26.825 Titeln. Im Browser auf dem Rechner fällt das nicht auf.
In einem WebView auf einem älteren Android-Gerät mit knappem Speicher kann
`buildPool()` (`index.html:1662`) durchaus an eine Grenze stoßen.

**Diese Messung gehört an den Anfang von Phase 3**, bevor Arbeit in Feinschliff
fließt. Wenn sie ausschlägt, ändert sich der Plan an einer Stelle: Der Katalog
wird seitenweise nachgeladen statt am Stück. Das ist machbar, aber es ist
Arbeit, die man früh kennen will.

---

## 4. Zielstruktur des Projekts

So sieht das Repository nach Phase 3 aus. Die neuen Ordner sind markiert.

```
filme-serien-checkliste/
├─ web/                        ← neu: alles zur Oberfläche
│  ├─ index.html                  nur noch Gerüst + Vorschau-Marken
│  ├─ vite.config.js
│  ├─ package.json
│  └─ src/
│     ├─ main.js                  Einstiegspunkt
│     ├─ api/                     client.js, auth.js, progress.js, titles.js,
│     │                           cinema.js, links.js, share.js
│     ├─ state/                   pool.js, progress.js, filter.js, sortierung.js
│     ├─ ui/                      liste.js, titelkarte.js, kopfbereich.js,
│     │                           suche.js, kino.js, discovery.js,
│     │                           modals/ (teilen, trailer, anbieter, konto)
│     ├─ platform/             ← die einzige Stelle mit „Web oder nativ"
│     │     index.js              wählt zur Bauzeit web.js oder native.js
│     │     web.js                navigator.share, Cookie, localStorage
│     │     native.js             Capacitor-Plugins, Token, Keychain
│     └─ styles/                  aufgeteiltes CSS
├─ ios/                        ← neu: von Capacitor erzeugt
├─ android/                    ← neu: von Capacitor erzeugt
├─ capacitor.config.ts         ← neu
├─ tests/                      ← neu: Vitest, siehe Abschnitt 8
├─ backend/                       unverändert in der Struktur
│  ├─ routes/                     + tokens.js, push.js
│  ├─ lib/                        + tokenAuth.js, pushVersand.js
│  └─ middleware/requireAuth.js   erweitert um Bearer-Prüfung
├─ impressum.html · datenschutz.html · reset-password.html
└─ *.mjs                          Datenjobs, unverändert
```

`index.html` im Wurzelverzeichnis verschwindet nicht ersatzlos, sondern wandert
nach `web/index.html` und wird dabei aufgeteilt. Der gebaute Stand landet in
`web/dist/` und wird sowohl vom Server ausgeliefert als auch in die App gepackt.

---

## 5. Phasen

Die Reihenfolge ist bindend, wo eine Phase auf der vorigen aufbaut. Wo sie
parallel laufen kann, steht es dabei.

### Phase 0 — Konten und Vorlauf

*Kann und soll parallel zu allem anderen laufen. Start: Tag 1.*

1. **D-U-N-S-Nummer** für digital-wings beantragen (siehe 3.3).
2. **Apple Developer Program** als Organisation, 99 $/Jahr — sobald die D-U-N-S
   vorliegt.
3. **Google Play Console**, 25 $ einmalig. Läuft schneller durch, kann später
   folgen; seit 2023 verlangt Google für neue Entwicklerkonten eine
   Identitätsprüfung, also nicht erst am Vortag anlegen.
4. **Firebase-Projekt** für Push anlegen (kostenlos im benötigten Umfang).
5. **App-Kennungen festlegen** — einmal wählen, danach unveränderlich:
   - iOS Bundle-ID: `de.movietaste.app`
   - Android Package: `de.movietaste.app`
   - App-Name im Store: `MovieMatch`

### Phase 1 — Token-Authentifizierung im Backend

*Voraussetzung für Phase 3. Kein Frontend nötig, komplett testbar mit `curl`.*

**Neue Tabelle:**

```sql
CREATE TABLE auth_tokens (
  id            bigserial PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,   -- SHA-256, nie der Klartext
  plattform     text,                   -- 'ios' | 'android'
  geraet        text,                   -- z. B. "iPhone 15" für die Anzeige
  erstellt_am   timestamptz NOT NULL DEFAULT now(),
  zuletzt_am    timestamptz NOT NULL DEFAULT now(),
  laeuft_ab_am  timestamptz NOT NULL
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens(user_id);
```

**Warum SHA-256 und nicht bcrypt:** Der Token wird bei *jeder* Anfrage geprüft.
bcrypt mit 12 Runden dauert absichtlich rund 100 ms — das wäre bei jedem
Listenaufruf spürbar. Der Token ist ein Zufallswert mit 256 Bit Entropie, kein
vom Menschen gewähltes Passwort; gegen Wörterbuchangriffe muss er nicht gehärtet
werden. Für Passwörter bleibt bcrypt (`backend/routes/auth.js`).

**Schritte:**

1. `backend/lib/tokenAuth.js`: `erzeugeToken(userId, plattform, geraet)`,
   `pruefeToken(klartext)`, `widerrufeToken(id)`, `widerrufeAlle(userId)`.
   Gültigkeit 90 Tage, gleitend — bei jeder Nutzung `zuletzt_am` setzen und die
   Frist verlängern. So bleibt ein aktiver Nutzer angemeldet, ein vergessenes
   Gerät fällt von selbst heraus.
2. `POST /api/auth/login` und `/register` erweitern: Kommt der Kopf
   `X-Client: native` mit, wird zusätzlich ein Token zurückgegeben. Ohne den
   Kopf ändert sich am Verhalten **nichts** — das Web bleibt unberührt.
3. `backend/middleware/requireAuth.js`: zuerst `Authorization: Bearer …`
   prüfen, sonst wie bisher `req.session.userId`. Beide setzen `req.userId`.
   **Danach jede Route darauf umstellen, `req.userId` statt
   `req.session.userId` zu lesen.** Das betrifft alle Dateien in
   `backend/routes/` — hier entsteht der eigentliche Aufwand der Phase.
4. `POST /api/auth/logout`: bei Bearer-Anfragen den Token löschen statt der
   Sitzung.
5. **Kontolöschung erweitern.** Der Ablauf beendet heute alle Sitzungen. Er muss
   künftig ebenso `auth_tokens` und (ab Phase 6) `push_tokens` löschen — in
   derselben Transaktion. Fehlt das, bleibt ein gelöschtes Konto auf dem Handy
   angemeldet. Zu ändern in `backend/lib/kontoAufraeumen.js` und im
   Antragsweg in `backend/routes/auth.js`.
6. **CORS erweitern.** `server.js:32` erlaubt heute genau einen Ursprung.
   Künftig eine Liste: die Web-Domain plus `capacitor://localhost` und
   `https://localhost`. Für Bearer-Anfragen ist `credentials` nicht nötig, für
   das Web bleibt es.
7. **Geräteliste in den Einstellungen** („Angemeldete Geräte", einzeln
   abmeldbar). Kein Beiwerk: Sie ist der einzige Weg, ein verlorenes Handy
   auszusperren, und gehört zu den Zusagen der Datenschutzerklärung.

**Fertig, wenn:** `curl` mit Bearer-Token dieselben Antworten liefert wie ein
Browser mit Cookie, und ein gelöschtes Konto einen zuvor gültigen Token
zurückweist.

### Phase 2 — Frontend modularisieren, Vite einführen

*Voraussetzung für Phase 3. Der größte Brocken.*

Ausgangslage: `index.html` mit 5.032 Zeilen — CSS in den Zeilen 42–759, ein
einziger Skriptblock in 1163–5030 mit rund 190 Funktionen.

**Vorgehen — in dieser Reihenfolge, jeder Schritt einzeln überprüfbar:**

1. `web/` anlegen, Vite einrichten, `index.html` unverändert hineinlegen, bauen.
   Der Bau muss ein `dist/` erzeugen, das sich exakt wie heute verhält. **Erst
   wenn das steht, wird aufgeteilt.**
2. CSS herauslösen nach `src/styles/`, thematisch (Grundlagen, Kopfbereich,
   Liste, Karte, Modals, Kino). Achtung auf die Spezifitätsfallen aus
   `UEBERGABE-CHAT.md`, Abschnitt 5 — beim Aufteilen ändert sich die
   Reihenfolge der Regeln, und genau daran hängt `header .sub` gegen `.sub-zweit`.
   **Nach dem Aufteilen mit `getComputedStyle` nachmessen.**
3. JavaScript in Module schneiden, von den Blättern her: erst `api/`, dann
   `state/`, zuletzt `ui/`. Reine Hilfsfunktionen (`esc`, `fmtR`, `sterneText`,
   `normTitle`) zuerst — sie haben keine Abhängigkeiten und geben sofort
   Testfläche.
4. `platform/` einziehen. Alles, was heute direkt `navigator.share`,
   `localStorage` oder `fetch` mit Cookie-Anmeldung aufruft, geht künftig durch
   diese Schicht. **Das ist der Schritt, der Phase 3 überhaupt erst billig
   macht** — hier später nachzubessern ist deutlich teurer.
5. Auslieferung umstellen:
   - `backend/Dockerfile` wird mehrstufig: Stufe 1 baut `web/` mit Node, Stufe 2
     kopiert nur `web/dist/` in das Laufzeit-Image. Der Bau muss **im Container**
     passieren, weil `deploy.sh` auf dem Server lediglich `git reset` und
     `docker compose build` ausführt — ein lokal gebautes `dist/` käme dort nie
     an.
   - `server.js`: `express.static` zeigt auf `web/dist` statt auf das
     Wurzelverzeichnis.

**Ein Fallstrick beim Umbau:** Die Vorschau-Angaben unter `/t/…` werden heute
über die Textmarken `<!-- og:start` und `<!-- og:end -->` ersetzt
(`server.js`, `OG_START`/`OG_ENDE`). Vite kann HTML-Kommentare beim Bauen
entfernen. **Beim Umbau darauf umstellen, den Block vor `</head>` einzufügen,
statt zwischen zwei Kommentaren zu ersetzen.** Das ist unabhängig von der
Bau-Kette stabil. Danach mit einem Titel prüfen, der noch nie geteilt wurde —
iOS und WhatsApp merken sich Vorschauen lange.

**Fertig, wenn:** Die gebaute Seite im Browser nicht von der heutigen zu
unterscheiden ist, geteilte Links weiterhin die richtige Vorschau zeigen, und
`tests/` die ersten echten Modultests enthält (Abschnitt 8).

### Phase 3 — Capacitor-Hülle

1. **Zuerst messen** (siehe 3.5): Katalog auf einem echten Android-Mittelklasse-
   Gerät und einem älteren iPhone laden, Speicher und Zeit bis zur ersten
   Darstellung protokollieren. Ergebnis notieren — davon hängt ab, ob der
   Katalog seitenweise nachgeladen werden muss.
2. Capacitor einrichten, `capacitor.config.ts` anlegen, `ios/` und `android/`
   erzeugen. `webDir` zeigt auf `web/dist`.
3. `platform/native.js` ausfüllen: sicherer Speicher für den Token (Keychain auf
   iOS, Keystore auf Android — nicht `localStorage`, das ist im WebView weder
   verschlüsselt noch zuverlässig dauerhaft), `X-Client: native` an allen
   Anfragen, Basis-Adresse `https://movietaste.de`.
4. Native Grundausstattung: Statusleiste, Startbildschirm, Sicherheitsabstände
   (Notch, Home-Balken), Zurück-Taste auf Android, Tastaturverhalten, Haptik
   beim Wischen.
5. Auf echten Geräten durchspielen — nicht nur im Simulator. Anmelden,
   Watchlist, Wischgesten, Kino-Tab, Teilen-Fenster, Abmelden, erneut anmelden.

**Fertig, wenn:** Die App auf beiden Plattformen startet, man sich anmelden kann
und die Anmeldung einen Neustart überlebt.

### Phase 4 — Universal Links (iOS) und App Links (Android)

*Löst den größten Bruch: Ein geteilter Link öffnet heute Safari statt der App —
und dort ist man womöglich abgemeldet.*

1. **`apple-app-site-association`** unter `/.well-known/` ausliefern, ohne
   Dateiendung, mit `Content-Type: application/json`, ohne Weiterleitung.
   Analog **`assetlinks.json`** für Android mit dem Fingerabdruck des
   Signaturschlüssels.
   **Achtung:** `express.static` behandelt Pfade mit führendem Punkt
   standardmäßig zurückhaltend — `.well-known` kann dadurch ins Leere laufen.
   Deshalb zwei ausdrückliche Routen in `server.js` statt sich auf die
   statische Auslieferung zu verlassen. Nach dem Deploy mit `curl -i` prüfen,
   dass beide Dateien mit dem richtigen Typ und Status 200 kommen.
2. In der App auf `appUrlOpen` hören und den Pfad auswerten.
   **Wichtig:** Die App liest heute beim Start `location.pathname`, um einen
   geteilten Titel zu öffnen. In der Hülle ist das immer `/index.html` — die
   Auswertung muss künftig aus dem Deep-Link-Ereignis kommen, nicht aus der
   Adresszeile. Beide Wege bleiben nebeneinander bestehen: der Pfad fürs Web,
   das Ereignis für die App.
3. Zusammenspiel mit `/t/…` prüfen: Vorschau-Roboter haben keine App und
   bekommen weiterhin das gerenderte HTML. Nur echte Geräte mit installierter
   App springen in die App. Beides muss stimmen.
4. Prüfen mit einem Link, der noch nie geteilt wurde — mit App installiert, ohne
   App installiert, und aus verschiedenen Apps heraus (WhatsApp, Mail, Notizen).

### Phase 5 — Natives Teilen

Das Teilen-Fenster bleibt wie es ist, nur der Versand wird nativ:

- **Als Nachricht:** natives Teilen-Blatt mit Text und Link.
- **Als Bild:** Das Story-Bild wird weiterhin im Browser auf einer Canvas gebaut
  (TMDB erlaubt den Export, siehe `UEBERGABE-CHAT.md`, Abschnitt 5), dann aber
  in eine Datei geschrieben und als Datei geteilt. **Damit verschwindet die
  leere Kachel** — iOS erzeugt für Web-Dateien keine Miniatur, für echte Dateien
  schon.
- Damit erledigt sich auch die Notlösung aus Abschnitt 4 der Übergabe: In der
  App kann der Link in ein eigenes Feld, statt in der Bildunterschrift zu
  stehen. Im Web bleibt Variante C.

### Phase 6 — Push-Nachrichten

*Die wirksamste Funktion überhaupt und zugleich der stärkste Beleg gegenüber
Apple, dass die App mehr ist als eine Webseite.*

**Neue Tabelle:**

```sql
CREATE TABLE push_tokens (
  id           bigserial PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token    text NOT NULL UNIQUE,
  plattform    text NOT NULL,
  erstellt_am  timestamptz NOT NULL DEFAULT now(),
  zuletzt_am   timestamptz NOT NULL DEFAULT now()
);
```

**Schritte:**

1. `POST /api/push/register` und `/unregister`.
2. `backend/lib/pushVersand.js` mit `firebase-admin`. Abgemeldete Geräte
   (FCM antwortet mit `UNREGISTERED`) sofort aus der Tabelle entfernen, sonst
   wächst sie mit Karteileichen.
3. **Auslöser:** Setzt eine verknüpfte Person einen Titel auf die Watchlist, der
   bei mir ebenfalls auf der Watchlist steht → „Jenny will *Dune* auch sehen".
   Der Auslöser gehört in `backend/routes/progress.js`, direkt nach dem
   erfolgreichen Schreiben. **Zusammenfassen statt einzeln feuern:** Wer zehn
   Titel hintereinander hinzufügt, soll nicht zehn Nachrichten auslösen. Ein
   kurzer Sammelzeitraum von einigen Minuten je Personenpaar genügt.
4. **Einstellungen in der App:** an/aus je Art von Nachricht, Ruhezeiten.
   Voreinstellung: aus, bis der Nutzer zustimmt.
5. **Berechtigungen:** iOS fragt beim ersten Mal. Nicht direkt beim ersten Start
   fragen, sondern wenn die Funktion zum ersten Mal Sinn ergibt — also beim
   Verknüpfen einer Person. Android 13+ braucht zusätzlich die Laufzeit-
   Berechtigung `POST_NOTIFICATIONS`.
6. **Datenschutzerklärung ergänzen.** Push-Kennungen sind personenbezogene
   Daten. Sie brauchen einen eigenen Absatz in `datenschutz.html`, eine Angabe
   im App-Store-Formular, und sie müssen bei der Kontolöschung mitverschwinden
   (siehe Phase 1, Schritt 5).

### Phase 7 — Offline und Robustheit

1. Letzten Stand von Watchlist, Gesehen-Liste und Bewertungen lokal vorhalten,
   damit die App ohne Netz etwas Sinnvolles zeigt statt einer leeren Liste.
2. Poster der eigenen Listen lokal ablegen, mit Obergrenze.
3. Änderungen ohne Netz merken und beim nächsten Start nachreichen.
4. Netzstatus sichtbar machen — ein stiller Fehlschlag ist schlimmer als ein
   Hinweis.
5. Das bestehende Auffrischen beim Zurückkehren aus dem Hintergrund an die
   nativen Ereignisse hängen.

### Phase 8 — Einreichung iOS

1. **Offene Punkte aus `UEBERGABE-CHAT.md`, Abschnitt 1 abarbeiten** — allen
   voran die Mindestzahl (siehe 3.4), die drei TODOs in `datenschutz.html` und
   die rechtliche Prüfung von `impressum.html`.
2. App-Icon in 1024×1024, Bildschirmfotos für alle verlangten Größen,
   Beschreibung, Schlagwörter, Vorschauvideo (optional, wirkt aber).
3. **Datenschutz-Angaben („Privacy Nutrition Labels")** — müssen zur
   Datenschutzerklärung passen, sonst gibt es Rückfragen. Erhoben werden:
   E-Mail (Konto), Nutzungsdaten (Watchlist, Bewertungen), Kennungen (Push).
   Nichts davon dient plattformübergreifender Verfolgung — damit ist **keine**
   App-Tracking-Abfrage nötig.
4. **Altersfreigabe.** Die App zeigt Inhaltsangaben und Poster auch zu Titeln ab
   18. Realistisch 12+ oder 16+. Der vorhandene FSK-Filter hilft in der
   Begründung.
5. **Ausfuhrbestimmungen:** verwendet nur HTTPS, damit von der Vorlagepflicht
   befreit — die Angabe muss trotzdem gemacht werden.
6. **Kontolöschung** ist erledigt und muss im Formular benannt werden
   (Richtlinie 5.1.1(v)).
7. **Anmeldung mit Apple** ist derzeit **nicht** nötig, weil es keine Anmeldung
   über Google oder Facebook gibt. **Falls das später dazukommt, wird Apple-
   Anmeldung sofort Pflicht.** Vor jeder solchen Erweiterung hierher zurück.
8. Über TestFlight vorab an einige echte Geräte, dann einreichen.

**Auf eine Ablehnung einstellen.** Richtlinie 4.2 ist die wahrscheinlichste.
Die Antwort darauf ist keine Diskussion, sondern eine Aufzählung der nativen
Fähigkeiten aus 3.2 — deshalb sind sie vorher gebaut.

### Phase 9 — Android

Mit Capacitor größtenteils dieselbe Arbeit noch einmal, nur schneller:
Signaturschlüssel anlegen und **sicher verwahren** (geht er verloren, lässt sich
die App nie wieder aktualisieren), `assetlinks.json` mit dem Fingerabdruck,
Play-Console-Formulare, Datensicherheitsangaben, geschlossener Test vor
Veröffentlichung. Mindestversion Android 7 (API 24) — deckt praktisch den
gesamten aktiven Bestand ab.

### Phase 10 — Betrieb

1. **Capgo** einrichten, gegen den eigenen Server. Damit gehen Änderungen an
   Text, Stil und Oberfläche ohne Store-Freigabe durch. Was die App grundlegend
   verändert, gehört weiterhin in ein Store-Update — Apples Richtlinie 3.3.1
   erlaubt Nachladen, aber nicht die Verwandlung in eine andere App.
2. Versionsnummern in Web, iOS und Android gemeinsam führen.
3. Absturzmeldungen einsammeln.
4. Bauen und Hochladen automatisieren, sobald es zum zweiten Mal von Hand
   passiert ist.

---

## 6. Änderungen am Backend, gesammelt

| Datei | Änderung | Phase |
|---|---|---|
| `db/schema.sql` | `auth_tokens`, `push_tokens` | 1, 6 |
| `middleware/requireAuth.js` | Bearer vor Sitzung, setzt `req.userId` | 1 |
| `routes/*.js` | überall `req.userId` statt `req.session.userId` | 1 |
| `routes/auth.js` | Token bei `X-Client: native`, Abmelden räumt Token | 1 |
| `routes/tokens.js` | neu: Geräteliste, einzeln abmelden | 1 |
| `routes/push.js` | neu: An- und Abmelden von Push-Kennungen | 6 |
| `lib/tokenAuth.js` | neu | 1 |
| `lib/pushVersand.js` | neu | 6 |
| `lib/kontoAufraeumen.js` | löscht zusätzlich `auth_tokens`, `push_tokens` | 1, 6 |
| `routes/progress.js` | löst Push bei gemeinsamen Titeln aus | 6 |
| `server.js` | CORS-Liste, `.well-known`-Routen, `dist/`, Vorschau-Einfügung | 1, 2, 4 |
| `Dockerfile` | mehrstufig, baut `web/` | 2 |

---

## 7. Aufwand

Grobe Größenordnung in Arbeitstagen, einzeln und ohne Wartezeiten:

| Phase | Tage | Anmerkung |
|---|---|---|
| 0 Konten | 1 | dazu 1–2 Wochen Wartezeit auf D-U-N-S |
| 1 Token-Auth | 2–3 | die Umstellung aller Routen ist der Aufwand |
| 2 Modularisierung | 5–8 | größter Posten, 4.600 Zeilen |
| 3 Capacitor | 2–3 | plus die Messung aus 3.5 |
| 4 Universal Links | 2–3 | viel Prüfen auf echten Geräten |
| 5 Natives Teilen | 1–2 | |
| 6 Push | 4–6 | Backend, App, Einstellungen, Rechtstexte |
| 7 Offline | 2–3 | |
| 8 iOS-Einreichung | 3–5 | plus Prüfzyklen von je 1–3 Tagen |
| 9 Android | 2–4 | |
| 10 Betrieb | 1–2 | |
| **Summe** | **25–40** | |

Die Zahlen sind eine Größenordnung, keine Zusage. Der unsicherste Posten ist
Phase 2 — er hängt daran, wie stark die 190 Funktionen ineinandergreifen. Der
zweitunsicherste ist Phase 8, weil Apples Prüfung nicht planbar ist.

---

## 8. Tests

`UEBERGABE-CHAT.md`, Abschnitt 7 hält fest, dass fünf Testdateien den Code
**wörtlich aus `index.html` herauskopieren** mussten und mit der Sitzung
verloren gingen. Das ist kein Testproblem, sondern das Symptom der fehlenden
Modulgrenzen — und mit Phase 2 fällt die Ursache weg.

Ab dann `tests/` im Projekt, mit Vitest:

- **Modultests** für alles ohne DOM: `normTitle`, `kwSuchtexte`, `scoreItem`,
  `wordExactMatch`, Sortierungen, Filterlogik, die Erkennung von
  Wiederaufführungen.
- **Schnittstellentests** gegen eine Testdatenbank, vor allem für den
  Anmeldeweg mit beiden Verfahren und die Kontolöschung.
- **Ein einziger Ende-zu-Ende-Test** je Plattform für den wichtigsten Weg:
  Link öffnen → App springt an → Titel erscheint → auf die Watchlist.

Was zuerst geschrieben wird: die Prüfungen für die beiden Fallstricke aus
Abschnitt 5 der Übergabe — Kennungen kommen als String heraus (`bigint`), und
Stilregeln greifen nicht wegen Spezifität. Beide haben je zweimal zugeschlagen.

---

## 9. Bewusst nicht im Plan

- **iPad.** Zusätzliche Bildschirmfotos, eigenes Layout, eigene Prüfung. Erst
  entscheiden, wenn iOS steht.
- **Apple Watch, Widgets, Siri.** Nett, aber kein Beitrag zum Kern.
- **Anmeldung über Google oder Apple.** Zieht nach heutiger Lage sofort die
  Pflicht zur Apple-Anmeldung nach sich (siehe Phase 8, Punkt 7). Später
  möglich, aber eine eigene Entscheidung.
- **Bezahlfunktionen.** Sobald digitale Inhalte verkauft werden, greift Apples
  Abrechnung mit 15–30 %. Betrifft die geplante kommerzielle Verwertung nach
  Abschnitt 9 der Datenschutzerklärung nicht, solange nichts *in der App*
  verkauft wird.
- **Neubau der Oberfläche.** Siehe Abschnitt 2.

---

## 10. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Apple lehnt nach 4.2 ab | Verzögerung um Wochen | Phasen 4–7 **vor** der Einreichung, native Fähigkeiten in der Beschreibung benennen |
| D-U-N-S verzögert sich | blockiert alles Apple-seitige | Tag 1 beantragen, parallel weiterarbeiten |
| Katalog sprengt den Speicher | App unbrauchbar auf schwachen Geräten | früh messen (3.5), sonst seitenweise nachladen |
| Modularisierung bricht die Oberfläche | schwer zu findende Fehler | in kleinen Schritten, Stil mit `getComputedStyle` nachmessen |
| Android-WebView je Gerät verschieden | Darstellungsfehler bei einzelnen Nutzern | auf echten Geräten prüfen, nicht nur im Emulator |
| Signaturschlüssel Android verloren | App nie wieder aktualisierbar | Schlüssel gesichert ablegen, Play App Signing nutzen |
| Rechtstexte nicht geprüft | Ablehnung oder Abmahnung | vor Phase 8 erledigen (3.4) |

---

## 11. Abhak-Liste vor der Einreichung

**Recht und Daten**
- [x] Mindestzahl bei anonymen Auswertungen durchgesetzt (3.4) — 10.08.2026
- [ ] Drei TODO-Platzhalter in `datenschutz.html` ersetzt
- [ ] `impressum.html` rechtlich geprüft
- [ ] Abschnitt 9 der Datenschutzerklärung geprüft oder entfernt
- [ ] Push-Kennungen in der Datenschutzerklärung beschrieben
- [ ] Kontolöschung entfernt Sitzungen, Anmelde-Token und Push-Kennungen

**Technik**
- [ ] Token-Anmeldung auf beiden Plattformen, übersteht Neustart
- [ ] Geräteliste in den Einstellungen, einzeln abmeldbar
- [ ] Universal Links und App Links auf echten Geräten geprüft
- [ ] Geteilter Link mit noch nie geteiltem Titel geprüft, mit und ohne App
- [ ] Natives Teilen zeigt ein Vorschaubild
- [ ] Push kommt an, Einstellungen greifen, Zusammenfassung funktioniert
- [ ] Offline zeigt die eigenen Listen
- [ ] Speicherverbrauch auf einem schwachen Android-Gerät gemessen

**Store**
- [ ] Bildschirmfotos in allen verlangten Größen
- [ ] Datenschutz-Angaben passen zur Datenschutzerklärung
- [ ] Altersfreigabe begründet
- [ ] Ausfuhrbestimmungen beantwortet
- [ ] Kontolöschung im Formular benannt
- [ ] TestFlight-Durchlauf mit echten Geräten
