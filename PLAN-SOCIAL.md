# MovieMatch als soziale App — Plan, Features, Aufwände

> Stand 19. August 2026, dritte Fassung. **Nichts hiervon ist umgesetzt.**
> Die Entscheidungen in Abschnitt 0 sind getroffen und gelten; es folgen noch
> weitere Festlegungen, **bevor** der Auftrag zur Umsetzung ergeht.

---

## 0. Entscheidungsstand (Christian, 19. August 2026)

### Festgelegt

**Konten und Seiten — ja.** Zwei Kontoarten, wie in Abschnitt 1 beschrieben.

**Seiten sind mit den bestehenden Datenbank-Unterseiten verknüpft.**
Damit ist die frühere Trennungsvorgabe („Filmdatenbank und Social bleiben
getrennt", zweite Fassung) **aufgehoben**. Eine Seite ist keine Parallelwelt,
sondern die beanspruchte Unterseite selbst — für Schauspieler, Regie und Kinos.

**Der Weg dahin ist das Beanspruchen:**
1. Auf jeder noch nicht beanspruchten Unterseite steht ein Knopf
   **„Diese Seite beanspruchen"**.
2. Klick → Dialog: **„Bist du *[Name]*? Beanspruche diese Seite."**
3. Es folgt eine **manuelle Authentifizierung/Verifizierung** (kein automatisches
   Verfahren zum Start).
4. Ist die Seite beansprucht, verschwindet der Knopf.

**Mehrere Personen mit Zugriff auf eine Seite: erst später.** Zum Start
verwaltet **genau ein Konto** eine Seite. *Technische Auflage dazu: Das
Datenmodell wird trotzdem von Anfang an n:m angelegt (Zuordnungstabelle
Konto ↔ Seite mit Rolle), nur die Oberfläche kennt vorerst einen einzigen
Verwalter. Sonst ist der spätere Einbau ein Datenumbau statt einer Ergänzung.*

**Bestätigt zur Umsetzung: F1, F2, F3, F4, F9, F10, F16.**

### Noch zu klären, ausdrücklich vertagt
- **Was nach der erfolgreichen Verifizierung passiert** — welche Rechte die
  beanspruchte Seite bekommt, was der Beansprucher an der Unterseite ändern darf
  und was redaktionell/aus der Datenbank unverändert bleibt. *(Christian: „den
  Schritt danach klären wir dann nochmal am Ende.")*
- **Der Rückkanal bei Seiten** (Reaktionen, Kommentare, Kontaktformular) —
  genaue Funktionen später (F11).
- Alle übrigen Features unten ohne Häkchen.

### Erledigt und damit gegenstandslos
- **F14 (Brücke „Auf MovieMatch: @name")** entfällt. Sie war die Notlösung für
  die Auffindbarkeit unter der Trennungsvorgabe; durch das Beanspruchen **ist**
  die Datenbankseite die Seite, also gibt es nichts mehr zu verbrücken.
  Die Nummer wird nicht neu vergeben.
- Die Entscheidungen **E5** (Brücke) und **E6** (ob Sonderprofile überhaupt,
  welche Verifizierung) sind damit beantwortet.

### Was aus dem Beanspruchen technisch folgt — zur Kenntnis, nicht zur Entscheidung
1. **Zwei Wege zur Seite, nicht einer.** Schauspieler, Regie und Kinos haben eine
   Unterseite zum Beanspruchen. Verleih, Festival und Marke haben keine — für sie
   braucht es zusätzlich das gewöhnliche **Neuanlegen** einer Seite. Beides gehört
   in F9.
2. **Die Unterseite bekommt zwei Schichten.** Unten die unveränderten
   Datenbank-Inhalte (Biografie, Filmografie, Kinodaten), darüber die Schicht der
   beanspruchten Seite. Welche Schicht wie weit reicht, ist genau die oben
   vertagte Frage.
3. **Der Beanspruchen-Knopf steht auf öffentlichen, indexierten Seiten.** Er ist
   damit zugleich der Vertriebskanal für Sonderprofile — jede über Suchmaschinen
   gefundene Personen- oder Kinoseite bewirbt sich selbst. *Das ist der stärkste
   Nebeneffekt dieser Entscheidung und der Grund, warum sie besser ist als die
   vorherige Fassung.* Voraussetzung ist, dass die SEO-Seiten Zulauf haben —
   woran gerade ohnehin gearbeitet wird (`UEBERGABE-SEO.md`).
4. **Indexierung beachten:** Die Regel „indexierbar nur mit eigenem Inhalt"
   (`backend/lib/seoData.js`, `indexierbar` nie hart auf `true`) gilt weiter.
   Inhalte einer beanspruchten Seite dürfen diese Regel nicht aushebeln.
5. **Persönlichkeitsrecht bleibt der heikelste Punkt** (Abschnitt 4). Die
   manuelle Prüfung ist bei kleiner Anzahl die richtige Wahl; sie muss aber
   dokumentiert ablaufen (wer hat wann anhand welcher Nachweise freigegeben).

---

## Vorgeschichte der Vorgaben

Christian am 19. August, in zwei Runden:

1. Sonderprofile sind **kein Prestige-Abzeichen, sondern ein
   Schutzmechanismus.** Ein Schauspieler bekäme sonst tausend Nachrichten am Tag.
   Deshalb gilt für sie eine andere Beziehungsart: **man folgt ihnen einseitig**,
   niemand kann sie anschreiben.
2. Zwischen normalen Konten gilt **Vernetzung**: beidseitig bestätigt, beide
   folgen einander, und danach können sie einander schreiben.
3. Seiten **werden** die bestehenden Unterseiten, per Beanspruchen (Abschnitt 0).

Aufwandseinheiten: **Abend** = 3–4 h · **Tag** = ein Arbeitstag · **Woche** = 5
Arbeitstage. Enthalten ist jeweils der Aufschlag für zwei Projekt-Eigenheiten:
das Frontend ist **eine Datei** (`index.html`, 804 KB), und jeder sichtbare Text
existiert **siebenmal** (de, en, fr, es, it, nl, pt ab `index.html:2100`) — grob
ein halber Tag je mittlerem Feature allein für Übersetzungen.

---

## 1. Das Beziehungsmodell

| | **Konto** (Mensch, privat) | **Seite** (Sonderprofil) |
|---|---|---|
| Wer | normaler Nutzer | Filmschaffende, Kino, Verleih, Festival, Marke |
| Entsteht durch | Registrierung wie heute | **Beanspruchen** einer Unterseite (Person, Kino) oder Neuanlegen (Verleih, Festival, Marke) — jeweils mit manueller Prüfung |
| Verwaltet von | sich selbst | **einem Konto** (mehrere später, Datenmodell trotzdem n:m) |
| Beziehung | **Vernetzung**: beidseitig bestätigt | **Folgen**: einseitig, ohne Rückfrage |
| Wer sieht was | nach Sichtbarkeitsstufe (F3) | Follower sehen die Beiträge der Seite |
| Nachrichten | untereinander möglich (F5) | **empfängt keine** — das ist der Zweck |
| Sendet | an Vernetzte | an alle Follower (F11/F12) |
| Anzahl | Vernetzungen begrenzt (Vorschlag: 500) | Follower unbegrenzt |

**Der Rückkanal** — Funktionen später zu klären (F11), Möglichkeiten in
aufsteigender Belastung:
- *Reaktionen* (Emoji unter einem Beitrag): kostet nichts, keine Moderation.
- *Kommentare je Beitrag ein-/abschaltbar*, standardmäßig **aus**: Der Absender
  entscheidet, ob er sich das antut. Löst den Rechtsblock in Abschnitt 4 aus.
- *Kontaktformular mit harter Drosselung* (z. B. 3 Anfragen je Nutzer und Monat),
  in einen gesonderten Eingang, nicht in den Chat.

### Die Ausgangslage, die man nicht wegplanen kann
Am 14. August: **9 Konten** (`IDEEN-WACHSTUM.md`). Daraus folgt die Auswahlregel,
die diesen Plan durchzieht:

> **Nur bauen, was schon bei einem oder zwei Nutzern Wert stiftet.** Alles mit
> „Feed", „Community", „Entdecken" braucht vier- bis fünfstellige Zahlen, sonst
> entstehen leere Räume — und leere Räume schaden mehr als fehlende.

Für Seiten gilt das nur eingeschränkt, seit sie über den Beanspruchen-Knopf auf
indexierten Seiten selbst um ihre Betreiber werben (Abschnitt 0, Punkt 3).
Für den **Verkauf** an Kinos (F16) gilt es weiterhin uneingeschränkt: Ein Kino
zahlt nicht für Zugang zu 9 Nutzern — kostenlos beanspruchen lassen ist der
richtige Einstieg, Geld später.

---

## 2. Was schon da ist

| Baustein | Zustand | Rolle im Plan |
|---|---|---|
| `user_links` (symmetrisch), `user_link_invites` | live | Wird zur **Vernetzung** (F3) — muss um Folgen und Stufen erweitert werden |
| `users.display_name` | live | Anzeigename da, kein Avatar, keine Bio, kein Handle |
| **`personen_cache`, `ladePersonSeite()`** (`backend/lib/seoData.js:476`) | live | **Die zu beanspruchenden Personenseiten** — Foto, Biografie, Filmografie, indexierbar |
| **`kinos`, `user_kinos`, `plz`, `cinema_cache`** | live | **Die zu beanspruchenden Kinoseiten** + Ortsbezug für F15 |
| Taste-Score, **im Browser** gerechnet | live | Grundlage für Werbung ohne Datenabfluss (F17) |
| Movie Night | gebaut, `display:none` | Stärkster Verbreitungsloop, ausgeschaltet — gehört zu F7 |
| Teilen-Bild mit QR, `titel_momentaufnahmen` | live | Fertige Grundlage für F2 |
| `wochenendmail.js`, `benachrichtigung.js` | gebaut, Versand wartet auf Freigabe | Broadcast-Kanal per Mail vorhanden (F12) |
| `seo_content` mit `bereich`-Prüfung | live | Personen fehlen dort noch als Bereich — beim Seitenausbau mitdenken |
| `b2b_deals`, `marketing_spend`, `kpi_snapshots` | live | B2B ist in der Buchhaltung schon vorgesehen |

### Vier Schwächen des heutigen Einladens
1. **Alles oder nichts.** Die Einladung sagt (`index.html:2180`): Wer den Link
   öffnet, sieht *die ganze Watchlist, die Gesehen-Liste und alle Sterne*. Für
   die Schwiegermutter dieselbe Offenheit wie für die Partnerin.
2. **Kein Gesicht.** Ein Name ohne Bild, ohne Geschmack, ohne Anlass.
3. **Kein Anlass danach.** Ist die Verknüpfung hergestellt, passiert nie wieder
   etwas von selbst, und man kann einander nichts sagen. *Das ist die teuerste
   Lücke* — eine Verbindung ohne wiederkehrende Anlässe ist tot.
4. **Versteckt.** „Personen einladen" liegt im Menü rechts oben
   (`index.html:1314`), Movie Night ist ganz aus.

---

## 3. Marktlage, kurz (Recherche August 2026)

- **Letterboxd** (26 Mio. Nutzer) verkauft Verleihern Werbung mit
  Geschmacks-Targeting und ist mit dem *Video Store* selbst in die Distribution
  eingestiegen. Das Creator-Format, das dort trägt, ist die **kuratierte Liste**
  (Scorsese, Sean Baker) — nicht der Statusbeitrag. Für F13 relevant.
- **Community Center** baut gerade ein „Letterboxd für Audience Development" —
  der B2B-Bedarf ist real und wird von anderen gerade besetzt.
- **A24** zeigt die Gegenrichtung: Große Marken bauen eigene Communities
  (Mitgliedschaft *AAA24* mit Kinogutschein, Guthaben, Merch, Zine).
  **Erreichbar für MovieMatch sind darum nicht Studios**, sondern die ohne eigene
  Reichweite: einzelne Kinos, Festivals, kleine Verleiher, Nachwuchsregie —
  genau die Gruppe, die der Beanspruchen-Knopf abholt.
- **Ticketprovisionen:** Im Eventim-Modell 20 % der Netto-Vorverkaufsgebühr, die
  bei ~8–10 % des Ticketwerts liegt → **~1,6–2 % vom Ticketpreis**, rund 20 € je
  1.000 € Tickets. Kinoheld gehört mehrheitlich zu Eventim. Nutzwert, kein
  Geschäftsmodell.
- **Push:** Web-Push läuft auf iOS auch in der EU (Apple hat die Abschaltung 2024
  zurückgenommen), aber **nur für über „Zum Home-Bildschirm" installierte
  Web-Apps** — nie im normalen Safari-Tab. Auf Android und Desktop regulär.
- Wettbewerber in der Nische: **Serializd** (Diskussion, Präsentation),
  **Trakt** (technisch stark, sozial schwach), **Matinee** (Freundes-Feed,
  geteilte Watchlists). **Ort und Kino bespielt keiner von ihnen ernsthaft.**

---

## 4. Der Kostenblock, den man beim Brainstormen vergisst

Solange Inhalte **privat** bleiben (Nachrichten, Gruppen, Vernetzten-Aktivität)
oder von **verifizierten Seiten** stammen, bleibt die Betriebslast klein.
Sobald **öffentliche nutzergenerierte Inhalte** entstehen — offene Kommentare
(F11-Variante), öffentliche Listen (F13), Kritiken — wechselt MovieMatch die
Rechtsklasse:

- **DSA Art. 16:** leicht zugängliches elektronisches Meldeverfahren an *jedem*
  Inhalt, nicht ein Formular irgendwo.
- **DSA Art. 17:** begründete Entscheidung an den Betroffenen bei Entfernung.
- Für Klein- und Kleinstunternehmen entfällt ein Teil der weitergehenden
  Pflichten (Kapitel III Abschnitt 3). **Wo die Grenze genau verläuft, gehört in
  die laufende Anwaltsprüfung** — die Quellenlage widerspricht sich, das
  beantwortet man nicht aus Blogtexten.
- **Jugendschutz** (JMStV), sobald Fremde Inhalte für Fremde erzeugen.
- **Beanspruchen und Verifizierung (F10) sind rechtlich der heikelste Punkt.**
  Eine fälschlich freigegebene Seite unter fremdem Namen ist Identitätsmissbrauch
  mit Persönlichkeitsrechtsfolgen — und sie steht auf einer indexierten Seite.
  Die manuelle Prüfung muss dokumentiert ablaufen: wer hat wann anhand welcher
  Nachweise freigegeben, und wie wird eine Freigabe wieder entzogen.
- **Werbung (F12/F17):** Einwilligung je Absender, Abmeldung in jeder Nachricht,
  Kennzeichnungspflicht bei bezahlten Empfehlungen.
- **Laufende Moderation** ist kein Einmalaufwand, sondern dauerhafte Wochenzeit.

---

## 5. Die Featureliste

Je Feature: Aufwand · ab wie vielen Nutzern es Wert stiftet · Haken.
**✅ = von Christian am 19. August bestätigt.** Nummern sind stabil.

### Block A · Fundament

**✅ F1 · Profil mit Gesicht.** Avatar + eine Zeile Bio + Lieblingsgenres, dazu
der bestehende Anzeigename. Ausdrücklich **ohne Foto-Upload**: Emoji oder
Initiale auf frei wählbarer Farbe — spart Speicher, Bildmoderation,
DSGVO-Fragen und Missbrauch. *Hinweis: Für **Seiten** wird ein echtes Bild
irgendwann unvermeidlich sein (ein Kino ohne Logo wirkt unfertig); das ist Teil
der vertagten Frage „was darf eine beanspruchte Seite".*
*1–2 Tage · ab 2 Nutzern · geringes Risiko.*

**✅ F2 · Geschmacks-Visitenkarte.** Teilbares Bild: „Mein Filmprofil — 68 %
Krimi, 2010er, Top 5 des Jahres". Bild-und-QR-Infrastruktur existiert. **Social
nach außen, ganz ohne Netzwerk innen.**
*2–3 Abende · ab 1 Nutzer · kein Risiko.* Bestes Aufwand-Nutzen-Verhältnis.

**✅ F3 · Beziehungsmodell: Vernetzung + Folgen + Sichtbarkeitsstufen.**
`user_links` bekommt eine Art (vernetzt / folgt / folgt Seite) und eine Stufe.
Drei Stufen statt heute einer: *Enger Kreis* (alles, wie heute) · *Vernetzt*
(Match-Ergebnis, veröffentlichte Listen, keine Einzelbewertungen) · *Folgt*
(nur ausdrücklich Veröffentlichtes, einseitig). Betrifft `/api/links`,
`/api/links/progress`, die Match-Berechnung und die halbe Oberfläche.
*4–6 Tage · ab 2 Nutzern · greift überall; später nachrüsten kostet das
Doppelte.* **Muss vor allem anderen Sozialen stehen.**

**✅ F4 · Handle und Personensuche** (`@name`). Für Seiten von Anfang an nötig.
Für Privatkonten standardmäßig **nicht auffindbar** — Auffindbarkeit nur als
ausdrückliches Opt-in, sonst ist es ein Datenschutz-Rückschritt.
*2–3 Tage · für Seiten sofort, für Konten ab ~500 Nutzern.*

### Block B · Reden

**F5 · Nachrichten zwischen Vernetzten.** 1:1, nur nach beidseitiger Bestätigung
— dadurch strukturell kein Belästigungsproblem. Abruf per Polling reicht, kein
WebSocket. Blockieren und Melden gehört dazu.
*1 Woche · ab 2 Nutzern · mittleres Risiko.* Schließt Lücke 3 aus Abschnitt 2.

**F6 · Titel anhängen.** Eine Nachricht mit angehängtem Titel: „Den Donnerstag?"
samt Plakat, Score und Verfügbarkeit; ein Fingertipp legt ihn beiden auf die
Liste oder startet eine Movie Night. *Das* ist der Unterschied zu WhatsApp.
*2–3 Tage auf F5 · ab 2 Nutzern.* **F5 ohne F6 nicht bauen.**

**F7 · Gruppen + Gruppenfaden.** Feste Runden statt Personenwahl je Sitzung:
„Familie", „WG", „Donnerstagsrunde". Match und Movie Night werden
Gruppenfunktionen — und **Movie Night wird eingeschaltet**.
*1 Woche · ab 3 Nutzern · geringes Risiko.*

**F8 · Web-Push.** VAPID, Abo-Tabelle, Versandweg, Einstellungen je Kategorie.
Auf iOS nur nach „Zum Home-Bildschirm" — der Hinweis muss sauber in die
Oberfläche, sonst wirkt es kaputt.
*3–5 Tage · ab 1 Nutzer · verschiebt oder erspart Aufwand aus
`PLAN-NATIVE-APPS.md`.*

### Block C · Seiten (Sonderprofile)

**✅ F9 · Seiten-Infrastruktur.** Kontoart „Seite"; Zuordnung Konto ↔ Seite
(Datenmodell n:m, Oberfläche vorerst ein Verwalter); Seitentypen
(Filmschaffende / Kino / Verleih / Festival / Marke); **zwei Entstehungswege** —
Beanspruchen einer Unterseite (Person, Kino) und Neuanlegen (Verleih, Festival,
Marke); Folgen einseitig, **kein Nachrichteneingang**; Follower-Zählung;
Umschalter „Ich schreibe gerade als …".
*4–6 Tage · ab 1 Seite · Haken: Die zwei Entstehungswege sind der Mehraufwand
gegenüber der vorigen Fassung; die eingesparten Team-Rollen gleichen ihn etwa
aus.*

**✅ F10 · Beanspruchen und Verifizierung.** Knopf „Diese Seite beanspruchen" auf
jeder unbeanspruchten Personen- und Kinoseite → Dialog „Bist du *[Name]*?
Beanspruche diese Seite." → Antragsformular (Kontaktweg, Nachweis) → **manuelle
Prüfung und Freigabe durch Christian** über eine einfache Verwaltungsansicht;
danach verschwindet der Knopf. Protokoll je Freigabe (wer, wann, welcher
Nachweis) und ein Weg, eine Freigabe wieder zu entziehen.
*3–4 Tage · Risiko **hoch**, siehe Abschnitt 4 — kein automatisches Verfahren
zum Start, das ist bei kleiner Anzahl die richtige Wahl.*
*Offen und bewusst vertagt: was die Seite nach der Freigabe darf.*

**F11 · Beiträge einer Seite.** Text, Bild, verlinkter Titel, Termin. Erscheinen
bei Followern und auf der Seite. Rückkanal gestuft (Abschnitt 1), genaue
Funktionen noch zu klären.
*1 Woche (nur Reaktionen) bzw. 1,5–2 Wochen (mit Kommentaren + Moderation) ·
ab 1 Seite.*

**F12 · Broadcast per Push und Mail.** Kombination aus F8 + Wochenendmail.
Rechtlich: Das Folgen ist die Einwilligung — im Bestätigungstext ausdrücklich
benennen und protokollieren; Abmeldung in jeder Nachricht; **Frequenzobergrenze
hart im Code** (Vorschlag: höchstens eine Nachricht je Seite und Woche).
*3–4 Tage auf F8 · Haken: Abmahnrisiko bei schlampiger Einwilligung — in die
Anwaltsprüfung geben.*

**F13 · Kuratierte Listen.** „Die zehn Filme, die mich geprägt haben." Laut
Recherche das Creator-Format, das auf Filmplattformen wirklich trägt; zugleich
ein normales Nutzerfeature und SEO-Futter (`bereich='bestenliste'` existiert
bereits in `seo_content`). Deckt „Merkzettel-Kategorien/Tags" aus `IDEEN.md` ab.
*1–1,5 Wochen · ab 1 Nutzer (als Ordnungsmittel) · Haken: sobald öffentlich,
greift Abschnitt 4.*

**~~F14~~ · entfallen.** Brücke „Auf MovieMatch: @name" — durch das Beanspruchen
gegenstandslos (Abschnitt 0). Nummer wird nicht neu vergeben.

### Block D · Kino, Ort, Geld

**F15 · „Ins Kino mit …"** Watchlist × aktuelles Kinoprogramm × vernetzte Person:
„*Der neue Villeneuve steht bei dir und bei Anna auf der Liste und läuft
Donnerstag im Cineplex, 4 km von euch.*" Streaming-Dienste können das strukturell
nicht, Letterboxd hat den Ortsbezug nicht, die Kinos haben die Geschmacksdaten
nicht. Alle Bausteine existieren.
*3–5 Tage · ab 2 Nutzern · Haken: hängt an der Kinodatenqualität — heute „alles
der letzten 60 Tage" statt echter Spielpläne; echte Zeiten kosten 149 €/Monat,
siehe `PLAN-KINOS.md`.* **Der einzige Weg, „Leute ins Kino bringen" ohne
B2B-Vertrieb.**

**✅ F16 · Kino-Seiten.** Seitentyp aus F9, entstanden durch Beanspruchen des
bestehenden Kinoeintrags: Sneak-Termine, Reihen, Wiederaufführungen — an die
Menschen, die dieses Kino als „mein Kino" gewählt haben (`user_kinos` existiert).
*1 Woche auf F9/F10 · Haken: **zum Start kostenlos.** Ein Kino zahlt nicht für
Zugang zu 9 Nutzern; Geld erst, wenn regional vierstellige Zahlen stehen.
`b2b_deals` ist dafür schon in der Buchhaltung vorgesehen.*

**F17 · Bezahlte Empfehlung ohne Datenabfluss.** Ein Verleih bucht einen Titel
für ein Geschmacksprofil („mag skandinavische Krimis"). **Die Auswahl passiert im
Browser** — der Taste-Score wird ohnehin lokal gerechnet. Der Verleih erfährt
nie, wer das war, und bekommt nur Einblendungs- und Klickzahlen. Genau das, was
Letterboxd verkauft, nur ohne die Datenseite.
*1 Woche Technik · ab ~5.000 aktiven Nutzern verkaufbar · Haken:
Kennzeichnungspflicht, und die Position „keine Werbung" wird angefasst.*

**F18 · Verweise auf Shop und Tickets.** Gekennzeichneter Verweis von der Seite
auf den eigenen Shop, später mit Partnerkennung; „Karten kaufen" aus F15 heraus.
**Kein eigener Merch-Shop** — Lager, Retouren, Steuer, Kundendienst sind ein
zweites Unternehmen.
*1–2 Abende · geringes Risiko · Ertrag bei Tickets ~1,6–2 % (Abschnitt 3).*

**F19 · Was deine Leute treiben.** Kein öffentlicher Feed — eine ruhige Liste im
Profil und gebündelt in der Wochenendmail: „Anna: 5 Sterne für *Anatomie eines
Falls*", „Ihr habt drei gemeinsame neue Titel."
*2–3 Tage · ab 3–4 Vernetzten · gering, solange es sich an F3 hält.*

### Block E · Datenbank, nicht Social

**F20 · Personen und Titel beobachten.** „Sag mir Bescheid, wenn von dieser Regie
etwas Neues kommt / in dein Kino kommt / streambar wird." Kein Profil, kein
Absender, keine Beziehung — eine reine Merkfunktion auf Datenbankseiten. Braucht
einen wöchentlichen TMDB-Abgleich, aber nur der beobachteten Personen.
*3–4 Tage · ab 1 Nutzer · geringes Risiko.*
*Abzugrenzen von F9/F10: „beobachten" (Datenbank, immer möglich) ist etwas
anderes als „folgen" (einer beanspruchten Seite). Auf einer beanspruchten Seite
stehen beide Knöpfe nebeneinander — die Benennung muss das tragen.*

### Wovon ich abrate
- **Direktnachrichten an Fremde** und **Nachrichteneingang bei Seiten** — genau
  das Problem, das dieser Entwurf lösen soll.
- **Öffentlicher Entdecken-Feed** — Nutzen ab ~5.000 Aktiven, vorher ein leerer
  Raum.
- **Eigener Merch-Shop** — ein zweites Unternehmen, kein Feature.
- **Studios und große Marken als Zielgruppe** — sie bauen eigene Communities.
- **Automatische Verifizierung zum Start** — bei den zu erwartenden Stückzahlen
  teurer und riskanter als die manuelle Prüfung.

---

## 6. Reihenfolge nach dem Entscheidungsstand

Bestätigt sind **F1, F2, F3, F4, F9, F10, F16** — zusammen etwa **4–5 Wochen**.
Empfohlene Abfolge, weil sie technisch aufeinander aufbauen:

1. **F3** (4–6 Tage) — Fundament, muss zuerst; alles Weitere hängt daran.
2. **F1** (1–2 Tage) und **F2** (2–3 Abende) — sofort sichtbarer Gewinn,
   unabhängig von der Nutzerzahl.
3. **F4** (2–3 Tage) — Voraussetzung dafür, dass Seiten auffindbar sind.
4. **F9** (4–6 Tage) — Seiten-Infrastruktur mit beiden Entstehungswegen.
5. **F10** (3–4 Tage) — Beanspruchen und manuelle Freigabe.
   *Vor diesem Schritt steht die vertagte Klärung „was darf eine beanspruchte
   Seite" — sonst wird etwas freigegeben, dessen Umfang niemand definiert hat.*
6. **F16** (1 Woche) — Kino-Seiten als erster echter Seitentyp.

**Noch nicht entschieden und deshalb nicht eingeplant:** F5, F6, F7, F8, F11,
F12, F13, F15, F17, F18, F19, F20. Zwei Hinweise dazu:
- **F11 fehlt in der bestätigten Liste.** F9/F10/F16 erzeugen Seiten, die
  beansprucht werden können — aber noch nichts senden. Für einen ersten
  Praxistest mit einem Kino wäre mindestens die einfachste Form von F11 nötig.
- **F8** (Push) und **F12** sind die Voraussetzung dafür, dass ein Beitrag
  irgendwo ankommt; ohne sie erreicht eine Seite ihre Follower nur, wenn diese
  von selbst vorbeischauen.

---

## 7. Zu entscheiden — Stand

**Beantwortet:** Konten/Seiten ja · Seiten = beanspruchte Unterseiten ·
manuelle Verifizierung · ein Verwalter je Seite (mehrere später) ·
F14 entfällt · Umsetzung von F1, F2, F3, F4, F9, F10, F16.

**Offen:**
- **E1 — Sichtbarkeitsstufen (F3):** drei Stufen wie beschrieben, oder nur zwei
  (vernetzt / folgt) ohne „engen Kreis"? *Wird für F3 gebraucht.*
- **E2 — Nachrichten (F5/F6):** bauen? Und wenn ja, nur mit Titelanhang?
- **E4 — Rückkanal bei Seiten (F11):** Reaktionen · Kommentare abschaltbar ·
  Kontaktformular mit Drosselung · nichts. *Vertagt.*
- **E7 — Öffentliche Nutzerinhalte** (F13, F11-Kommentare): überhaupt — ja, nein,
  später? Diese eine Antwort entscheidet über den ganzen Abschnitt 4.
- **E8 — Movie Night** mit F7 einschalten oder vorher?
- **E9 (neu) — Rechte einer beanspruchten Seite:** was darf sie an der Unterseite
  ändern, was bleibt Datenbank/Redaktion? *Von Christian ausdrücklich ans Ende
  gestellt — aber vor F10 nötig.*
- **E10 (neu) — Seitentypen ohne Unterseite:** Verleih, Festival, Marke zum Start
  schon zulassen (Neuanlegen) oder erst Personen und Kinos?

---

## Quellen der Recherche

- Letterboxd — [letterboxd.com](https://letterboxd.com/) · [Screen Daily zur Rolle in der Branche](https://www.screendaily.com/features/weve-elbowed-our-way-into-the-industry-charting-the-rise-of-cinephile-social-platform-letterboxd/5191962.article) · [TechCrunch zum Video Store](https://techcrunch.com/2025/11/20/letterboxd-to-launch-new-movie-rental-feature-in-december) · [Filmmaker Magazine zum Indie-Marketing](https://filmmakermagazine.com/127289-letterboxd-independent-film-marketing/)
- [IndieWire: Community Center als „Letterboxd für Audience Development"](https://www.indiewire.com/news/analysis/community-center-letterboxd-audience-development-1235171484/)
- Wettbewerber — [Achriom: beste Tracking-Apps 2026](https://www.achriom.com/blog/best-movie-tracking-apps/) · [Moviebase vs. Serializd](https://moviebase.app/resources/moviebase-vs-serializd)
- [A24-Mitgliedschaft AAA24](https://printandpromomarketing.com/article/how-a24s-membership-program-appeals-to-end-users/) · [Direct-to-fan](https://en.wikipedia.org/wiki/Direct-to-fan)
- Ticketing — [Eventim-Partnerprogramm bei Awin](https://ui.awin.com/merchant-profile/11388) · [CTS Eventim zur Kinoheld-Beteiligung](https://corporate.eventim.de/en/news-media/news/cts-eventim-invests-in-kinoheld-inroads-now-also-made-into-cinema-ticketing-in-germany/)
- Push — [MagicBell: PWA/iOS-Grenzen 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) · [Apple nimmt EU-Abschaltung zurück](https://pushalert.co/blog/apple-reverses-decision-will-continue-to-support-home-screen-web-apps-in-the-eu/)
- DSA — [Art. 16 Melde- und Abhilfeverfahren](https://gesetz-digitale-dienste.de/dsa/artikel-16/) · [Kanzlei Plutte: DSA-Guide](https://www.ra-plutte.de/dsa/) · [IHK München](https://www.ihk-muenchen.de/ratgeber/recht/internetrecht/dsa-regulierung-von-plattformen/)
