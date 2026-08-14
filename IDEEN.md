# Ideen-Speicher — für später vermerkt

> Wachstums- und Bindungs-Vorschläge (Analyse der Mechanismen erfolgreicher
> Tech-Produkte, priorisierte Reihenfolge) stehen gesondert in
> `IDEEN-WACHSTUM.md` — mehrere Ideen von hier sind dort eingeordnet.

> Stand 12. August 2026. Gesammelt aus der Internationalisierungs-Session;
> Christian hat entschieden, was sofort gebaut wird (siehe Commits) und was
> hier für später liegt. Bewusst zurückgestellte RECHTSTHEMEN stehen nicht
> hier, sondern in PLAN-INTERNATIONALISIERUNG.md (Abschnitt 4/5) und
> UEBERGABE-OFFEN.md.

## Bedienung / Produkt

- **Inhaltssuche über die Kurzbeschreibungen** (13. August besprochen,
  Vorschlag liegt vor): Die Plots sind bewusst NICHT im Browser (13 MB,
  siehe UEBERGABE-OFFEN 3.6) — eine thematische Suche bräuchte einen
  Server-Endpunkt (`/api/suche`, Postgres-Textindex über `plot`/
  `overview_en`/`uebersetzungen` je Sprache, Rate-Limit) und würde die
  Treffer gekennzeichnet ANS ENDE der Liste mischen („aus der
  Beschreibung"), damit sie die präzisen Titeltreffer nicht verwässern.
  Aufwand ~ein Abend. Teilweise decken das heute die Schlagwörter ab.
- **„Diese Titel teilen" (Momentaufnahme)**: Ansicht-Links übertragen
  Einstellungen, keine Inhalte — eine vierte Teilen-Option könnte die
  konkret angezeigten Titel per Kennungen mitgeben (unabhängig von den
  Markierungen des Empfängers). Vorgeschlagen, nicht entschieden.

- **Eigene Titel verschwinden bei Community-Sortierung** (UEBERGABE-OFFEN.md
  3.4, gemessen: 0 von 25 sichtbar). Christian am 12. August: ignorieren.
  Bleibt hier vermerkt, falls es Nutzer-Meldungen dazu gibt.
- **Gruppen statt 1:1-Verknüpfungen** („Familien-Watchlist", Match über feste
  Gruppen statt Personenauswahl je Sitzung).
- ~~Taste-Score erklärbarer machen~~ — **umgesetzt am 14. August 2026**
  (Info-Popup am Score-Schildchen nennt die konkreten Gründe je Titel).
  Offen bleibt nur der zweite Teil der Idee: optional Freundes-Bewertungen
  einfließen lassen.
- **Jahresrückblick / Statistiken** („dein Filmjahr": gesehene Titel, Genres,
  Sterne-Verteilung) — auch als Teilen-Anlass.
- **Merkzettel-Kategorien/Tags** auf der eigenen Watchlist.

## Reichweite / Betrieb

- **SEO über öffentliche Titelseiten**: geteilte `/t/…`-Seiten sind bewusst
  `noindex`; öffnen brächte Suchmaschinen-Zulauf, braucht Duplikat- und
  Datenschutz-Abwägung.
- **CDN / zweite Server-Region** für Übersee-Latenz (US/CA/AU/NZ/Lateinamerika
  ab Falkenstein spürbar) — steht auch im Plan als Betriebsfrage.
- **Externe Erreichbarkeits-Prüfung** (steht der Server, kann er sich nicht
  selbst melden) — PLAN-OEFFENTLICHER-TEST.md Abschnitt 6, bewusst vertagt.
- **Listen-Cache klüger schneiden**: /api/titles unterscheidet sich je Region
  nur im Freigabe-Feld — statt 80 vollständiger Cache-Varianten (40 Regionen
  × 2 Inhaltssprachen) ließe sich die Freigabe-Zuordnung getrennt liefern.

## Kino

- **„Läuft in deinen Kinos" (Weg B)** — PLAN-KINOS.md: Basic-Tarif 149 €/Monat
  + OSM, vorher Free-Trial zum Messen; Alternative: Anfrage bei Kinoheld
  (GraphQL, nur DE, braucht Erlaubnis). Nebeneffekt: „Aktuell im Kino" würde
  inhaltlich korrekt (heute: alles der letzten 60 Tage).
- **Spielzeiten + Ticket-Links** (299 €-Stufe) — nur falls Weg B überzeugt.

## Plattform

- **Native Apps** (PLAN-NATIVE-APPS.md): Token-Auth, Vite-Modularisierung,
  Capacitor, Stores — größter geplanter Brocken; Push-Nachrichten hängen
  daran.
- **Weitere Sprachen** nach Portugiesisch: Polnisch, Skandinavisch, Türkisch —
  je Sprache lohnender, je größer der zugehörige Markt ohne Englisch-Routine.
- **Weitere Länder** nach dem 40er-Muster: Balkan, Türkei, Asien — jeweils
  erst mit passender Sprache sinnvoll.

## Rechtstext-Nachträge (bei der Anwaltsprüfung mitgeben)

- **Benachrichtigungs-Mails** (12. August 2026 gebaut): Opt-in am Konto
  (`users.benachrichtigung`), täglicher Abgleich der Watchlist gegen
  Streaming-/Kinodaten, Versandvermerk in `benachrichtigt`. Braucht einen
  Satz in der Datenschutzerklärung (Zweck, Abbestellbarkeit, Speicherung).
- **Anonyme Trichter-Zähler** (13. August 2026 gebaut, `metrik_tage`): je Tag
  und Schritt eine blanke Zahl (Besuch, erste Markierung, Konto, zehn Titel),
  ohne Kennungen, IPs oder Zeitstempel unterhalb des Tages. Nach eigener
  Einschätzung keine personenbezogene Verarbeitung — bei der Anwaltsprüfung
  bestätigen lassen und ggf. einen Satz ergänzen.

## Bewusst NICHT verfolgt

- **Affiliate-Links** (Amazon & Co.): brächte Einnahmen, machte die App aber
  kommerziell — kippt die gesamte bewusst einfache Rechtslage (Impressum,
  Datenschutz, Steuern). Nur mit Anwalt anfassen.
