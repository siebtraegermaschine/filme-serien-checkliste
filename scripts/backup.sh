#!/usr/bin/env bash
# Datenbank-Sicherung fuer MovieMatch.
#
# Aufruf auf dem Server (im Projektverzeichnis):
#   ./scripts/backup.sh taeglich
#   ./scripts/backup.sh monatlich
#
# Setzt voraus, dass es im aktuellen Verzeichnis liegt (docker compose braucht
# die compose-Datei) -- deshalb in den Cron-Zeilen das vorangestellte cd.
#
# Bewusst zwei Stufen, weil die Daten unterschiedlich wertvoll sind:
#
#   taeglich   Nur das, was sich NICHT wiederbeschaffen laesst -- Konten,
#              Watchlist/Gesehen samt Sterne-Bewertungen, Verknuepfungen,
#              ausgeblendete Titel und die Titeltabelle selbst (auf deren IDs
#              verweist der Fortschritt).
#   monatlich  Alles, inklusive der aus TMDB abgeleiteten Caches. Die liessen
#              sich zwar neu ziehen, aber genau das ist der Fall, den wir
#              absichern wollen: dass TMDB gerade nicht mehr liefert.
#
# Die Sicherung liegt vorerst auf demselben Server. Das schuetzt gegen
# kaputte Importlaeufe und Fehlbedienung, NICHT gegen den Ausfall der
# Maschine -- eine Kopie nach aussen fehlt noch bewusst.
set -euo pipefail

ART="${1:-taeglich}"
ZIEL="${BACKUP_DIR:-./backups}"
BEHALTEN_TAEGLICH="${BACKUP_KEEP_DAILY:-14}"
BEHALTEN_MONATLICH="${BACKUP_KEEP_MONTHLY:-12}"

# Tabellen ohne Ableitung aus TMDB. session bleibt bewusst draussen: reine
# Anmelde-Sitzungen, nach einer Wiederherstellung muss man sich eben neu
# anmelden.
NUTZERTABELLEN=(
  titles users user_links user_link_invites
  user_progress user_hidden_titles title_rating_stats title_rating_stufen
)

STEMPEL="$(date -u +%Y-%m-%dT%H%M%SZ)"
mkdir -p "$ZIEL"

if [ "$ART" = "monatlich" ]; then
  DATEI="$ZIEL/moviematch-voll-$STEMPEL.sql.gz"
  ARGS=()
else
  DATEI="$ZIEL/moviematch-nutzer-$STEMPEL.sql.gz"
  ARGS=()
  for t in "${NUTZERTABELLEN[@]}"; do ARGS+=("--table=$t"); done
fi

echo "Sichere ($ART) nach $DATEI ..."
# -T: kein TTY, sonst landen Steuerzeichen im Dump.
# -f docker-compose.yml ausdruecklich: Ohne die Angabe zieht Compose zusaetzlich
# docker-compose.override.yml heran, die nur fuer die lokale Entwicklung gedacht
# ist und Postgres nach aussen oeffnet (siehe DEPLOYMENT.md, Schritt 5).
docker compose -f docker-compose.yml exec -T postgres \
  pg_dump -U postgres -d filme_serien --no-owner --no-privileges "${ARGS[@]}" \
  | gzip -9 > "$DATEI"

# Leere oder winzige Dateien deuten auf einen Fehlschlag hin (pg_dump schreibt
# den Fehler nach stderr, die Pipe liefert trotzdem eine Datei). Lieber laut
# scheitern als eine unbrauchbare Sicherung stehen lassen.
GROESSE=$(wc -c < "$DATEI")
if [ "$GROESSE" -lt 1024 ]; then
  echo "FEHLER: Sicherung ist nur $GROESSE Bytes gross -- wird verworfen." >&2
  rm -f "$DATEI"
  exit 1
fi

echo "Fertig: $DATEI ($(du -h "$DATEI" | cut -f1))"

# Aufraeumen: aelteste zuerst weg, je Art getrennt gezaehlt.
aufraeumen() {
  muster="$1"; behalten="$2"
  # shellcheck disable=SC2012
  ls -1t "$ZIEL"/$muster 2>/dev/null | tail -n "+$((behalten + 1))" | while read -r alt; do
    echo "Entferne alte Sicherung: $alt"
    rm -f "$alt"
  done
}
aufraeumen 'moviematch-nutzer-*.sql.gz' "$BEHALTEN_TAEGLICH"
aufraeumen 'moviematch-voll-*.sql.gz' "$BEHALTEN_MONATLICH"
