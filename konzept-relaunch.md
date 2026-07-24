# Konzept: „Filme & Serien" als öffentliche Multi-User-Web-App

Reine Konzeptvorlage – **keine Umsetzung**, bis du final freigibst.

> **Update nach deinen Antworten:** Backend selbst gehostet bei **Hetzner**, Login per **E-Mail + Passwort**, Start **nur als Web-App/PWA**, später zusätzlich native iOS-/Android-Apps, Monetarisierung noch offen. Abschnitt 2 und 6–8 sind entsprechend angepasst.
>
> **Update nach zweiter Klärungsrunde:** Kein Sync/Import bestehender lokaler Daten mehr (Abschnitt 4 entfällt, Testapp-Stand wird ignoriert). Stattdessen: App bleibt für alle frei durchsuchbar, Login wird erst bei Schreibaktionen (Gesehen/Watchlist/Liste hinzufügen) erzwungen (siehe neuer Abschnitt 4). Katalog bleibt zentral von dir gepflegt. Nutzerzahl-Erwartung: öffentlich/wachstumsoffen, Server-Skalierung von Anfang an mitdenken. Hetzner-Account und Domain sind bereits vorhanden.

## 1. Ausgangslage

- Eine einzelne `index.html` (PWA), die im Browser läuft und sich auf dem iPhone „installieren" lässt.
- Nutzerdaten (gesehen/Watchlist) liegen nur lokal im `localStorage` des jeweiligen Geräts – kein Sync zwischen Geräten, kein Zugriff für andere Nutzer.
- Filme-/Serien-Katalog ist direkt im Code eingebettet (`FILME`, `SERIEN`, `DETAILS`, `CAND`).
- Streaming-Daten (`streaming.json`) werden wöchentlich per GitHub Action von TMDB geholt und ins Repo committed.
- Hosting: GitHub Pages (statisch, kostenlos).

Für eine öffentliche Version mit Accounts brauchst du im Kern drei neue Bausteine: **Login/Auth**, **zentrale Datenbank statt localStorage**, **Backend/API**, das beides verbindet.

## 2. Architektur: selbst gehostet auf Hetzner

Da du volle Kontrolle willst statt Managed-Backend, hier der konkrete Stack für einen **Hetzner Cloud Server**:

