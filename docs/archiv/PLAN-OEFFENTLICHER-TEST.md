# Plan: Vor dem öffentlichen Test

> **Arbeitsauftrag für die nächste Sitzung.** Stand: 11. August 2026.
> Ziel: MovieMatch an Fremde geben — kostenlos, ohne Werbung, nicht kommerziell.
>
> Alle Entscheidungen sind getroffen (siehe Abschnitt 0). Was hier steht, ist
> abzuarbeiten; nur die in Abschnitt 8 genannten Punkte brauchen noch eine
> Antwort, und auch die haben eine Vorgabe, falls keine kommt.

## 0. Getroffene Entscheidungen

| # | Punkt | Entscheidung |
|---|---|---|
| 1 | Abschnitt 9 Datenschutz (kommerzielle Verwertung) | **Bleibt unverändert.** Absicherung für die Zukunft, auch wenn heute nicht kommerziell. |
| 2 | Abschnitt 6 Datenschutz (Resend, Feedback) | **Fertig umsetzen**, nach bestem Wissen. Später prüfen lassen. |
| 3 | Namensnennung OSM + GeoNames | **Nachtragen**, auch wenn „Deine Kinos" noch nicht sichtbar ist. |
| 4 | Anwaltsprüfung | **Vorerst nicht.** Später erneut aufgreifen. |
| 5 | Missbrauchsschutz / Rate-Limits | **Umsetzen.** |
| 6 | Feedback speichern | **Zusätzlich in die Datenbank**, auf Abfrage auslesbar. Datenschutz entsprechend anpassen. |
| 7 | Tour-Screenshots | **Aktualisieren.** |
| 8 | Monitoring | **Einbauen**, E-Mail nur im Fehlerfall. Kein „alles in Ordnung". |
| 9 | Indexierung | **Nur die Startseite.** Der Rest bleibt vorerst draußen. |

---

## 1. Feedback in der Datenbank speichern (Punkt 6)

**Zuerst machen** — Punkt 2 beschreibt den Endzustand, und der ändert sich
dadurch.

Heute geht Feedback ausschließlich per Mail an `info@digital-wings.com`
([backend/routes/feedback.js](backend/routes/feedback.js)). Schlägt Resend fehl,
ist die Nachricht weg. Beim öffentlichen Test ist Feedback aber das Ergebnis,
das man haben will.

- Neue Tabelle `feedback`: `id`, `nachricht` (bis 5.000 Zeichen, wie heute
  `MAX_LENGTH`), `user_id` (NULL bei nicht angemeldeten Personen,
  `ON DELETE SET NULL`), `email` (Kopie zum Zeitpunkt der Absendung, damit die
  Zuordnung nach einer Kontolöschung nicht ins Leere zeigt), `erstellt_am`.
- **Erst speichern, dann mailen.** Scheitert der Versand, steht die Nachricht
  trotzdem in der Datenbank; scheitert das Speichern, bricht die Anfrage ab.
  Heute ist es andersherum und damit ungesichert.
- Auslesen über ein Skript, wie bei der Bewertungsstatistik:
  `npm run feedback` in `backend/`, dazu `backend/scripts/feedback-lesen.mjs`.
  **Bewusst keine HTTP-Route** — dieselbe Überlegung wie bei
  `bewertungsstatistik.mjs`: Was Freitext von Fremden enthält, soll nicht hinter
  einer URL liegen, die irgendwann offen im Netz steht.
- `ON DELETE SET NULL` statt CASCADE: Eine Kontolöschung darf die Rückmeldung
  nicht mitreißen — sie gehört zum Betrieb, nicht zum Konto. Die Verbindung zur
  Person fällt dabei weg, der Text bleibt.

**Prüfen:** Feedback abgemeldet und angemeldet senden, beide Zeilen stehen in
der Tabelle; Mailversand künstlich scheitern lassen (`MAIL_PROVIDER=console`
reicht nicht — Fehler erzwingen), die Zeile muss trotzdem da sein.

---

## 2. Datenschutzerklärung, Abschnitt 6 (Punkt 2)

Vorlage: [ENTWURF-DATENSCHUTZ-MAIL.md](ENTWURF-DATENSCHUTZ-MAIL.md). **Achtung:
Der Entwurf sagt „wird nicht in unserer Datenbank gespeichert" — das stimmt nach
Abschnitt 1 dieses Plans nicht mehr und muss umgeschrieben werden.**

