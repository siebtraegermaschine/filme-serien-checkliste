#!/bin/bash
# Erzeugt die sechs Screenshots fuer den Einstieg (tour/*.png).
#
# Aufbau: server.mjs liefert die LOKALE index.html -- also den aktuellen Stand
# der Oberflaeche -- und reicht alle /api-Aufrufe an die Produktion durch. So
# stehen echte Titel mit echten Postern in den Bildern, ohne dass hier eine
# Datenbank laufen muss. aufbau.js stellt je Seite die Ansicht her und setzt die
# Markierung.
#
# Aufruf aus dem Projektverzeichnis:  bash scripts/tour/aufnehmen.sh
set -e

# Chrome oder Chromium suchen, statt einen festen Pfad zu erwarten. Vorher stand
# hier nur der macOS-Pfad -- auf jeder anderen Maschine brach das Skript sofort
# ab, obwohl ein brauchbarer Browser vorhanden war. Ein eigener Pfad laesst sich
# ueber CHROME=... voranstellen.
if [ -z "$CHROME" ]; then
  for kandidat in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "$(command -v google-chrome || true)" \
    "$(command -v google-chrome-stable || true)" \
    "$(command -v chromium || true)" \
    "$(command -v chromium-browser || true)" \
    "/opt/pw-browsers/chromium"
  do
    [ -n "$kandidat" ] && [ -x "$kandidat" ] && CHROME="$kandidat" && break
  done
fi
[ -n "$CHROME" ] && [ -x "$CHROME" ] || {
  echo "Kein Chrome/Chromium gefunden. Pfad mit CHROME=... voranstellen."; exit 1; }
echo "Browser: $CHROME"

# Erreichbarkeit der Produktion vorab pruefen. Ohne sie laufen zwar alle sechs
# Aufnahmen durch, die Bilder zeigen dann aber leere Listen und statt der Poster
# nur Platzhalter -- und ueberschreiben die brauchbaren alten. Lieber hier
# abbrechen als hinterher sechs unbrauchbare Dateien im Verzeichnis haben.
ZIEL_API="https://movietaste.de/api/titles?source=catalog"
if ! curl -sfI --max-time 20 "$ZIEL_API" >/dev/null 2>&1; then
  echo "movietaste.de ist nicht erreichbar -- ohne echte Titel und Poster waeren"
  echo "die Bilder schlechter als die vorhandenen. Abgebrochen."
  exit 1
fi
# Dasselbe fuer die Poster: Sie kommen nicht von movietaste.de, sondern direkt
# von TMDB. Ist nur diese Adresse gesperrt, faellt es sonst erst am fertigen
# Bild auf.
if ! curl -sfI --max-time 20 "https://image.tmdb.org/t/p/w200" >/dev/null 2>&1; then
  echo "image.tmdb.org ist nicht erreichbar -- die Poster fehlten in den Bildern."
  echo "Abgebrochen."
  exit 1
fi

node scripts/tour/server.mjs & SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 2

# Chrome erzwingt mindestens 500px Fensterbreite -- das liegt noch unter dem
# 520px-Umbruch der App, die Bilder zeigen also die mobile Darstellung.
shot() {
  "$CHROME" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=25000 \
    --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=500,"$2" --screenshot="tour/$1.png" \
    "http://localhost:4600/_shot.html?slide=$3" 2>/dev/null
  echo "  tour/$1.png"
}
mkdir -p tour
# Ohne Logo und Kopfzeilen (siehe kopfKuerzen in aufbau.js) faengt das Bild bei
# den Knoepfen Filme/Serien/Kino an -- rund 190px kuerzer als vorher.
shot 1-entdecken    710 1
shot 2-taste-score  710 2
shot 3-gemeinsam    700 3
shot 4-streaming    710 4
shot 5-details      890 5
shot 6-suche        710 6
echo "fertig"
echo
echo "Jetzt jedes Bild gegen die Beschriftung der zugehoerigen Karte halten:"
echo "Die Texte in TOUR_SLIDES (index.html) beschreiben, was zu sehen sein soll."
