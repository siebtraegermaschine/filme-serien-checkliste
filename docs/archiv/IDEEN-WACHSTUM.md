# Wachstum und Bindung — Analyse und Vorschläge

> Stand 12. August 2026. Analyse der Wachstums-Mechanismen erfolgreicher
> Tech-Produkte, übertragen auf MovieMatch. Ergänzt `IDEEN.md` (dort stehen
> bereits einzelne der genannten Ideen); nichts hiervon ist entschieden.
>
> **Umsetzungsstand 13. August 2026:** Vorschlag **A** (Onboarding als
> Spiel/Kennenlern-Strecke), **B** (Import im Einstieg) und **Abschnitt 3**
> (Messen ohne Tracking, `npm run metrik`) sind gebaut und live — Details in
> `UEBERGABE-OFFEN.md`, Abschnitt „13. August". Auch **F** (Referral messbar
> machen) ist damit erledigt: `npm run metrik` zeigt Konten gesamt, davon
> über Einladung geworben, und die Top-Werber mit Namen (`einladungen()` in
> `backend/lib/metrik.js`) — am 14. August geprüft: 9 Konten, 5 geworben,
> alle von Christian. **C** (Fortschrittsbalken zum Score), **D** (Movie
> Night reaktivieren), **E** und **G–M** stehen weiter aus.
> Zusätzlich entstanden (hier nicht geplant): der Taste-Match hinter den
> Namen, der Teilen-Knopf mit Ansicht-Links und die kombinierbare Suche.
>
> Ausgangslage, ehrlich benannt: **3 Konten** (Stand 3. August). Die Reihenfolge
> unten folgt deshalb der Trichter-Logik: erst muss der erste Besuch begeistern
> (Aktivierung), dann lohnt sich Verbreitung (Loops), dann Wiederkehr
> (Retention). Wachstums-Hebel vor einem funktionierenden Erstkontakt zu bauen
> verbrennt Reichweite — jeder Besucher, der nach 30 Sekunden geht, kommt so
> schnell nicht wieder.

---

## 1. Die Mechanismen der Erfolgreichsten — und was MovieMatch davon schon hat

Nach Mechanismus geordnet, nicht nach Firma. Die dritte Spalte ist der Punkt:
Vieles ist **schon gebaut** und muss nur geschärft oder sichtbar gemacht werden.

