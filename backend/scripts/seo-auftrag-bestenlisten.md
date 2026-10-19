# Auftrag: Bestenlisten-Texte verlängern (de-de)

Du bekommst eine Paketdatei (JSON-Liste) mit Bestenlisten. Schreibe für jede Liste einen neuen
deutschen Einleitungstext und speichere alle in EINER Zieldatei als JSON-Objekt
`{ "<schluessel>": "Text", ... }` (Schlüssel exakt aus dem Paket).

## Anforderungen
- 1.000–1.600 Zeichen, zwei bis drei Absätze (mit `\n\n` getrennt), reiner Fließtext, keine Überschriften, kein Markdown.
- Inhalt: Was zeichnet diese Liste aus (Genre, Jahr/Jahrzehnt, Land, Anbieter …)? Was verbindet die Spitzentitel
  (Stimmung, Stoffe, Handlungsorte, Machart), woran erkennt man gute Titel in dieser Kategorie, für wen eignet sie sich?
  Nutze nur Fakten aus dem Paket (Titel, Jahre, Genres, Länder, Regie/Idee, Besetzung, Handlung) und gesichertes Allgemeinwissen zum Genre bzw. Jahrzehnt.
- Titel in „Anführungszeichen“; nenne 3–6 Titel der Spitze als Beispiele, aber ohne Rangangaben („Platz 1“, „führt an“, „an der Spitze“) — die Liste ändert sich laufend.
- Jede Liste klingt anders: kein gemeinsames Gerüst, keine gleichen Satzanfänge über mehrere Texte.
- Serien: Schöpfer heißen „Idee“, nie „Regie“.
- Bei Anbieter-Listen: das Angebot wechselt, daher nichts Zeitgebundenes behaupten.

## Verboten
- Zahlen zu Katalog- oder Trefferumfang („über 2500 Filme“), exakte Stimmenzahlen, Wertungen in Zahlen.
- Kritikerwertungen, Preise (Oscar …), Biografisches, Werbesprache (meisterhaft, legendär, Kultfilm, bahnbrechend, unvergesslich).
- Datenbanksprache: Datensatz, Schlagwort, verzeichnet, hinterlegt, eingetragen, vermerkt, Angabe, Eintrag, ausgewiesen.
- Mutmaßungen („dürfte“, „wohl“), Erfundenes. Im Zweifel weglassen.
- Wörter in nicht-lateinischer Schrift.
- Den bisherigen Text im Paket nicht kopieren (er dient nur der Orientierung).

## Selbstprüfung vor Abgabe
Skript im Arbeitsordner: Länge je Text 1.000–1.600 Zeichen, Verbotswörter-Suche, JSON gültig, alle Schlüssel des Pakets vorhanden.
Schlusszeile: „nichts zu beanstanden“ oder die Auffälligkeiten.
