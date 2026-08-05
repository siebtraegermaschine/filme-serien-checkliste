# Build-Kontext ist das Repo-Root (siehe docker-compose.yml), damit das Image
# neben dem Backend auch die statischen Frontend-Dateien (index.html,
# impressum.html, datenschutz.html) enthält -- server.js liefert sie direkt aus.
FROM node:20-alpine
# pg_dump fuer die automatische Sicherung (siehe backend/lib/sicherung.js).
# Rund 15 MB -- die Alternative waere ein Cronjob auf dem Server, der bei jedem
# Umzug neu eingerichtet werden muesste.
#
# Ausdruecklich Version 16, passend zum postgres:16-alpine aus der
# docker-compose.yml. Ein unversioniertes "postgresql-client" gibt es in Alpine
# nicht als eigenes Paket -- sowohl postgresql16-client als auch
# postgresql17-client melden es nur als bereitgestellte Faehigkeit, die Auswahl
# waere also dem Zufall ueberlassen. Beide Versionen sind in Alpine 3.21 und
# 3.22 vorhanden (nachgesehen im Paketindex).
RUN apk add --no-cache postgresql16-client
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

# Nach Muster statt als Einzelliste: Die Liste war eine Falle -- neue Dateien
# (og-image.png fuer die Link-Vorschau, tmdb-logo.svg fuer die vorgeschriebene
# TMDB-Kennzeichnung, die Bilder des Einstiegs) fehlten im Image und liefen
# live in einen 404, obwohl index.html sie laengst einband. Der Build-Kontext
# ist ein sauberer Git-Auschecker, es kommt also nichts Fremdes mit; Skripte
# und Dokumentation passen auf keines der Muster.
COPY *.html *.png *.svg manifest.json ./
COPY tour/ ./tour/
COPY backend/ ./backend/

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