| Baustein | Empfehlung | Warum |
|---|---|---|
| Server | Hetzner Cloud VPS (klein reicht zum Start, z. B. CX22, ~4–5 €/Monat), Standort Deutschland/Finnland | Günstig, EU-Standort ist ideal für DSGVO |
| Betrieb/Deployment | Docker + Docker Compose, optional **Coolify** (kostenlose, selbst gehostete Deploy-Oberfläche) | Coolify nimmt dir vieles ab (Git-Deploys, SSL, Neustarts), ohne dass du die Kontrolle über den Server verlierst |
| Datenbank | PostgreSQL (eigener Container) | Passt gut zu relationalen Daten wie Nutzer/Titel/Fortschritt |
| Backend/API | Node.js (Express/Fastify) | Gleiche Sprache wie dein bestehendes `stream-fetch.mjs`, kein Technologie-Bruch |
| Login | Eigene E-Mail/Passwort-Auth: Passwort-Hashing mit bcrypt, Sessions/JWT über HTTP-only-Cookies | Deckt genau das ab, was du gewählt hast, ohne unnötige Zusatzkomplexität (kein Social Login nötig) |
| Transaktions-E-Mails | Externer Dienst (z. B. Resend, Postmark) für Registrierungsbestätigung/Passwort-Reset | Von einem einzelnen Server aus versendete E-Mails landen sehr häufig im Spam – ein spezialisierter Versanddienst ist Standard, auch bei sonst komplett selbst gehosteten Projekten |
| Reverse Proxy/TLS | Caddy oder Traefik (automatisches Let's-Encrypt-Zertifikat) | Einfachste Lösung für HTTPS |
| Backups | Automatisiertes `pg_dump` auf Hetzner Storage Box/Object Storage | Ein einzelner Server ist ein Single Point of Failure – Backups außerhalb des Servers sind Pflicht |
| Frontend-Hosting | Auf demselben Server ausliefern (statisch, per Caddy) | Kein zusätzlicher Dienst nötig |
| Streaming-Datenjob | Bestehende GitHub Action beibehalten, aber Ergebnis per API an die eigene Datenbank schicken statt `streaming.json` zu committen | Zentral statt pro Nutzer neu geladen |

**Wichtig zu wissen:** Im Gegensatz zu einem Managed-Backend übernimmst du damit selbst Serverpflege, Sicherheitsupdates, Backups und Monitoring (z. B. simpler Uptime-Check). Das ist bewusst dein gewählter Trade-off für volle Kontrolle – ich wollte es nur explizit benennen.

Die App selbst startet als **PWA** (installierbar, teilweise offline-fähig); native iOS-/Android-Apps über die App Stores sind als zweiter Schritt vorgesehen, sobald die Web-Version läuft.

## 3. Datenmodell (Vorschlag)

- `titles` – zentraler Katalog (ersetzt die im Code eingebetteten Arrays): id, typ (Film/Serie), Titel, Jahr, Genres, Regie, Cast, Posterpfad, IMDb-Bewertung …
- `user_progress` – ersetzt localStorage: user_id, title_id, gesehen (bool), watchlist (bool), aktualisiert_am
- `streaming_cache` – aktuelle Streaming-Verfügbarkeit je Anbieter, zentral statt Client-seitig gefetcht
- Zugriffsregeln: jede:r Nutzer:in sieht/ändert ausschließlich die eigenen `user_progress`-Einträge

## 4. Onboarding & Login-Flow

Kein Sync/Import bestehender lokaler Daten – der bisherige „Daten sichern/übertragen"-Code entfällt ersatzlos. Stattdessen gilt für den Relaunch:

- Die Startseite (Domain öffnen) zeigt sofort die volle App wie gewohnt – alle Fenster/Funktionen für Filme, Serien, Streaming sind frei durchsuchbar, **ohne** dass ein Account nötig ist.
- Ein Account/Login wird erst geprüft, sobald jemand eine Schreibaktion auslöst: **Gesehen** markieren, **Watchlist** setzen oder **zur Liste hinzufügen**.
- Ist die Person eingeloggt: Aktion wird direkt gespeichert (verknüpft mit ihrem Account).
- Ist sie nicht eingeloggt: Es öffnet sich ein Login-Popup. Login und Registrierung sind in einer Ansicht kombiniert (Login-Formular + Umschalt-Link „Noch kein Konto? Registrieren").
- Nach erfolgreichem Login/Registrierung wird die ursprünglich ausgelöste Aktion (z. B. „Gesehen" setzen) automatisch nachgeholt – kein erneuter Klick nötig.

## 5. Rechtliches, das dazukommt (sobald öffentlich, mit Accounts, in Deutschland)

- **Impressum** – Pflicht für öffentlich betriebene Angebote (§5 TMG/DDG)
- **Datenschutzerklärung** – Pflicht, sobald personenbezogene Daten (E-Mail, Accounts) verarbeitet werden
- **Serverstandort EU** – bei Supabase/Vercel wählbar, für DSGVO relevant
- **Recht auf Löschung/Export** – Nutzer:innen müssen ihren Account inkl. Daten löschen/exportieren können
- **Auftragsverarbeitungsverträge (AVV)** mit den genutzten Dienstleistern
- Separat davon (hast du schon benannt, hier nur als Reminder): **TMDB-Nutzungsbedingungen** betreffen nicht nur Bildrechte, sondern auch die API-Nutzung selbst bei kommerziellem Einsatz – relevant, sobald das Produkt vermarktet wird

## 6. Grobe Kosteneinordnung

Hetzner-VPS (~4–5 €/Monat) + Domain (~10 €/Jahr) + Transaktions-E-Mail-Dienst (meist kostenlos bis einige Hundert/Tausend Mails im Monat) → Start für unter 10 €/Monat. Skaliert bei Bedarf durch größeren Server oder zusätzliche Server (z. B. getrennter DB-Server), das ist bei Hetzner unkompliziert nachrüstbar.

## 7. Phasenplan (zur Orientierung – Umsetzung erst nach deiner Freigabe)

1. Hetzner-Server aufsetzen (Docker, Coolify, Caddy)
2. Postgres-Datenbank + Schema (`titles`, `user_progress`, `streaming_cache`)
3. Backend-API mit E-Mail/Passwort-Login (Registrierung, Login, Passwort-Reset)
4. Frontend umbauen: localStorage-Zugriffe durch API-Calls ersetzen, App bleibt ohne Login frei durchsuchbar
5. Login-Gate für Schreibaktionen (Gesehen/Watchlist/Liste hinzufügen) + kombiniertes Login-/Registrierungs-Popup mit automatischem Nachholen der Aktion
6. Rechtliche Seiten ergänzen (Impressum, Datenschutz)
7. Backups + Monitoring einrichten
8. Testen, Domain, Go-Live
9. Später: native iOS-/Android-App (z. B. per Capacitor-Wrapper um die bestehende Web-App, statt komplettem Neubau)

## 8. Umsetzung: Tooling & Aufwand

Die Umsetzung erfolgt **nicht in Cowork**, sondern in **Claude Code**: Cowork ist für Datei-/Konzeptarbeit wie dieses Dokument gedacht, nicht für ein mehrwöchiges Backend-Projekt mit eigenem Server, Docker/Postgres-Setup, Deployment und Git-Workflow. Claude Code läuft im Terminal mit vollem Repo-/Git-/Server-Zugriff und ist für genau diese Art iterativer Entwicklung gebaut.

- **Modell:** Sonnet 5 als Arbeitspferd für den Großteil der Implementierung (Backend-Code, Frontend-Umbau, Deployment-Skripte). Für sicherheitskritische Stellen zusätzlich mit **Opus 5** gegenlesen lassen: Auth-/Security-Design, Zugriffsregeln auf `user_progress`, Datenmodell-Entscheidungen, finales Review vor Go-Live.
- **Aufwand:** Kein Ein-Sitzungs-Task, sondern mehrere Claude-Code-Sessions entlang des Phasenplans (Abschnitt 7), mit Kontrolle nach jeder sicherheitsrelevanten Phase (Auth, Zugriffsregeln, Deployment). Größter Aufwand: Backend-API + Auth + Datenmodell. Mittel: Frontend-Umbau auf API-Calls + Login-Gate. Kleiner: rechtliche Seiten, Backups/Monitoring.
- **Setup:** Wird in einem separaten Cloud-Account/einer separaten Umgebung umgesetzt, nicht hier in Cowork. Dieses Konzeptdokument dient dort als Spezifikation; zusätzlich liegt `UEBERGABE.md` im selben Projektordner als kompakter Einstiegspunkt für die neue Claude-Code-Session.

## 9. Noch offene Punkte

- ~~Wie viele Nutzer:innen erwartest du grob~~ → geklärt: öffentlich/wachstumsoffen, Skalierung von Anfang an mitdenken.
- ~~Hetzner-Account und Domain~~ → geklärt: beide bereits vorhanden.
- Passt dir das grobe Budget von unter 10 €/Monat zum Start (steigt bei größerem Server durch mehr Nutzer)?
- Soll ich für den Transaktions-E-Mail-Versand (Registrierung, Passwort-Reset) einen konkreten Anbieter vorschlagen und einplanen?

Sobald du das final freigibst, setze ich Schritt für Schritt aus dem Phasenplan um (in der neuen Umgebung, per Claude Code).
