#!/bin/zsh
# Faecher-Verfahren fuer SEO-Titeltexte: eine Runde vorbereiten oder abschliessen.
# Ablauf und Regeln: docs/archiv/UEBERGABE-SEO.md, Abschnitt 3b.
#
#   scripts/seo-runde.sh pakete <arbeitsordner>          10 Pakete à 15 offene Titel nach <arbeitsordner>/pakete holen
#   scripts/seo-runde.sh pruefen <arbeitsordner>         lokale Suche: Laenge, Quellwoerter, „Regie“ in Serientexten
#   scripts/seo-runde.sh einspielen <arbeitsordner> <nr> Probelauf + scharf einspielen, texte/ nach runden/runde-<nr>
#
# Arbeitsordner z. B. das Scratchpad der Sitzung. Darin: pakete/ (Eingang), texte/ (Bearbeiter schreiben
# texte-NN.json), runden/ (Archiv). Bearbeiter-Auftrag: backend/scripts/seo-auftrag-faecher.md,
# Prompt-Vorlage: backend/scripts/seo-auftrag-prompt.txt.
#
# WICHTIG (17.09.2026): „einspielen“ erst, wenn ALLE Bearbeiter fertig gemeldet haben — vorhandene
# Dateien reichen nicht. Neue Pakete erst danach mit „pakete“ holen (gleiche Dateinamen!).
set -e
BEFEHL=$1; W=$2
[ -n "$W" ] || { echo "Aufruf: $0 pakete|pruefen|einspielen <arbeitsordner> [runde]"; exit 1; }
SSH=(ssh -i $HOME/.ssh/id_ed25519 -o BatchMode=yes -o ServerAliveInterval=20 root@movietaste.de)
mkdir -p $W/pakete $W/texte $W/runden

case $BEFEHL in
pakete)
  ls $W/texte/*.json >/dev/null 2>&1 && { echo "texte/ ist nicht leer — erst einspielen oder aufraeumen"; exit 1; }
  rm -f $W/pakete/*.json
  $SSH "docker exec movietaste-backend-1 sh -c 'cd /app/backend && rm -rf /tmp/pakete && node scripts/seo-pakete.mjs --pakete 10 --je 15 --ziel /tmp/pakete' | head -1 && rm -rf /tmp/pakete-host && docker cp movietaste-backend-1:/tmp/pakete /tmp/pakete-host >/dev/null"
  scp -q -i ~/.ssh/id_ed25519 "root@movietaste.de:/tmp/pakete-host/*.json" $W/pakete/
  echo "Pakete: $(ls $W/pakete | wc -l | tr -d ' ')"
  ;;
pruefen)
  node -e "
  const fs=require('fs');const W='$W';let n=0,bad=0,h=0;
  const Q=/datens[aä]tz|inhaltsangabe|verzeichnet|hinterlegt|eingetragen|vermerkt|schlagw[oö]rt|angegeben|ausgewiesen|\bangabe|\beintr[aä]g|(?:die|der|laut) beschreibung|welche (?:figur|person|rolle)[^.]*(?:spiel|übernehm|verkörper)[^.]*offen|nur schwer passt|nicht (?:genannt|bekannt|überliefert)|lässt sich nicht (?:sagen|entnehmen)|unplausibel|Tippfehler|in der Quelle|meisterhaft|Oscar|preisgekr|bahnbrechend|Superstar|legendär|Kultfilm/i;
  for(const f of fs.readdirSync(W+'/texte').filter(f=>f.endsWith('.json'))){
    const o=JSON.parse(fs.readFileSync(W+'/texte/'+f,'utf8'));
    for(const [k,v] of Object.entries(o)){n++;
      const w=v.replace(/^#{1,6}.*$/gm,'').split(/\s+/).filter(Boolean).length;if(w<250||w>420){bad++;console.log('LAENGE',f,k,w)}
      const s=v.split(/(?<=[.!?])\s+/).filter(x=>Q.test(x)||(k.startsWith('series:')&&/Regie(?!r)|Regisseur/.test(x)));
      if(s.length){h++;console.log('PRUEFEN',f,k,'|',s.join(' || ').replace(/\n/g,' ').slice(0,260))}}}
  console.log(n,'Texte,',bad,'Laengenverstoesse,',h,'Texte zum Ansehen (Treffer koennen Handlung sein)');"
  ;;
einspielen)
  R=$3; [ -n "$R" ] || { echo "Rundennummer fehlt"; exit 1; }
  $SSH "rm -rf /tmp/texte-host && mkdir -p /tmp/texte-host"
  scp -q -i ~/.ssh/id_ed25519 $W/texte/*.json root@movietaste.de:/tmp/texte-host/
  $SSH "docker exec movietaste-backend-1 rm -rf /tmp/texte && docker cp /tmp/texte-host movietaste-backend-1:/tmp/texte >/dev/null && docker exec movietaste-backend-1 sh -c 'cd /app/backend && node scripts/seo-einspielen.mjs --verzeichnis /tmp/texte --dry-run' | grep -A40 '^Probelauf'"
  $SSH "docker exec movietaste-backend-1 sh -c 'cd /app/backend && node scripts/seo-einspielen.mjs --verzeichnis /tmp/texte' | grep '^Geschrieben'"
  echo "Titeltexte in DB: $($SSH "cd /opt/movietaste && docker compose -f docker-compose.yml --profile prod exec -T postgres psql -U postgres -d filme_serien -Atc \"SELECT count(*) FROM seo_content WHERE bereich='titel' AND locale='de-de'\"")"
  mv $W/texte $W/runden/runde-$R && mkdir -p $W/texte
  ;;
*) echo "Unbekannter Befehl $BEFEHL"; exit 1 ;;
esac
