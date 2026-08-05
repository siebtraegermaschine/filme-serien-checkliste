# Offene Punkte — Stand 2026-08-05

Ergänzt `UEBERGABE-CHAT.md` (Stand 2026-08-03) um alles, was aus der Sitzung
vom 5. August offen geblieben ist.

**Deployment läuft automatisch:** Jeder Push auf `main` stößt
`.github/workflows/deploy.yml` an, das auf dem Server `/opt/movietaste/deploy.sh`
ausführt (git fetch/reset, docker compose build/up, migrate). Alle Änderungen
dieses Tages sind damit live — nachgeprüft an movietaste.de.

---

## 1. Noch zu prüfen / zu entscheiden

### Migration: gelaufen, aber nicht gegengeprüft

Das Schema hat sich geändert (Commit `79841aa`): `user_link_invites.kind`,
`user_link_invite_uses` (mit Übernahme der bisherigen Einlösungen),
`users.invited_by_user_id`, `user_links.hinweis_offen`. `deploy.sh` führt
`migrate` mit aus, es sollte also erledigt sein. Von außen ist das nicht
sichtbar — einmal bestätigen:

```bash
docker compose -f docker-compose.yml exec -T postgres psql -U postgres -d filme_serien \
  -c "\\d user_link_invite_uses"
```

### Alte Einladungslinks sind wieder einlösbar — bereits wirksam

Die Prüfung „Einladung bereits eingelöst" ist ersatzlos entfallen. **Alle noch
nicht abgelaufenen Einladungslinks sind dadurch wieder einlösbar**, auch solche,
die vorher schon einmal benutzt wurden. Das ist seit dem Deploy so. Wer einen
Link in einer Gruppe stehen hat, verknüpft sich möglicherweise mit weiteren
Personen.

Wenn das nicht gewünscht ist, die eigenen offenen Einladungen löschen:

```bash
docker compose -f docker-compose.yml exec -T postgres psql -U postgres -d filme_serien \
  -c "DELETE FROM user_link_invites WHERE inviter_id = (SELECT id FROM users WHERE email = 'DEINE@MAIL.DE')"
```

Bestehende Verknüpfungen (`user_links`) bleiben davon unberührt.

### Mailversand kontrollieren

Feedback geht seit heute an **info@digital-wings.com**. Ob überhaupt etwas
ankommt, hängt an einer Umgebungsvariable:

```bash
docker compose -f docker-compose.yml exec backend printenv MAIL_PROVIDER MAIL_FROM
```

Muss `resend` sein. Bei `console` landet jede Nachricht nur im Container-Log.
Dann in `backend/.env` umstellen und nachsehen, ob dort ungelesenes Feedback
liegt:

```bash
docker compose -f docker-compose.yml logs backend | grep -A5 "MovieMatch – Feedback"
```

Feedback wird **nicht** in der Datenbank gespeichert — nur als Mail verschickt.
Eine Speicherung wäre nachzurüsten, falls nichts verlorengehen soll.

---

## 2. Angefangen, noch nicht fertig

### Alt-Titel ohne TMDB-Kennung

Die ~600 ursprünglich kuratierten Katalog-Titel haben teils keine `tmdb_id` und
ihr Poster als Base64 in der Datenbank. Folgen: kein Poster-Zoom, keine
Themen-Schlagwörter, rund 4,2 MB Mehrlast bei jedem Katalog-Abruf.

Der Kino-Abgleich hatte deshalb Doppeleinträge — **das ist behoben** (Ausweich
über den normalisierten Namen plus Jahr). Die Datenlage selbst ist es nicht:

```bash
# erst zur Kontrolle, schreibt nichts
docker compose -f docker-compose.yml exec -T backend node scripts/backfill-catalog-posters.mjs --dry-run
docker compose -f docker-compose.yml exec -T backend node scripts/backfill-catalog-posters.mjs
```

Dauert überschlagen 3–15 Minuten, ist beliebig wiederholbar, schreibt nur bei
Treffer und sichert jedes Base64-Bild vorher weg. Wie viele Titel noch ohne
Zuordnung sind, steht im Log des täglichen Themen-Laufs:

```bash
docker compose -f docker-compose.yml logs backend | grep "themen.*ohne TMDB"
```

