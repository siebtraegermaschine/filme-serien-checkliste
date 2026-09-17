#!/bin/zsh
# Woechentliche Sicherung der SEO-Texte (Tabelle seo_content) auf Christians Mac.
#
# Warum ausserhalb des Servers (17.09.2026): Die rund 9.000 Titeltexte existieren
# nur in der Live-Datenbank. Die Datenbank ist dafuer maßgeblich, seo-content-daten.mjs
# enthaelt nur einen Bruchteil. Eine Sicherung auf demselben Server schuetzt nicht
# gegen den Ausfall der Maschine.
#
# Gestartet von launchd (~/Library/LaunchAgents/de.movietaste.seo-sicherung.plist),
# sonntags 03:30 (bis 17.09.2026 taeglich; Christian: woechentlich reicht, spart Platz). Schlaeft der Mac, holt launchd den Lauf beim Aufwachen nach --
# deshalb die Wiederholungen: direkt nach dem Aufwachen steht das Netz oft noch nicht.
#
# Wiederherstellen (ersetzt die Tabelle komplett, vorher pruefen!):
#   gunzip -c DATEI.sql.gz | ssh root@movietaste.de "cd /opt/movietaste && \
#     docker compose -f docker-compose.yml --profile prod exec -T postgres psql -U postgres -d filme_serien"
set -euo pipefail

ZIEL="${SEO_SICHERUNG_ZIEL:-$HOME/Backups/movietaste/seo_content}"
BEHALTEN="${SEO_SICHERUNG_BEHALTEN:-4}"
SSH=(ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes -o ConnectTimeout=20 root@movietaste.de)

mkdir -p "$ZIEL"
STEMPEL="$(date +%Y-%m-%d_%H%M)"
DATEI="$ZIEL/seo_content-$STEMPEL.sql.gz"
TEMP="$DATEI.teil"

for versuch in 1 2 3; do
  # --clean --if-exists: Beim Einspielen wird die Tabelle ersetzt statt doppelt befuellt.
  if "${SSH[@]}" "cd /opt/movietaste && docker compose -f docker-compose.yml --profile prod exec -T postgres \
        pg_dump -U postgres -d filme_serien -t seo_content --no-owner --no-privileges --clean --if-exists | gzip -9" > "$TEMP"; then
    break
  fi
  echo "$(date '+%F %T') Versuch $versuch fehlgeschlagen" >&2
  rm -f "$TEMP"
  [ "$versuch" -lt 3 ] && sleep 120
done
[ -f "$TEMP" ] || { echo "$(date '+%F %T') FEHLER: keine Sicherung erstellt" >&2; exit 1; }

# Plausibilitaet: eine Sicherung unter 1 MB oder ohne Tabelleninhalt ist kaputt.
GROESSE=$(wc -c < "$TEMP" | tr -d ' ')
ZEILEN=$(gunzip -c "$TEMP" | awk '/^COPY public.seo_content/{an=1;next} /^\\\.$/{an=0} an{n++} END{print n+0}')
if [ "$GROESSE" -lt 1000000 ] || [ "$ZEILEN" -lt 1000 ]; then
  echo "$(date '+%F %T') FEHLER: Sicherung unplausibel ($GROESSE Bytes, $ZEILEN Zeilen) -- verworfen" >&2
  rm -f "$TEMP"
  exit 1
fi
mv "$TEMP" "$DATEI"
echo "$(date '+%F %T') ok: $DATEI ($(du -h "$DATEI" | cut -f1), $ZEILEN Texte)"

# Aelteste zuerst weg.
ls -1t "$ZIEL"/seo_content-*.sql.gz 2>/dev/null | tail -n "+$((BEHALTEN + 1))" | while read -r alt; do
  rm -f "$alt"
  echo "$(date '+%F %T') entfernt: $alt"
done