| Mechanismus | Vorbilder | Stand bei MovieMatch |
|---|---|---|
| **Das Produkt verbreitet sich durch Benutzung** — jeder normale Gebrauch konfrontiert Nicht-Nutzer damit | Calendly, Doodle, Loom, Zoom, WeTransfer | **Gebaut und ausgeblendet: Movie Night.** Abstimmen geht ohne Konto — jeder Teilnehmer einer Runde erlebt die App. Das ist wörtlich der Doodle-Loop. |
| **Teilbares Ergebnis-Artefakt** — das Ergebnis lässt sich vorzeigen, der Empfänger braucht nichts zu installieren | Wordle (Emoji-Raster), Spotify Wrapped, Strava-Karten | Teilen-Bild mit QR-Code existiert für Titel. Für **Match-Ergebnisse** und **Movie-Night-Ausgänge** gibt es noch kein Artefakt. |
| **Sofortiger Wert ohne Anmeldung** — Zeit bis zum Aha-Moment in Sekunden | TikTok, Google, Wordle | Halb: Stöbern geht ohne Konto (gut), aber der eigentliche Aha-Moment — der Taste-Score — braucht Konto **plus** 10 markierte Titel. |
| **Wechselkosten senken** — Daten aus dem alten Werkzeug mitnehmen | Spotify-Playlist-Import, Google Takeout | **Seit 12. August gebaut:** Letterboxd/IMDb/Trakt-Import. Er liegt aber in den Einstellungen — wo ihn ein Neuling nie sucht. |
| **Ehrlicher Fortschritt statt künstlicher Streaks** | Duolingo (Streak, Fortschrittsbalken) | Nichts. Der Leertext sagt „füge mind. 20 Titel hinzu", zeigt aber keinen Fortschritt dorthin. Filme sind kein Tagesritual — Streaks wären hier falsch, ein Fortschrittsbalken zum besseren Score nicht. |
| **Netzwerkeffekte** — Wert steigt mit jedem Freund | WhatsApp, Strava-Clubs, Letterboxd | 1:1-Verknüpfungen und Match existieren. **Gruppen** („Familien-Watchlist") stehen in `IDEEN.md`. |
| **Wiederkehr über echte Anlässe, nicht Nagging** | Netflix („neue Staffel"), Letterboxd (Release-Termine) | **Seit 12. August gebaut:** Benachrichtigungs-Mail „Watchlist-Titel jetzt verfügbar" (Opt-in). Genau der richtige Ansatz — ausbaufähig zu einem wöchentlichen Anlass. |
| **SEO-/Content-Loop** — jede Inhaltsseite ist ein Suchmaschinen-Eingang | Pinterest, IMDb, Letterboxd, Reddit | Bewusst zu: `/t/…`-Seiten sind `noindex`, robots.txt lässt nur die Startseite zu. Der größte unerschlossene Gratis-Kanal (Abwägung in `IDEEN.md`). |
| **Referral mit beidseitigem Nutzen** | Dropbox (Speicher), PayPal, Revolut | Einladungs-Infrastruktur existiert (`?ref=`-Token, `invited_by_user_id`) — wird aber **nirgends ausgewertet**, und der Navi-Einstieg ist seit 12. August ausgeblendet. |
| **„Es kennt mich"-Personalisierung als Kernversprechen** | Spotify Discover Weekly, TikTok | Der Taste-Score **ist** das Kernversprechen. Er erklärt sich aber nicht („passt wegen …" steht in `IDEEN.md`) — und was man nicht versteht, dem vertraut man nicht. |
| **Identität und Sammeln** — das Profil als Selbstdarstellung | Letterboxd-Profile, Goodreads-Regale | Nichts Öffentliches; Watchlists sind privat und nur per Verknüpfung teilbar. Bewusste Datenschutz-Entscheidung — als Positionierung nutzbar (siehe 4). |

**Die zentrale Beobachtung:** MovieMatch hat die zwei wertvollsten Loops
bereits im Code — Movie Night (Verbreitung durch Benutzung) und den Import
(Wechselkosten) — und beide sind unsichtbar: einer per `display:none`, einer in
den Einstellungen vergraben. Bevor irgendetwas Neues entsteht, gehören diese
beiden an die richtige Stelle.

---

## 2. Vorschläge, priorisiert

### Stufe 1 — Aktivierung: der erste Besuch muss den Aha-Moment liefern (Tage)

**A. Onboarding als Spiel: die Kennenlern-Strecke.**
Beim ersten Besuch (statt oder vor dem heutigen Einstieg): 15–20 sehr bekannte
Titel nacheinander, „Gesehen und gut / Gesehen und nix / Kenn ich nicht" — die
Wischgesten existieren schon. Der Taste-Score wird **lokal** gerechnet (der
Rechenweg läuft ohnehin im Browser) und sofort gezeigt: „Das hier passt zu
dir." Das Konto kommt erst, wenn jemand speichern will — das
Login-bei-Schreibaktion-Muster mit Nachholen der Aktion existiert seit dem
Relaunch-Konzept. Damit fällt die Hürde „Konto + 10 Titel vor dem ersten
Wow" auf unter eine Minute. *Das ist der wichtigste einzelne Vorschlag.*

**B. Import in den Einstieg holen.**
Im Login-/Registrierungs-Popup und in der leeren Watchlist: „Schon bei
Letterboxd, IMDb oder Trakt? Watchlist in einer Minute übernehmen." Der Import
(0.0.0.2 der Übergabe) ist gebaut und getestet — er muss nur dort stehen, wo
Umsteiger ankommen, nicht in den Einstellungen.

**C. Fortschritt zum besseren Score anzeigen.**
Statt des bloßen Leertexts („füge mind. 20 Titel hinzu"): ein Balken „12 von
20 — dein Taste-Score wird gerade genauer". Ehrlich (die Schwellen 10/20
existieren wirklich, siehe Übergabe 3.5), billig, und es gibt dem Markieren
ein Ziel. Duolingos Lehre, ohne den Streak-Kitsch.

### Stufe 2 — Verbreitung: die gebauten Loops einschalten (Tage bis Wochen)

**D. Movie Night reaktivieren — als Wachstumsfunktion, nicht als Feature.**
Der Knopf ist `display:none` (Übergabe 3.8). Vor dem Einschalten zwei
Ergänzungen, die aus der Abstimmung einen Loop machen:
- Am Ende der Abstimmung (und im Zwischenstand) ein Abbinder für Teilnehmer
  ohne Konto: „Erstell deine eigene Movie Night" / „Finde heraus, was zu dir
  passt" → führt in die Kennenlern-Strecke (A).
- Das Ergebnis („Gewonnen hat: …") als teilbares Bild — die
  Teilen-Bild-Infrastruktur (Story-Bild, QR) existiert.
Jede Runde mit 4 Teilnehmern sind 3 Kontakte mit Nicht-Nutzern, im
richtigen Moment (man sucht gerade gemeinsam einen Film).

**E. Match-Ergebnis teilbar machen (das Wordle-Prinzip).**
Nach einem Abgleich: „Unser Match: 87 % — Top-Titel: …" als Bild/Text zum
Teilen, ohne dass der Empfänger etwas braucht. Der Name der App ist
MovieMatch — das Match-Ergebnis ist das natürliche Artefakt der Marke.

**F. Referral messbar machen, bevor man ihn bewirbt.** *(Umgesetzt — mit dem
Messen-Block vom 13. August: `npm run metrik` zeigt geworbene Konten und
Top-Werber. Offen bleibt nur die Belohnungs-Diskussion, falls der Kanal
trägt.)*
`invited_by_user_id` wird geschrieben und nie gelesen. Eine einfache
Auswertung (wie viele Konten kamen über Einladungen, von wem) kostet einen
Abend und beantwortet, ob der Kanal überhaupt trägt — vor jeder Belohnungs-
Diskussion. Eine Dropbox-artige Belohnung braucht eine kostenlose App ohnehin
nicht zwingend; sozialer Anlass (Movie Night, Match) schlägt hier Rabatt.

### Stufe 3 — Wiederkehr: Anlässe statt Erinnerungen (Wochen)

**G. Der Freitags-Anlass.** *(Gebaut am 14. August 2026 — als
DONNERSTAGS-Mail mit Kino-Abschnitt Donnerstag bis Sonntag, siehe
`backend/lib/wochenendmail.js`. Der automatische Versand wartet auf
`WOCHENEND_MAIL_AKTIV=1` — Freigabe durch Christian steht aus.)*
Die Benachrichtigungs-Infrastruktur (0.0.0.3) kann mehr als „Titel verfügbar":
eine wöchentliche Opt-in-Mail „Drei für dein Wochenende" — zwei aus der
eigenen Watchlist (jetzt streambar / im Kino), einer als Taste-Score-Vorschlag.
Discover Weekly hat Spotify die Gewohnheit gebaut; der Film-Rhythmus ist
wöchentlich, nicht täglich.

**H. „Dein Filmjahr" (steht in `IDEEN.md`).**
Der Wrapped-Moment: gesehene Titel, Genres, Sterne-Verteilung, „euer
gemeinsamstes Jahr" mit Verknüpften — als teilbares Bild. Saisonaler
Reichweiten-Spike im Dezember, und ein Grund, übers Jahr zu markieren
(„sonst ist dein Rückblick leer"). Vorlauf: braucht saubere Zeitstempel der
Markierungen ab jetzt.

**I. Taste-Score erklärbar machen (steht in `IDEEN.md`).** *(Umgesetzt am
14. August 2026: Das Info-Popup hinter dem Score-Schildchen nennt zuerst die
konkreten Gründe für DIESEN Titel — Genres, Schlagwörter, Besetzung, Regie,
Jahresnähe, `scoreGruende()` in `index.html`. Nur fürs eigene Einzel-Profil;
bei Abgleich und in fremden Listen bleibt die allgemeine Erklärung.)*
„Passt zu dir wegen: Krimi, den 2010ern, Regie X" — Erklärungen erhöhen
Vertrauen in die Zahl, und Vertrauen in die Empfehlung ist der Kern der
täglichen Nützlichkeit. Zugleich Differenzierung: TikTok/Netflix erklären
nichts.

**J. Gruppen (steht in `IDEEN.md`).**
„Familien-Watchlist" / feste Runden statt Personenwahl je Sitzung. Netzwerk-
Bindung: Wer in einer aktiven Gruppe ist, löscht die App nicht. Movie Night
wird damit zur Gruppenfunktion — D zuerst, J danach.

### Stufe 4 — Reichweite: die großen Entscheidungen (Monate / Geld)

**K. SEO öffnen — öffentliche Titelseiten.**
Heute `noindex` (bewusst). IMDb und Letterboxd sind fast vollständig über
Suchmaschinen groß geworden („Filmtitel + streamen/bewertung"). Der Weg:
`/t/…`-Seiten (oder eigene `/film/…`-Routen) mit sauberem Server-Rendering,
Duplikat-Abwägung gegenüber TMDB-Inhalten, keine personenbezogenen Daten.
Größter Gratis-Kanal, aber ein Projekt, kein Schalter.

**L. Native Apps → Push (PLAN-NATIVE-APPS.md).**
Mail erreicht Menschen einmal am Tag, Push im richtigen Moment („Dune 3
startet heute in deinem Kino"). Der geplante Capacitor-Weg hängt daran; für
Consumer-Retention ist Push der stärkste einzelne Kanal. Zwischenschritt
davor: Web-Push für die installierte PWA wäre ohne Stores machbar.

**M. „Läuft in deinen Kinos" (PLAN-KINOS.md).**
Die Geldentscheidung (149 €/Monat, erst Free-Trial). Realer Alltagsnutzen
erzeugt Frequenz — und es ist ein Feature, das Netflix & Co. strukturell
nicht bauen.

---

## 3. Was man dafür messen können muss

Heute gibt es (bewusst, datenschutzfreundlich) fast keine Nutzungsdaten —
damit lässt sich keiner der Vorschläge bewerten. Minimal nötig, ohne Dritte
und ohne Personenprofil:

- **Aktivierungs-Trichter:** Besuch → erste Markierung → Konto → 10 Titel.
  Als anonyme Tageszähler (Zähler je Schritt, keine Kennungen) — vier Zahlen,
  die jede Onboarding-Änderung sofort bewerten.
- **Loop-Zahlen:** Movie-Night-Runden erstellt / Teilnehmer je Runde /
  Konten daraus; Einladungen → Konten (`invited_by_user_id`, siehe F).
- **Wiederkehr:** angemeldete Konten mit Aktivität in den letzten 7/30 Tagen
  (eine SQL-Abfrage, kein Tracking).

Alles davon geht als `npm run`-Auswertung nach dem Muster von
`bewertungsstatistik.js` — bewusst ohne HTTP-Route, wie dort begründet.

## 4. Die Positionierung nicht vergessen

Die Datenschutz-Entscheidungen (kein Tracking, keine Werbung, keine
öffentlichen Profile, Mindestzahlen in Statistiken) sind gebaute Realität —
als Gegenentwurf zu den Datensammlern ist das ein **Marketing-Argument**,
kein Hindernis: „Der Filmgeschmack gehört dir." Wer K (SEO) und E/D
(Teil-Artefakte) baut, sollte diesen Satz mitnehmen — er unterscheidet
MovieMatch von jedem großen Anbieter, der dasselbe Feature hat.

## 5. Empfohlene Reihenfolge, in einem Satz je Schritt

1. **A + C** — der erste Besuch liefert den Aha-Moment ohne Konto-Hürde.
2. **B** — Umsteiger nehmen ihre Daten in einer Minute mit.
3. **D + E** — die gebauten Loops einschalten und mit Teil-Artefakten versehen.
4. **Messen (Abschnitt 3)** — parallel, sonst bleibt alles Bauchgefühl.
5. **G, I** — Wiederkehr über echte Anlässe und erklärte Empfehlungen.
6. **H im Herbst** anfangen (Filmjahr braucht Daten übers Jahr).
7. **K, L, M** — je nach Budget- und Rechtslage (Anwaltsprüfung läuft ohnehin).