### Einstieg in Schritten („How to")

Sechs Seiten mit Überschrift, Screenshot und Satz. Steht und funktioniert.
Die Bilder liegen fest in `tour/` und werden **nicht** automatisch
mitgeführt — bei Oberflächenänderungen veralten sie. Neu erzeugen:

```bash
bash scripts/tour/aufnehmen.sh
```

Das Werkzeug in `scripts/tour/` liefert die lokale `index.html` aus und reicht
alle `/api`-Aufrufe an die Produktion durch, damit echte Titel und Poster in
den Bildern stehen. Braucht Google Chrome und eine Netzverbindung.

---

## 3. Vorgeschlagen, noch nicht entschieden

**Einladungen zurückziehen.** Bewusst zurückgestellt („erstmal kein
Zurückziehen"). Da Links jetzt für beliebig viele Personen gelten, wiegt ein
versehentlich verschickter Link schwerer als vorher. Eine Liste der offenen
Einladungen mit Schließen-Knopf wäre der nächste Schritt.

**Werbevermerk auswerten.** `users.invited_by_user_id` wird gefüllt, aber
nirgends angezeigt. Wer wen geworben hat, ist derzeit nur per SQL sichtbar.

**Community-Bewertung im Taste-Score.** Sie fließt derzeit **gar nicht** ein —
weder als Bonus (war doppelt, weil es die Sortierung danach schon gibt) noch
als Nähe zum eigenen Bewertungsniveau (wieder entfernt). Offen ist, ob sie in
anderer Form zurück soll; eine Idee war eine Dämpfung nur am unteren Ende,
damit schwach bewertete Titel nicht allein über Genre und Besetzung nach oben
kommen.

**Filme und Serien gemeinsam anzeigen.** Mehrfach besprochen, bewusst nicht
gemacht: Der Typ ist die Tab-Achse und steuert Sortierung, „Neue entdecken" und
die Kino-Seite. Während einer Suche werden beide Typen ohnehin zusammen
durchsucht.

**Rückseiten von DVD/Blu-ray.** Nicht möglich — TMDB kennt nur Poster,
Szenenbilder (`backdrop_path`) und Logos. Machbar wäre stattdessen: mehrere
Poster-Varianten desselben Films oder Poster plus Szenenbild, beides mit
Backend-Aufwand.

---

## 4. Wichtige Entscheidungen dieses Tages

- **Taste-Score neu:** gewichteter Mittelwert aus fünf Teilwerten (Genre 30,
  Schlagwörter 22, Besetzung 18, Regie 18, Jahresnähe 12), jeder an dem
  gemessen, was für das eigene Profil typisch ist. Vorher eine offene
  Punktesumme, die bei 99 abgeschnitten wurde — vier bekannte Gesichter plus
  ein vertrauter Regisseur reichten für die Decke.
- **Einstieg:** Beim Öffnen die erste Ansicht, in der etwas steht (Filme +
  Watchliste → Filme + Gesehen → Serien + Watchliste → Serien + Gesehen →
  Filme + „Neue entdecken"). Gilt auch für einen Klick aufs Logo.
- **„Watchliste" statt „Watchlist"** in der gesamten Oberfläche und in
  Datenschutz/Nutzungsbedingungen. Bezeichner im Code heißen weiter
  `watchlist`.
- **TMDB-Attribution** ist jetzt vorschriftsmäßig: Pflichtsatz im Fußbereich,
  Logo unter Einstellungen → Credits.
- **Fremde Listen:** ein Knopf „Watchliste" statt zweier sich gegenseitig
  ausschließender. Vorgemerktes und Gesehenes kommen zusammen, wegfiltern
  danach.

---

## 5. Bekannte Einschränkungen

- **Aktionszeile bei 320px:** Die untere Knopfreihe braucht dort 293px und hat
  254px — sie bricht auf vier Zeilen um. Ab 360px passt alles in zwei Zeilen
  (gemessen). Lösbar nur über eine kürzere Beschriftung als „Ähnliche Titel".
- **Favoriten in der Personenliste** liegen nur im Browser, gelten also je
  Gerät.
- **Match im Kino** filtert nicht, sondern sortiert das Programm nach dem
  gemeinsamen Geschmack um. Steht so in der Match-Erklärung.
