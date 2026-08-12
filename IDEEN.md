# Ideen-Speicher — für später vermerkt

> Stand 12. August 2026. Gesammelt aus der Internationalisierungs-Session;
> Christian hat entschieden, was sofort gebaut wird (siehe Commits) und was
> hier für später liegt. Bewusst zurückgestellte RECHTSTHEMEN stehen nicht
> hier, sondern in PLAN-INTERNATIONALISIERUNG.md (Abschnitt 4/5) und
> UEBERGABE-OFFEN.md.

## Bedienung / Produkt

- **Eigene Titel verschwinden bei Community-Sortierung** (UEBERGABE-OFFEN.md
  3.4, gemessen: 0 von 25 sichtbar). Christian am 12. August: ignorieren.
  Bleibt hier vermerkt, falls es Nutzer-Meldungen dazu gibt.
- **Gruppen statt 1:1-Verknüpfungen** („Familien-Watchlist", Match über feste
  Gruppen statt Personenauswahl je Sitzung).
- **Taste-Score erklärbarer machen** („passt wegen: Krimi, Regie X, 2010er")
  und optional Freundes-Bewertungen einfließen lassen.
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
- **Streaming-Lauf je Region beschleunigen** (Titel-Details nicht je Region
  erneut von TMDB holen) — würde die Gruppen-Rotation der Workflows
  überflüssig machen; tägliche Frische für alle 40 Regionen.
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

## Bewusst NICHT verfolgt

- **Affiliate-Links** (Amazon & Co.): brächte Einnahmen, machte die App aber
  kommerziell — kippt die gesamte bewusst einfache Rechtslage (Impressum,
  Datenschutz, Steuern). Nur mit Anwalt anfassen.
