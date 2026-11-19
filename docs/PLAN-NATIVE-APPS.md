# Plan: native Apps (iOS zuerst, dann Android)

Stand: 04.11.2026. Ersetzt den Plan vom 03.08.2026 (`PLAN-NATIVE-APPS-ALT.md`,
dort stehen weiter die Detail-Entwürfe für Token-Tabelle, Universal Links, Push).
Zustand und Entscheidungen: `STATUS.md`. Nichts davon ist begonnen.

## 1. Was sich seit August geändert hat

| Alter Plan | Heute | Folge |
|---|---|---|
| `index.html` 5.032 Zeilen | **14.894 Zeilen** | Phase 2 (Vite, Module) wäre kein 5–8-Tage-Posten mehr, eher 3 Wochen mit hohem Bruchrisiko |
| Routen lesen `req.session.userId` | 61 Stellen in 13 Dateien, unverändert | Token-Auth (Phase 1) ist weiter nötig |
| `auth_tokens` / `push_tokens` | existieren nicht | beide neu |
| Cookie `sameSite: 'lax'` (`server.js:97`), CORS ein Ursprung (`server.js:65`) | unverändert | Anmeldung in der Hülle geht nicht, bis Token-Auth steht |
| App unter `/` | App läuft **seit 22.10. unter `/app`** (Manifest `start_url /app/`), `/` wird Startseite | Universal Links dürfen nur `/app`, `/t/…` und Einladungs-Pfade beanspruchen, **nicht** die SEO-Seiten |
| API-Aufrufe | fast alle über eine Funktion (`index.html:5631`) plus ~6 direkte `fetch('/api/…')` | relative Pfade brauchen in der Hülle eine Basis-Adresse; zentral lösbar |
| Name „MovieMatch" | CLAUDE.md sagt „MovieTaste", STATUS/Manifest „MovieMatch" | **Store-Name vor Anmeldung klären** (Abschnitt 4) |
| Xcode | Xcode 27.2, iOS-27-Simulatoren, Node 26 installiert; Apple verlangt seit 28.04.2026 Xcode 26+ SDK | Werkzeuge reichen. CocoaPods fehlt, Capacitor nutzt Swift Package Manager, kein Problem |
| Age Rating | neue Stufen 13+/16+/18+, Fragebogen Pflicht | siehe 5 |

## 2. Entscheidung, die ich neu vorschlage (bitte bestätigen)

**Phase 2 (Modularisierung mit Vite) streichen, schlanker Weg:**
`index.html` bleibt eine Datei. Ein kleines Build-Skript kopiert sie samt
Assets nach `www/` (Capacitor `webDir`). In der Datei kommt **eine** Schicht
`PLATFORM` dazu (Basis-Adresse, Token-Speicher, Teilen, Statusleiste), alle
`fetch`-Aufrufe laufen darüber. Spart rund 3 Wochen. Der Preis: keine
Modultests. Die Zusage „index.html nicht antasten" in CLAUDE.md gilt dafür
ausdrücklich nicht (ihr beauftragt das hier). Falls ihr Vite trotzdem wollt,
Plan-Alt Phase 2 gilt weiter, plus Aufwand ×2–3.

Unverändert bleibt: Capacitor, Oberfläche mitgeliefert (nicht von
movietaste.de geladen), Token statt Cookie, iOS zuerst, Organisation
digital-wings, Push per FCM.

## 3. Phasen

### Phase 0 — Konten (nur ihr, Wartezeiten, sofort starten)
Siehe Abschnitt 6, Schritte A–C.

### Phase 1 — Token-Anmeldung im Backend (ich)
- Tabelle `auth_tokens`, `backend/lib/tokenAuth.js` (SHA-256, 90 Tage gleitend).
- `login`/`register`: bei Kopf `X-Client: native` zusätzlich Token liefern.
- `requireAuth`: zuerst Bearer, sonst Cookie, setzt `req.userId`; alle 61
  Stellen umstellen.
- `logout`, **Kontolöschung** (`kontoAufraeumen.js`) löschen auch Tokens.
- CORS-Liste: `https://movietaste.de`, `capacitor://localhost`.
- Geräteliste in den Einstellungen (einzeln abmelden).
- Test: `curl` mit Bearer = gleiche Antworten wie Cookie; gelöschtes Konto
  wird abgewiesen. Nach Deploy auf movietaste.de prüfen.

### Phase 2 — Plattform-Schicht in index.html + Capacitor (ich)
- `PLATFORM`-Objekt, `API_BASE`, Token in Keychain (Plugin
  `@capacitor/preferences` ist nicht verschlüsselt → Secure-Storage-Plugin).