Umzusetzen:

- **Abschnitt 6 ersetzen:** die zwei tatsächlichen Anlässe (Passwort-Reset,
  Feedback), Resend als Auftragsverarbeiter, Übermittlung in die USA.
  „Registrierungs-E-Mails" streichen — die gibt es im Code nicht.
- **Abschnitt 2** um einen Listenpunkt „Feedback" ergänzen: Freitext, bei
  angemeldeten Personen zusammen mit der E-Mail-Adresse, **gespeichert**.
- **Abschnitt 3** um den Zweck ergänzen (Art. 6 Abs. 1 lit. f).
- **Abschnitt 10** um die Speicherdauer ergänzen — Vorgabe **12 Monate**, falls
  keine andere Ansage kommt.

Zwei Angaben nach bestem Wissen, ohne zu raten:

- **Firmierung und Anschrift von Resend** aus deren eigenen Rechtstexten
  übernehmen (Impressum/Terms auf resend.com), nicht aus dem Gedächtnis.
- **Grundlage der USA-Übermittlung:** auf der offiziellen DPF-Liste
  (`dataprivacyframework.gov`) nachsehen, ob Resend zertifiziert ist. Wenn ja,
  Angemessenheitsbeschluss nennen; wenn nein, Standardvertragsklauseln nach
  Art. 46 Abs. 2 lit. c DSGVO. Das Ergebnis der Prüfung im Commit festhalten.

Dazu der Vorschlag aus dem Entwurf, Abschnitt 4: **eine Zeile unter dem
Feedback-Feld** — sinngemäß „Angemeldet schicken wir deine E-Mail-Adresse mit,
damit wir antworten können." Wer Freitext tippt, liest vorher keine
Datenschutzerklärung.

**Abschnitt 9 bleibt unangetastet** (Entscheidung 1).

---

## 3. Namensnennung ergänzen (Punkt 3)

Lizenzbedingung, nicht Kür. Beides steht bisher **nur als Kommentar im Code**.

- **OpenStreetMap** (ODbL): „© OpenStreetMap-Mitwirkende"
- **GeoNames** (CC-BY 4.0): Namensnennung mit Link auf geonames.org

Ort: Einstellungen → Credits (`creditsModal` in `index.html`), wo TMDB schon
korrekt genannt ist. Formulierung an TMDB anlehnen, damit es eine Liste ergibt
und keinen Flickenteppich.

---

## 4. Missbrauchsschutz (Punkt 5)

Heute gibt es **nirgends** ein Limit. Registrierung, Passwort-Reset und Feedback
verschicken alle E-Mails über Resend und stehen offen.

Vorgabe, falls keine andere Ansage kommt — je IP:

| Endpunkt | Grenze |
|---|---|
| `POST /api/auth/register` | 5 in 60 Minuten |
| `POST /api/auth/login` | 10 in 15 Minuten |
| `POST /api/auth/request-password-reset` | 3 in 60 Minuten |
| `POST /api/feedback` | 5 in 60 Minuten |
| `POST /api/links/invite` | 20 in 60 Minuten |

- **Eigene kleine Umsetzung im Speicher**, kein zusätzliches Paket: ein Zähler
  je IP und Fenster reicht bei einem Prozess auf einem Server. Das Projekt kommt
  bisher mit acht Abhängigkeiten aus, das soll so bleiben.
- `app.set('trust proxy', 1)` steht bereits — `req.ip` liefert hinter Caddy die
  echte Adresse. **Vor dem Bauen einmal nachmessen**, sonst limitiert man Caddy.
- Antwort bei Überschreitung: **429** mit einer verständlichen deutschen
  Meldung im Frontend, nicht bloß ein roter Fehler.
- Der Reset-Endpunkt darf weiterhin **nicht verraten**, ob es die Adresse gibt —
  das Limit darf daran nichts ändern.

**Prüfen:** Jeden Endpunkt bis über die Grenze aufrufen, 429 kommt; nach Ablauf
des Fensters geht es wieder. Und: Die eigene Nutzung darf im Alltag nie
anschlagen.

---

## 5. Tour-Screenshots (Punkt 7)

Die sechs Bilder in `tour/` sind vom 5. August und zeigen die alte Bedienung
(genau ein Bereich aktiv, alte Statusreihe). Seit dem Filter-Umbau leuchten
Filme und Serien gleichzeitig, Kino ist abgesetzt.

