# SEO-Plan — Seitenbereiche, Keywords, Templates

> Stand 15. August 2026. Ergänzt `IDEEN-WACHSTUM.md` Vorschlag K (SEO über
> öffentliche Titelseiten). Diese Datei ist die Vorstufe zur technischen
> Umsetzung: Abschnitt 1 legt die Seitenbereiche fest, Abschnitt 2 die
> Keyword-Recherche je Bereich, Abschnitt 3 das Template (Struktur,
> Content-Bereiche, Medien, technische Vorgaben). **Nichts hiervon ist
> umgesetzt** — Reihenfolge laut Auftrag: Bereiche → Keywords → Template →
> technische Umsetzung → Content-Befüllung.
>
> Zielsprache/-markt zuerst: **Deutsch, movietaste.de**. Die App ist zwar in
> sieben Sprachen international (`PLAN-INTERNATIONALISIERUNG.md`), aber
> Suchmaschinen-Reichweite lohnt zuerst dort, wo Bestand und Community sind.
> `hreflang` für weitere Sprachen ist in Abschnitt 4 als Phase 2 vermerkt.
>
> **Umsetzungsstand 15. August 2026:** Die technische Umsetzung ist fertig
> und lokal gegen eine Wegwerf-DB Ende-zu-Ende geprüft (siehe eigener Plan
> „SEO-Seiten: technische Umsetzung", nicht Teil dieses Dokuments). Eigen­
> ständige Seiten unter `/de-de/…`, getrennt von der App; Fakten-Tabelle +
> feste Unterüberschriften (Kurzüberblick/Worum es geht/Warum sich der
> Titel lohnt/Besetzung & Stab/Ähnliche Titel/Verfügbarkeit) auf den
> Titeldetailseiten; fünf Hub-Seiten (`/filme`, `/serien`, `/kino`,
> `/streaming`, `/beste-filme`, `/beste-serien`) oben an der Pyramide;
> Breadcrumbs (sichtbar + `BreadcrumbList`-JSON-LD) auf allen Seitenarten.
> Indexierbarkeit hängt an einer eigenen `seo_content`-Zeile je Seite (kein
> TMDB-Text) — **noch nicht befüllt**. Vier Musterinhalte (Titeldetail-Ton)
> sind abgestimmt; Content-Erstellung in Blöcken ist der nächste Schritt.

---

## 0. Datengrundlage — was trägt, was fehlt

Geprüft in `backend/db/schema.sql`:

| Daten | Vorhanden | Fehlt / Einschränkung |
|---|---|---|
| Titel (Film/Serie) | `titles`: title, year, genres[], plot, rating, poster/backdrop, keywords[] | — |
| Regie/Besetzung | `director` (TEXT, **ein** Name), `cast_names` (TEXT[], **nur Namen**) | Keine Personen-Tabelle: keine TMDB-Personen-ID, kein Foto, keine Biografie, keine Filmografie-Verknüpfung außer Namensgleichheit (Kollisionsrisiko bei häufigen Namen) |
| Streaming-Verfügbarkeit | `streaming_cache` (Anbieter × Titel × Region), `watch_providers_cache` (flatrate/rent/buy je Region) | Nur die aktuell gefeaturten Anbieter im Cache, nicht alle 27.000 Titel |
| Kino | `cinema_cache` (aktuelle/kommende Starts), `kinos` (Name, Adresse, Ort, Koordinaten) | Keine Spielzeiten (siehe `PLAN-KINOS.md`) |
| Community-Bewertung | `bewertungen`/Sterne je Titel (siehe `bewertungsstatistik.js`) | Mindestzahl-Schwelle wie bei den anonymen Statistiken beachten |

**Konsequenz für Abschnitt 1:** Titel-, Genre-, Anbieter- und Kino-Städte-Seiten
sind mit Bestandsdaten sofort baubar. Personen-Seiten (Schauspieler/Regisseur)
brauchen zusätzlich einen TMDB-Personen-Abruf (Foto, Biografie, korrekte
Zuordnung über `person_id` statt Namens-String) — das ist ein eigener
Daten-Import, kein reines Template-Thema. Als Phase 1 ohne diesen Zusatzabruf
nur mit Einschränkungen machbar (siehe 1.5/1.6).

---

## 1. Seitenbereiche (Themenarchitektur)

### Kern (Phase 1 — mit Bestandsdaten baubar)

| # | Bereich | Beispiel-URL | Menge |
|---|---|---|---|
| 1.1 | Startseite | `/` | 1 |
| 1.2 | Genre-Seiten | `/filme/thriller`, `/serien/comedy` | ~20 Genres × 2 Typen |
| 1.3 | Titeldetailseiten – Film | `/film/dune-teil-zwei-693134` | ~13.000 |
| 1.4 | Titeldetailseiten – Serie | `/serie/severance-95396` | ~14.000 |
| 1.7 | Streaming-Anbieter-Seiten | `/streaming/netflix` | ~10 Anbieter |
| 1.8 | Bestenlisten / Jahres-Seiten | `/beste-filme/2024`, `/beste-serien/thriller` | Jahre × Genres, kuratiert |
| 1.9 | Kino-Städte-Seiten | `/kino/wien`, `/kino/berlin` | Städte mit Kino-Bestand (siehe `kinos.ort`) |

### Erweiterung (Phase 1b — braucht TMDB-Personen-Zusatzabruf)

| # | Bereich | Beispiel-URL | Menge |
|---|---|---|---|
| 1.5 | Schauspieler-Seiten | `/schauspieler/timothee-chalamet-2231` | groß, priorisiert nach Bekanntheit/Titelanzahl |
| 1.6 | Regisseur-Seiten | `/regisseur/denis-villeneuve-137` | groß, priorisiert |

### Redaktionell (Phase 2 — kein Datenbank-Template, echte Textarbeit)

| # | Bereich | Beispiel | Aufwand |
|---|---|---|---|
| 1.10 | Ratgeber/Themenseiten | „Beste Thriller für einen Filmabend zu zweit" | hoch, laufend |
| 1.11 | Vergleichsseiten | „Netflix vs. Disney+: Wo läuft mehr Neues?" | mittel, muss aktuell gehalten werden |

**Offene Frage an dich:** Reihenfolge/Umfang so passend, oder sollen 1.5/1.6
(Personen-Seiten) vorgezogen werden trotz des Zusatzaufwands? Ich habe sie
nach Phase 1b sortiert, weil sie einen eigenen Datenimport brauchen, den die
anderen Bereiche nicht voraussetzen.

---

## 2. Keyword-Recherche je Seitenbereich

Qualitative Cluster nach Nutzer-Intention (Head / Long-Tail / Fragen), Deutsch,
gebildet aus Domänenwissen zu Sucheingaben rund um Film/Serie — **ohne**
Zugriff auf ein Volumen-Tool (Ahrefs/SEMrush/Search Console gibt es hier
nicht). Vor der Content-Erstellung (Abschnitt 5 des Gesamtplans) sollten die
Cluster gegen echte Volumendaten geprüft werden, sobald Search Console
(Abschnitt 4) Daten liefert.

### 2.1 Startseite
- Head: „filme und serien empfehlungen", „was schauen", „filmempfehlung app"
- Long-Tail: „app die filme empfiehlt die zu meinem geschmack passen",
  „gemeinsam filme aussuchen app", „watchlist app kostenlos"
- Marke: „movietaste", „movie taste app"

### 2.2 Genre-Seiten
- Head je Genre: „beste thriller filme", „gute krimiserien", „comedy filme 2024"
- Long-Tail: „beste thriller filme auf netflix", „krimiserien die man gesehen
  haben muss", „unterschätzte comedy filme"
- Fragen: „was sind die besten thriller aller zeiten"

### 2.3 Titeldetailseiten
- Head: „<Titel> stream", „<Titel> wo schauen", „<Titel> bewertung"
- Long-Tail: „<Titel> auf welchem streaming dienst", „<Titel> kritik deutsch",
  „<Titel> ähnliche filme"
- Fragen: „ist <Titel> gut", „lohnt sich <Titel>"
- **Hinweis:** Suchvolumen extrem konzentriert auf aktuelle/populäre Titel
  (Kinostarts, neue Staffeln) — das stützt die Priorisierung „nicht alle
  27.000 Titel gleich behandeln" aus dem SEO-Vorgespräch.

### 2.4 Streaming-Anbieter-Seiten
- Head: „neu auf netflix", „was läuft auf disney plus", „amazon prime filme liste"
- Long-Tail: „beste filme auf netflix gerade", „neue serien diesen monat <Anbieter>"
- Saisonal: monatlich aktualisierbare Absicht („neu im august")

### 2.5 Bestenlisten / Jahres-Seiten
- Head: „beste filme 2024", „beste serien 2024", „filmhighlights 2024"
- Long-Tail: „beste thriller serien 2024", „unterschätzte filme 2024"
- Evergreen-Variante: „beste filme aller zeiten je genre"

### 2.6 Kino-Städte-Seiten
- Head: „kino wien programm", „kino berlin heute"
- Long-Tail: „aktuelle kinostarts wien diese woche", „kino in der nähe <Stadt>"
- **Hinweis:** Ohne Spielzeiten (siehe `PLAN-KINOS.md`) ist nur „welche Filme
  laufen gerade in Kinos in <Stadt>" beantwortbar, nicht „wann läuft was".

### 2.7 Schauspieler-/Regisseur-Seiten (Phase 1b)
- Head: „<Name> filme", „<Name> filmografie"
- Long-Tail: „<Name> beste filme", „neue filme mit <Name>"

---

## 3. Templates je Seitenbereich

Struktur (Content-Blöcke), Medien, technische Vorgaben. Reihenfolge der
Blöcke = Reihenfolge im HTML (wichtig fürs „echten Text im initialen HTML"-
Prinzip aus dem SEO-Vorgespräch).

### 3.1 Startseite
- **Struktur:** H1 (Markenversprechen) → kurzer Erklärtext (was die App tut,
  Positionierung „Der Filmgeschmack gehört dir" aus `IDEEN-WACHSTUM.md` 4) →
  Einstieg in die Kennenlern-Strecke → Verlinkung zu Genre-/Anbieter-/
  Bestenlisten-Seiten (interne Linkstruktur, siehe 4.2).
- **Medien:** og-image.png (vorhanden), evtl. Screenshot-Karussell.
- **Technisch:** `<title>` „MovieMatch – Filme & Serien nach deinem
  Geschmack finden"; `meta description` ~155 Zeichen; JSON-LD `WebApplication`;
  bleibt indexierbar (heute schon einzige erlaubte Seite).

### 3.2 Genre-Seiten
- **Struktur:** H1 „Beste <Genre>-<Filme/Serien>" → 1–2 Sätze Einordnung →
  Titel-Raster (Titel, Jahr, Rating, Kurzbeschreibung als sichtbarer Text,
  nicht nur Bild) → Paginierung oder „mehr laden" mit crawlbaren Links (kein
  reines JS-Nachladen ohne echten Link) → interne Links zu verwandten Genres.
- **Medien:** Poster der Titel (bereits vorhanden über `poster_path`).
- **Technisch:** URL `/filme/<genre-slug>`; `<title>` „Beste <Genre>-Filme —
  Übersicht & Bewertung | MovieMatch"; canonical auf sich selbst; JSON-LD
  `ItemList`; Sortierung serverseitig gerendert (Community-Bewertung oder
  Taste-relevante Metrik, nicht personalisiert — personalisierte Sortierung
  ist nicht crawlbar/cachefähig).

### 3.3/3.4 Titeldetailseiten (Film/Serie)
- **Struktur:** H1 (Titel + Jahr) → Poster/Backdrop → Kurzinfo-Zeile (Jahr,
  Genre, Laufzeit/Staffeln, Altersfreigabe) → Bewertung (Community, mit
  Mindestzahl-Schwelle wie in den anonymen Statistiken) → Beschreibung
  (Plot) → **Verfügbarkeit** (Streaming-Anbieter + Kino, das ist der
  Mehrwert gegenüber TMDB) → Besetzung/Regie (verlinkt zu Personen-Seiten,
  sobald 1.5/1.6 existieren) → ähnliche Titel (interne Verlinkung) →
  CTA „Zur eigenen Watchlist hinzufügen" (führt in die App/Kennenlern-Strecke).
- **Medien:** Poster + Backdrop (vorhanden, `ergaenzeBackdrop()` existiert
  schon in `share.js`), Trailer-Einbindung falls vorhanden (`trailers.js`
  existiert bereits als Route).
- **Technisch:** URL `/film/<slug>-<tmdb-id>` bzw. `/serie/…` (sprechend,
  siehe SEO-Vorgespräch Punkt B.7); `<title>` „<Titel> (<Jahr>) — Stream,
  Bewertung & Kino | MovieMatch"; `meta description` aus `vorschauText()`-
  Logik (existiert bereits in `server.js` für OG-Tags, wiederverwendbar);
  canonical; JSON-LD `Movie`/`TVSeries` (Rating, Genre, Regisseur, Besetzung);
  **Indexierbarkeits-Regel**: nur Titel mit `titles.id` (echte Nutzer-Aktivität)
  ODER Mindestbewertungszahl — nicht alle TMDB-Importe (Duplicate-Content-
  Vermeidung, siehe SEO-Vorgespräch A.1). Momentaufnahmen-Links (`?titel=`)
  bleiben `noindex`.

### 3.7 Streaming-Anbieter-Seiten
- **Struktur:** H1 „Filme & Serien auf <Anbieter>" → kurzer Erklärtext →
  Abschnitt „Neu diesen Monat" (aus `streaming_cache.first_seen_at`) →
  Abschnitt „Beliebteste Titel" → interne Links zu Genre-Kombination
  („Thriller auf Netflix").
- **Medien:** Anbieter-Logo (falls Lizenz das erlaubt — prüfen), Poster-Raster.
- **Technisch:** URL `/streaming/<anbieter-slug>`; `<title>` „<Anbieter>:
  Filme & Serien im Überblick | MovieMatch"; Aktualisierungsvermerk sichtbar
  (Datum), da Google zeitkritische Inhalte mit Datum bevorzugt; JSON-LD
  `ItemList`.

### 3.8 Bestenlisten / Jahres-Seiten
- **Struktur:** H1 „Beste <Genre/Kategorie>-Filme <Jahr>" → redaktioneller
  Einleitungstext (mind. 2–3 Sätze echter Text, nicht nur Liste — sonst
  dünner Inhalt) → nummerierte Liste mit Kurzbegründung je Titel → Abschnitt
  „So ist die Liste entstanden" (Transparenz: Community-Bewertung +
  Taste-Score-Basis, stärkt Vertrauen/E-E-A-T).
- **Medien:** Poster-Collage/Titelbild je Liste.
- **Technisch:** URL `/beste-filme/<jahr>` bzw. `/beste-filme/<genre>`;
  JSON-LD `ItemList`; **kuratiert, nicht automatisch für jede
  Genre×Jahr-Kombination generiert** — sonst wieder Dünn-Content-Risiko wie
  bei den 27.000 Titelseiten.

### 3.9 Kino-Städte-Seiten
- **Struktur:** H1 „Kino in <Stadt>: Aktuelle Filme" → Liste aktueller
  Kinostarts (aus `cinema_cache`, gefiltert auf Region der Stadt) → Liste
  der Kinos in der Stadt (`kinos.ort`, mit Adresse/Website) → Hinweis, dass
  Spielzeiten (noch) nicht verfügbar sind (ehrlich, kein leeres Versprechen).
- **Technisch:** URL `/kino/<stadt-slug>`; nur Städte mit Mindestanzahl
  Kinos indexieren (Dünn-Content-Schwelle); JSON-LD `ItemList` + evtl.
  `LocalBusiness` je Kino (Vorsicht: nur mit Einwilligung/öffentlich
  ohnehin bekannten Daten, keine Nutzerdaten).

### 3.5/3.6 Schauspieler-/Regisseur-Seiten (Phase 1b, vorläufiges Template)
- **Struktur:** H1 (Name) → Foto + Kurzbiografie (aus TMDB-Personen-Abruf,
  noch zu bauen) → Filmografie (Titel mit Rolle/Funktion, sortiert nach
  Jahr/Bekanntheit) → ähnliche Personen.
- **Technisch:** URL `/schauspieler/<slug>-<tmdb-person-id>`; setzt den
  Personen-Datenimport voraus (siehe Abschnitt 0); ohne echte `person_id`
  bleibt das Risiko von Namenskollisionen (z. B. mehrere „Michael Bay"-
  Einträge weltweit) — **daher vor Umsetzung: eigener kleiner Datenplan**,
  kein reines Template-Thema.

---

## 4. Technische Rahmenvorgaben (bereichsübergreifend)

- **Sitemap-Segmentierung:** eine `sitemap-index.xml` mit Teil-Sitemaps je
  Bereich (`sitemap-filme.xml`, `sitemap-serien.xml`, `sitemap-genres.xml`, …) —
  einfacher zu prüfen/zu drosseln als eine einzige riesige Datei.
- **robots.txt:** je Bereich gezielt freigeben, sobald das Template steht;
  Momentaufnahmen (`?titel=`) und alle `/api/…`-Pfade bleiben gesperrt.
- **Search Console:** vor der Content-Befüllung einrichten (Property +
  Sitemap), sonst gibt es während der Umsetzung keine Rückmeldung.
- **hreflang (Phase 2):** erst wenn die deutschen Kernseiten laufen —
  die Übersetzungsinfrastruktur (`sprachFeld()`, sieben Sprachen) existiert
  bereits und lässt sich später anschließen.
- **Rechtlich:** TMDB-API-Nutzungsbedingungen für öffentlich indexierte
  Weiterverwendung von Titeldaten/Postern kurz prüfen (gehört in die
  laufende anwaltliche Sammelprüfung, `UEBERGABE-OFFEN.md` 3.1).

---

## 5. Reihenfolge bis zur technischen Umsetzung

1. **Diese Datei freigeben/anpassen** (Seitenbereiche, Prioritäten,
   fehlende Bereiche ergänzen).
2. Keyword-Cluster (Abschnitt 2) bei Bedarf verfeinern, sobald erste
   Search-Console-Daten vorliegen (nach Punkt 3 unten realistisch erst
   möglich — Cluster hier sind die Startbasis).
3. Freigabe der Templates (Abschnitt 3) je Bereich — kann bereichsweise
   erfolgen (z. B. erst Titeldetailseiten + Genre, Rest später).
4. **Technische Umsetzung** je freigegebenem Bereich (eigener Schritt,
   nicht Teil dieser Datei).
5. **Content-Erstellung/Befüllung** — bei Kern-Bereichen weitgehend
   automatisch aus Bestandsdaten, bei Bestenlisten/Ratgeber (1.10/1.11)
   echte Redaktionsarbeit.