- Build-Skript `www/`, `npx cap add ios`, Simulator-Lauf.
- **Katalog-Messung zuerst** (27 MB, `buildPool`) auf echtem Gerät.
- Statusleiste, Safe-Area, Tastatur, Haptik.

### Phase 3 — native Fähigkeiten gegen Richtlinie 4.2 (ich)
Mindestens: Push (Phase 5), natives Teilen mit Datei, Universal Links,
Offline-Anzeige der eigenen Listen, Haptik. Ohne das droht Ablehnung (Abschnitt 5).

### Phase 4 — Universal Links
`/.well-known/apple-app-site-association` als eigene Express-Route, nur für
`/app*`, `/t/*`, Einladungs-Pfade. SEO-Seiten ausnehmen. Ich brauche die
**Team-ID** (Schritt C).

### Phase 5 — Push (FCM)
Tabelle `push_tokens`, Auslöser bei gemeinsamer Watchlist (gebündelt),
Einstellung standardmäßig aus, Berechtigung erst beim ersten Verknüpfen.
Datenschutzerklärung ergänzen. Braucht APNs-Schlüssel + Firebase (Schritt D).

### Phase 6 — Einreichung iOS (gemeinsam, Abschnitt 6 E–J)
### Phase 7 — Android (Abschnitt 7)
### Phase 8 — Betrieb (Capgo, Versionsnummern, Absturzberichte)

Aufwand mit dem schlanken Weg: ca. **12–20 Arbeitstage** reine Umsetzung plus
Wartezeiten (D-U-N-S 1–3 Wochen, Prüfung 1–3 Tage je Runde).

## 4. Offene Entscheidungen für euch
1. **Store-Name.** „MovieMatch" ist generisch und im Store sehr wahrscheinlich
   belegt; Apple lässt keinen Namen doppelt zu. In App Store Connect vorab
   prüfen (App anlegen reserviert ihn). Fallback: „MovieMatch – Filme & Serien"
   (max. 30 Zeichen) oder „MovieTaste". Bundle-ID `de.movietaste.app` bleibt.
2. **Schlanker Weg statt Vite** (Abschnitt 2).
3. **iPad**: erst nach dem iPhone-Start. Achtung: Capacitor-Projekte sind
   standardmäßig iPad-fähig; dann verlangt Apple iPad-Screenshots. Ich stelle
   zunächst auf „nur iPhone".
4. **Mindest-iOS**: 16 (deckt >95 %).

## 5. Ablehnungsrisiken (Prüfung gegen Code und Rechtstexte)