`bash scripts/tour/aufnehmen.sh` (braucht Chrome und Netz). Danach jedes Bild
gegen die Beschriftung der zugehörigen Karte halten — die Texte in `TOUR_SEITEN`
beschreiben, was zu sehen sein soll.

---

## 6. Monitoring (Punkt 8)

**E-Mail nur im Fehlerfall.** Kein „läuft alles" — sonst gewöhnt man sich das
Wegklicken an und übersieht die eine Meldung, auf die es ankommt.

Melden soll es:

- **Tägliche Importe** schlagen fehl oder bleiben aus (Katalog, Streaming,
  Kino). „Bleibt aus" ist der wichtigere Fall: Ein Job, der gar nicht läuft,
  meldet von sich aus nichts.
- **Sicherung** schlägt fehl (`lib/sicherung.js`).
- **Datenbank** nicht erreichbar.
- **Unbehandelte Fehler** im Backend (`uncaughtException`,
  `unhandledRejection`) und der Fehlerbehandler in `server.js`.
- **Mailversand** schlägt fehl — dann natürlich nicht per Mail melden, sondern
  ins Protokoll und beim nächsten erfolgreichen Versand nachreichen.

Umsetzung im Backend, Muster wie `starteSicherung`/`starteThemen`:
`backend/lib/wache.js`, Versand über das vorhandene `lib/mailer.js` an
`info@digital-wings.com`.

**Zwei Dinge dabei bedenken:**

- **Gleiche Meldung nicht wiederholt schicken.** Eine Sperre je Art von Meldung
  (etwa eine je Sorte und Tag), sonst kommen bei einem Dauerfehler hunderte
  Mails.
- **Steht der Server, kann er nichts melden.** Das deckt diese Lösung
  ausdrücklich nicht ab. Wer das auch haben will, braucht eine Prüfung von
  außen — als eigener Punkt vermerken, nicht stillschweigend mitbauen.

---

## 7. Indexierung (Punkt 9)

Nur die Startseite soll in Suchmaschinen. Heute gibt es **keine `robots.txt`**
(HTTP 404); `impressum.html` und `datenschutz.html` tragen bereits `noindex`.

- `robots.txt` anlegen: Startseite erlauben, alles andere ausschließen.
- ~~`nutzungsbedingungen.html` bekommt `noindex`~~ — **steht schon drin**
  (am 11. August nachgesehen, Zeile 7, wie bei den anderen beiden).
- Geteilte Titel (`/t/…`) ausschließen — sie erzeugen sonst beliebig viele
  Adressen mit fast gleichem Inhalt.

---

## 8. Entschieden am 11. August

Alle vier Vorgaben sind bestätigt. Nichts davon ist mehr offen.

1. **Speicherdauer für Feedback** → **12 Monate.**
2. **Grenzen beim Missbrauchsschutz** → **die Tabelle in Abschnitt 4.**
3. **Empfänger der Monitoring-Mails** → **`info@digital-wings.com`.**
4. **Prüfung von außen** (meldet, wenn der Server ganz steht) → **vorerst
   nicht.** Bleibt als offener Punkt vermerkt, siehe Abschnitt 6.

---

## 9. Reihenfolge

1. **Feedback speichern** (Abschnitt 1) — muss vor dem Rechtstext stehen, weil
   es dessen Inhalt ändert.
2. **Datenschutz Abschnitt 6, 2, 3, 10** (Abschnitt 2).
3. **Namensnennung** (Abschnitt 3) — klein, sofort erledigt.
4. **Missbrauchsschutz** (Abschnitt 4) — der einzige Punkt, bei dem Fremde
   echten Schaden anrichten können.
5. **Indexierung** (Abschnitt 7) — klein.
6. **Monitoring** (Abschnitt 6).
7. **Tour-Screenshots** (Abschnitt 5) — zuletzt, damit sie den Endstand zeigen.

Nach jedem Punkt committen und ausliefern, wie bisher: gegen den ausgelieferten
Inhalt prüfen, nicht gegen den Workflow-Lauf. Am Ende `UEBERGABE-OFFEN.md`
nachziehen.

## 10. Was ausdrücklich NICHT dazugehört

Einladungen zurückziehen · englische Titel durchsuchbar (`title_en`) ·
„Deine Kinos" mit echten Spielplänen (siehe `PLAN-KINOS.md`) · native Apps
(siehe `PLAN-NATIVE-APPS.md`) · Anwaltsprüfung (Entscheidung 4).
