# Build-Kontext ist das Repo-Root (siehe docker-compose.yml), damit das Image
# neben dem Backend auch die statischen Frontend-Dateien (index.html,
# impressum.html, datenschutz.html) enthält -- server.js liefert sie direkt aus.
FROM node:20-alpine
WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY index.html impressum.html datenschutz.html reset-password.html ./
COPY backend/ ./backend/

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