| # | Risiko | Befund / Gegenmaßnahme |
|---|---|---|
| 1 | **4.2 „nur Webseite"** | Größtes Risiko. Oberfläche mitgeliefert + Push + Universal Links + natives Teilen + Offline + Haptik. In den Prüfhinweisen aufzählen. |
| 2 | **5.1.1(v) Kontolöschung** | Löschen in der App vorhanden (`settingsDeleteBtn`, `DELETE /account`). Es ist ein **Antrag mit Rücknahme** (`auth.js:336`) – in den Prüfhinweisen erklären, sonst Rückfrage „Löschung nicht sofort". |
| 3 | **Anmelden mit Apple (4.8)** | Nicht nötig, solange es nur E-Mail/Passwort gibt. Keine Google/Facebook-Anmeldung einbauen. |
| 4 | **Demo-Zugang (2.1)** | Prüfer brauchen ein Testkonto mit gefüllter Watchlist **und** einer verknüpften Person. Eigenes Konto anlegen, Zugangsdaten in „Hinweise für die Prüfung". |
| 5 | **Datenschutz-Etiketten ≠ Datenschutzerklärung** | E-Mail, Nutzungsdaten (Listen, Bewertungen), Kennungen (Push), Diagnose. **Google Analytics:** läuft nur nach Cookie-Zustimmung. In der App kein Cookie-Banner-Äquivalent → Analytics in der App **abschalten** oder auf eigene Zählung beschränken, sonst Tracking-Abfrage (ATT) und „Tracking"-Angabe nötig. Empfehlung: in der App kein GA. |
| 6 | **Inhalte / Altersfreigabe** | Titel ab 18 mit Postern. Neuer fragebogen: Gewalt/Sexualität „selten bis mäßig" → voraussichtlich **13+ oder 16+**. Ehrlich beantworten (Falschangaben = Ablehnung). Nutzergenerierte Inhalte: es gibt Bewertungen und Verknüpfungen, **keine öffentlichen Texte** – bestätigen, sonst Melde-/Blockier-Funktion nötig (1.2). |
| 7 | **Quellen-Hinweise** | TMDB-Pflichttext und JustWatch-Hinweis stehen im „Credits"-Modal, in die App übernehmen und gut erreichbar lassen. Streaming-Daten kommen „via TMDB/JustWatch": JustWatch verlangt Namensnennung. |
| 8 | **Trailer (YouTube)** | Einbettung funktioniert im WebView meist, aber auf iPhone testen; Fehler 150/153 wären sichtbar. |
| 9 | **Rechtstexte erreichbar** | Datenschutz-URL (Pflicht im Store) und Link in der App: `https://movietaste.de/datenschutz.html`. Impressum in der App verlinken. TODO-Platzhalter in `datenschutz.html`/`impressum.html`: Suche ergab 0 Treffer, rechtliche Prüfung steht laut Plan aber noch aus. Abschnitt 9 („kommerzielle Verwertung") vor Einreichung prüfen. |
| 10 | **Optik / HIG** | Sicherheitsabstände (Notch, Home-Balken), Tap-Ziele ≥ 44 pt, Dark/Light, kein Text unter Statusleiste, keine Browser-Anmutung (Auswahl markieren, Zoom, Overscroll-Gummi abschalten, `user-select`), Dynamic Type nicht brechen, Ladezustand statt weißem Blitz, Launch-Screen. Ich prüfe das im Simulator in vier Größen (SE-Klasse bis Pro Max). |
| 11 | **Abstürze / Platzhalter (2.1)** | Keine toten Links, kein „Demnächst", kein Debug-Text. |
| 12 | **Exportrecht** | Nur HTTPS → `ITSAppUsesNonExemptEncryption = NO` eintragen. |
| 13 | **Feste Verfügbarkeitsaussagen** | Kino-/Streaming-Daten nur regional gültig; Hinweis „ohne Gewähr" beibehalten. |
| 14 | **USA** | Rechtlich weiter gesperrt (STATUS.md): Store-Verfügbarkeit auf **DE, AT, CH + EWR** beschränken, bis geklärt. |

## 6. Schritt-für-Schritt iOS — was ihr tut und eintragt

**A. D-U-N-S-Nummer** (kostenlos): https://www.dnb.com/duns-number/get-a-duns.html bzw. Apples Prüfseite
https://developer.apple.com/enroll/duns-lookup/ . Eintragen: exakter Firmenname
und Anschrift laut Handelsregister (digital-wings), Telefon, Geschäftsführer.
Wenn schon vorhanden: dort nachschlagen, das spart Wochen.

**B. Apple Developer Program als Organisation** (99 $/Jahr, https://developer.apple.com/programs/enroll/).
Nötig: Apple-ID mit **Zwei-Faktor**, rechtlicher Firmenname, D-U-N-S, Website
(movietaste.de), Telefon, Person mit Vertretungsbefugnis. Apple ruft zur
Prüfung zurück (Tage). Vorab: Firmen-E-Mail auf eigener Domain.

**C. Team-ID notieren** (developer.apple.com → Membership). Brauche ich für
Universal Links.

**D. Technik-Zugänge**
- Firebase-Projekt anlegen (console.firebase.google.com), iOS-App mit Bundle-ID
  `de.movietaste.app` hinzufügen, `GoogleService-Info.plist` herunterladen.
- developer.apple.com → Keys → **APNs-Schlüssel (.p8)** erzeugen, Key-ID notieren,
  in Firebase hochladen. Datei sicher aufbewahren (nur einmal herunterladbar).
- Identifier `de.movietaste.app` anlegen mit Capabilities *Push Notifications*,
  *Associated Domains*.

**E. App in App Store Connect anlegen** (appstoreconnect.apple.com → Apps → +):
Plattform iOS; **Name** (30 Zeichen, siehe 4.1); Primärsprache Deutsch;
Bundle-ID; **SKU** frei, z. B. `movietaste-ios-1`; Zugriff „Voller Zugriff".

**F. Store-Eintrag ausfüllen** (ich liefere die Texte als Entwurf, ihr fügt ein):
Untertitel (30), Werbetext (170), Beschreibung (4000), Schlüsselwörter
(100 Zeichen, kommagetrennt, keine Leerzeichen), Support-URL, Marketing-URL
`https://movietaste.de`, **Datenschutz-URL**, Copyright „2026 digital-wings",
Kategorie Unterhaltung (sekundär Lifestyle), Version 1.0, „Was ist neu".
Screenshots: iPhone **6,9"** (1320×2868) Pflicht; 6,5" optional. 3–10 Stück,
die Tour-Bilder sind veraltet → neue aus dem Simulator. App-Icon 1024×1024
ohne Transparenz und ohne abgerundete Ecken.

**G. App-Datenschutz** (App Store Connect → Datenschutz): Datentypen
E-Mail-Adresse, Nutzerinhalte/Produktinteraktion, Geräte-ID (Push), Absturzdaten
(falls verwendet). Jeweils: mit Identität verknüpft ja, Tracking nein, Zweck
App-Funktionalität. Muss zu `datenschutz.html` passen.

**H. Altersfreigabe-Fragebogen**: ehrlich beantworten (Abschnitt 5, Zeile 6).
**Exportrecht**: nur Standard-Verschlüsselung/HTTPS → befreit.
**Preis**: kostenlos. **Verfügbarkeit**: DE/AT/CH/EWR. **Inhaltsrechte**:
„Enthält Drittinhalte" = ja (TMDB), Rechte vorhanden durch Lizenz/Namensnennung.

**I. Hinweise für die Prüfung**: Testkonto (E-Mail + Passwort), Kurzbeschreibung
der nativen Funktionen, Erklärung Kontolöschung als Antrag, Kontakt (Name,
Telefon, E-Mail).

**J. Build hochladen**: ich baue in Xcode, ihr meldet euch in Xcode mit der
Apple-ID an (Settings → Accounts, Team wählen, „Automatically manage signing").
Archive → Distribute → App Store Connect. Danach **TestFlight**: interne Tester
einladen, auf 2 echten iPhones durchspielen, dann „Zur Prüfung einreichen".

## 7. Android (nach iOS)
- Play Console (25 $, https://play.google.com/console) als **Organisation**
  (D-U-N-S nötig, dafür **keine** 12-Tester-Pflicht). Als Privatperson wären
  12 Tester über 14 Tage Pflicht.
- Identitätsprüfung, Zahlungsprofil, Entwicklerkonto-Kontakt.
- App anlegen: Name, Sprache, App/Spiel, kostenlos, Erklärungen.
- Eintragen: Kurzbeschreibung (80), Vollbeschreibung (4000), Icon 512×512,
  Feature-Grafik 1024×500, Screenshots (min. 2), Datenschutz-URL,
  **Datensicherheit** (analog G), **Inhaltseinstufung** (IARC-Fragebogen),
  Zielgruppe (13+, nicht Kinder), Anzeigen: nein, Konto-Löschung-URL
  (Pflicht: Web-Seite, auf der man die Löschung beantragt – `movietaste.de`
  Einstellungen reicht nur, wenn ohne App erreichbar → ggf. eigene Seite).
- Signierung: **Play App Signing** nutzen, Upload-Schlüssel sichern.
- `assetlinks.json` mit SHA-256-Fingerabdruck, Ziel-API-Level aktuell halten,
  Push-Berechtigung `POST_NOTIFICATIONS`. Erst interner Test, dann Produktion.

## 8. Abhak-Liste vor Einreichung iOS
- [ ] Store-Name verfügbar · [ ] D-U-N-S · [ ] Developer-Konto aktiv
- [ ] Rechtstexte geprüft, Abschnitt 9 entschieden
- [ ] Token-Anmeldung, Kontolöschung räumt Token/Push
- [ ] Analytics in der App aus · [ ] Credits/TMDB/JustWatch in der App
- [ ] Universal Links geprüft · [ ] natives Teilen mit Vorschau
- [ ] Push getestet · [ ] Offline-Anzeige · [ ] Katalog auf Altgerät gemessen
- [ ] Testkonto angelegt · [ ] Screenshots 6,9" · [ ] Etiketten · [ ] Altersfragebogen
- [ ] TestFlight auf echten Geräten

## Anhang: Antworten zum Altersfragebogen (Stand 19.11.2026)

Faktenbasis: Importe setzen `include_adult: false`, der Katalog enthält aber
Titel ab FSK 16/18 mit Postern und YouTube-Trailern. Keine Werbung, keine
In-App-Käufe, kein Glücksspiel, Analytics in der App aus. Nutzer erzeugen keine
öffentlichen Texte (nur Bewertungen und Verknüpfung), Konto-Löschung vorhanden.

**Apple:** Medien als Hauptzweck nein · Gewalt/Sex/Horror/Drogen/Profanität
„selten bis mäßig" (nur Poster, Titel, Trailer) · Glücksspiel nein ·
unbeschränkter Webzugriff nein (feste Links, YouTube-Einbettung in der
Prüfer-Notiz nennen) · nutzergenerierte Inhalte/Chat nein · Werbung nein.
Erwartet 13+ oder 16+.

**Google Play (IARC):** Kategorie Referenz/Bildung, nicht Spiel · Inhalte Dritter
(Poster/Trailer) ehrlich angeben, nicht alles auf „Keine" · Nutzer-Interaktion:
Verknüpfung ohne öffentliche Inhalte · Standort optional (Kinos). Erwartet 12+ bis 16+.

**Wichtig:** Alles auf „Keine" wäre falsch (FSK-18-Poster sichtbar) und führt zur
Ablehnung. Kommen Reviews/Kommentare, ändert sich alles (Melde-/Blockierfunktion).
