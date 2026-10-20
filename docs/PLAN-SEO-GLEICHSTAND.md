# Plan: SEO-Gleichstand in allen Sprachen (Stand 20.10.2026)

**Ziel:** Jede relevante Seite in jeder Sprache/jedem Land hat einen Text mit
mindestens 250 Zeichen (`MIN_TITELTEXT`, `backend/lib/seoLocale.js`) und ist
damit indexierbar und in der Sitemap. Quelle des Textes (Datenbank-Bausteine,
eigenes Wissen, Recherche, Übersetzung aus einer fertigen Sprache) wird nach
Effizienz gewählt.

**Arbeitsweise:** Phasen der Reihe nach, nach jeder Phase Zwischenstand in
`STATUS.md` (offen / entschieden / als Nächstes). Ein Auftrag = ein Zweig =
eine Sitzung. Abo-Weg ohne API-Geld. **Echtes Geld (Batch-API) nur nach
ausdrücklicher Freigabe.** Vor jedem Einspielen `--dry-run`. Texte gehen
direkt in `seo_content` (kein Deploy nötig); Code-Änderungen sind ein Push auf
`main` = live (siehe CLAUDE.md).

## Entscheidungen (vom Nutzer, 20.10.2026)
- Verlängern der dünnen de-de-Texte: **Textbausteine aus DB-Fakten**, kein API-Geld.
- „Dünn" = **alle Texte unter 250 Zeichen**, nicht nur 200–250.
- Übersetzung: **Abo**, nach 3 Runden Wochenlimit messen; Batch-API nur auf Zuruf.
- Umfang: **alle relevanten Seiten** in allen Sprachen, auch Personen und Titel ohne deutschen Text. Fehlt in `de-de` etwas, wird es aus einer anderen Sprache übersetzt oder neu erstellt.
- Lokale Seiten (Kino-Städte) nur in der Landessprache nötig. Stand heute gibt es sie schon in allen Sprachen (ca. 460–470 je Locale) → so lassen, nicht ausbauen.

