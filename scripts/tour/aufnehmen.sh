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
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome nicht gefunden"; exit 1; }

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