## Ausgangslage (20.10.2026, `seo_content`, Zeilen je Textsprache)
| Bereich | de-de | en-gb | fr-fr | it-it | nl-nl | pt-pt | es-es |
|---|---:|---:|---:|---:|---:|---:|---:|
| Titel | 93.667 | 93.326 | 80.118 | 74.893 | 77.569 | 73.985 | 23.984 |
| Personen | 16.964 | 11.133 | 10.212 | 0 | 0 | 0 | 0 |
| Bestenlisten | 1.043 | 750 | 672 | 637 | 634 | 686 | 576 |
| Reihen | 501 | 489 | 472 | 446 | 475 | 437 | 456 |
- Sitemap-URLs: de-de 119.537, en-gb 105.966, fr-fr 91.809, it-it 76.396, nl-nl 79.068, pt-pt 75.420, es-es 25.574; Länder-Varianten (de-at, de-ch, fr-ch, fr-ca, en-ca, en-us) übernehmen die Textbasis ihrer Sprachfassung.
- de-de hat 12.033 Titeltexte < 250 Zeichen; sie stehen im Index (de-de ist von der Schwelle ausgenommen), Fremdsprachen schließen solche Texte aus.
- Personen nur in `PERSONEN_LOCALES = ['en-gb','fr-fr']` (+ de-de).
- **Nachgeführt aus STATUS.md (20.10.2026, Vormittag):**
  - Personen de-de: 17.186 (Runde 8 brachte nur 37 % Ausbeute, weitere Personen-Runden gestoppt; Ziel war ca. 18.600). Die `personen`-Zeilen (16.964) oben sind der ältere Stand.
  - SEO-Fächer (Titel) erledigt, Stufe B/C/D durch; offen nur 16 Titel Stufe B und 25 Stufe D (bewusst zu dünn). Die frühere Zahl „3.336 Stufe C" ist damit überholt.
  - Reihen-Texte (501) neu erzeugt, Ø jetzt ca. 600 Zeichen (vorher 400), `seo-reihen-texte.mjs --neu`. Nur de-de; die Übersetzungen in den anderen Sprachen stammen vom alten Text → in Phase 2 als „veraltet" prüfen und nachziehen.
  - Kino-Stadt-Texte (469, Ø ca. 206 Zeichen) bewusst kurz, weil je Stadt keine Spielzeiten vorliegen; mehr Text wäre Füllstoff. Doppelte Kinonamen entfernt und neu erzeugt. Die Schwelle 250 gilt im Code nur für Titel (`titelTextReicht`); **Entscheidung nötig**, ob Kino-Städte trotzdem auf 250 sollen (Konflikt mit dem Ziel „alle ≥ 250").
  - Ca. 528 Titel dauerhaft von der Faktenprüfung abgelehnt.

## Phase 1 – de-de-Texte auf ≥ 250 Zeichen (Quelle für alle Sprachen) — ERLEDIGT 20.10.2026
Ergebnis: 11.968 Titel + 12 redaktionelle Texte verlängert; Rest 65 Titel ohne Fakten (Entscheidung offen) und 443 Kino-Städte (nicht angefasst).
1. Liste ziehen: alle `seo_content`-Zeilen `locale='de-de'` mit `length(text) < 250`, je Bereich (Titel zuerst, dann Rest). Zahl und Längenverteilung festhalten.
2. Bausteine aus DB-Fakten entwerfen (Genre, Jahr, Laufzeit, Land/Sprache, Besetzung/Regie, Anbieter, Bewertung, Staffeln/Folgen). Nur belegte Fakten, keine Behauptungen über reale Personen. Mehrere Satzvarianten je Baustein, damit keine Vorlagenähnlichkeit entsteht (Stichprobe: 448 Gruppen / 13.793 Texte sind schon vorlagenähnlich). Vorhandene Skripte als Ausgangspunkt: `seo-titel-kurztexte.mjs`, `seo-titel-kurztexte-lokal.mjs`.
3. Bestehenden Text **anhängen**, nicht ersetzen (`seo-texte-anhaengen.mjs` prüfen).
4. Probe 50 Texte lesen, Dubletten-/Ähnlichkeitsprüfung, dann `--dry-run`, dann einspielen.
5. Nachmessen: Anzahl < 250 muss 0 sein (außer begründete Ausnahmen, in STATUS.md notieren).

## Phase 2 – Differenzen ermitteln (nur Messen, nichts ändern) — ERLEDIGT 20.10.2026 (Zahlen in STATUS.md)
1. Je Locale und Bereich: Schlüssel, die in `de-de` mit Text existieren, aber in der Ziel-Textsprache fehlen oder < 250 Zeichen haben. Ergebnis als Tabelle (Zahl + Schlüsselliste in Datei im Scratchpad).
2. Prüfen, ob Seiten ohne `de-de`-Text existieren (Stufe C, ca. 528 abgelehnte, Personen ohne Text, Bestenlisten): Quelle bestimmen (andere Sprache vorhanden? sonst neu).
3. Kino-Städte: je Locale vollständig bestätigen; wegen Ø 206 Zeichen die Entscheidung zur 250-Schwelle beim Nutzer einholen (siehe Ausgangslage), nicht eigenmächtig mit Füllstoff auffüllen.
3a. Reihen: fremdsprachige Texte vom alten Vorlagentext (Zeitstempel vor 20.10.2026 11:54) gegen den neuen de-de-Text abgleichen und neu erzeugen/übersetzen.
4. Länder-Varianten (de-at, de-ch, fr-ch, fr-ca, en-ca, en-us) brauchen nichts Eigenes, sie erben die Sprachfassung.
5. Ergebnis in `STATUS.md` und dem Nutzer vorlegen (Zahlen je Locale/Bereich).

## Phase 3 – Priorisieren
Reihenfolge je Locale nach Nutzen: (a) Titel nach Beliebtheit (Bewertungs-/Aufrufzahlen), (b) Bestenlisten, Reihen, (c) Personen nach Titelzahl (Top zuerst). Sprachen: `es-es` zuerst (größte Lücke, ca. 70.000 Titel), danach it/pt/nl/fr/en. `pt-br` bleibt inaktiv.

## Phase 4 – Übersetzen (Abo) — es-es-Langtexte fertig (1.117 Texte), en/fr/it/nl/pt Top-Titel offen; Runden 1–2 erledigt (es-es 248, dazu 220 andere Sprachen). Entscheidung Weg 2: Langtexte nur für Top-Titel, Rest Kurztexte aus DB-Fakten (Phase 5); siehe STATUS.md
1. Verfahren: `seo-uebersetzen-dateien.mjs` (Pakete → Sonnet-Subagenten → einspielen, Faktenprüfung wie `seo-uebersetzen.mjs`). Runden à 10 Pakete × 25 Texte, je Runde ca. 10–15 Min.
2. **Erst 3 Runden `es-es`**, danach Wochenlimit ablesen (Nutzungsanzeige) und Gesamtdauer neu schätzen; Ergebnis in STATUS.md. Reicht das Abo nicht, dem Nutzer Batch-API-Kosten (ca. 0,22 Cent/Text) nennen und **Freigabe abwarten**.
3. Quellsprache: `de-de` (nach Phase 1); fehlt dort etwas, die nächste fertige Sprache.
4. Personen: für es/it/nl/pt zuerst Code vorbereiten (`PERSONEN_LOCALES`, `PERSON_ABSCHNITTE` in `scripts/seo-kategorien-uebersetzen.mjs`, Überschriften in `seoRender.js`, Tests in `npm test` anpassen). Das ist ein Push auf `main` = live → vorher Nutzer fragen.
5. Läuft abgekoppelt (`setsid nohup … > /tmp/lauf.log 2>&1 &`), Logs auf dem Server prüfen.

## Phase 5 – Texte < 250 Zeichen nach der Übersetzung — ERLEDIGT 20.10.2026 (Kurztexte alle Sprachen, Zahlen in STATUS.md)
Alle übersetzten Texte der Ziel-Locale messen. Unter 250 Zeichen: wie Phase 1 mit Bausteinen aus DB-Fakten in der Zielsprache verlängern (Bausteine je Sprache; `seoTexte.js` / `genreNamen.js` liefern Wörter). Hinweis aus Oktober: englische Übersetzungen sind kürzer als deutsche, `length ≥ 1200` als Maß für „offen" nicht erneut verwenden.

## Phase 6 – Abschluss
- Pro Locale Sitemap-Zahl nachzählen (Skript mit `gzipTeile` im Backend-Container) und mit `de-de` vergleichen; Ziel ca. 95–98 % (dauerhafte Faktenprüf-Ablehnungen bleiben).
- Stichprobe live auf movietaste.de (`seo-audit.mjs`): Status, Canonical, robots, Duplikate.
- STATUS.md aktualisieren, Memory-Eintrag zum Stand, offene Reste auflisten.

## Hinweise
- Server: `ssh -i ~/.ssh/id_ed25519 root@movietaste.de`, Projekt `/opt/movietaste`, DB-Service heißt `postgres` (Befehle siehe CLAUDE.md).
- Server war am 20.10. zeitweise stark ausgelastet (Load ~14); Sitemap-Zählung dauerte über 20 Minuten.
- `en-us` wurde bei der Sitemap-Zählung nicht gemessen (erbt `en-gb`, ca. 105.960 geschätzt); in Phase 6 nachzählen.
- Sonnet 5 für Umsetzung, Haiku nur für einfache Prüf-/Suchaufgaben.

## Chat-Wechsel
Nach jeder abgeschlossenen Phase (oder wenn der Kontext lang wird): Stand in
`STATUS.md` eintragen (Zahlen, was läuft, nächster Schritt), diese Datei mit
„Phase X erledigt" markieren und dem Nutzer einen fertigen Übergabeprompt für
einen neuen Chat schreiben, der die Liste ab der nächsten Phase weiterführt.
