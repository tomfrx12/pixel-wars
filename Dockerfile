# 1. Construction du Frontend (Vite/React)
FROM node:20-alpine as build
WORKDIR /app/client

# On copie d'abord les dépendances du client
COPY client/package*.json ./
RUN npm install

# On copie le reste du code client et on build
COPY client/ .
RUN npm run build

# 2. Construction du Backend (Node.js/Express)
# Note: On utilise node:20 (pas alpine) pour éviter les problèmes de compilation de SQLite
FROM node:20 
WORKDIR /app/server

# On copie les dépendances du backend
COPY server/package*.json ./
RUN npm install

# On copie le code du backend
COPY server/ .

# 🔥 FORCE LA COMPILATION DE SQLITE POUR LE CONTENEUR LINUX 🔥
# Cette commande empêche l'erreur GLIBC en ignorant tout module précompilé externe
RUN npm rebuild sqlite3 --build-from-source

# On récupère le frontend compilé depuis l'étape 1 !
COPY --from=build /app/client/dist /app/client/dist

# Création du dossier pour les données persistantes
RUN mkdir -p /app/data
ENV DATA_DIR=/app/data

# Port sur lequel le backend Node écoute (celui qu'on a configuré dans index.js)
EXPOSE 80

# Commande pour démarrer le serveur (qui va gérer WebSockets, API et distribuer le Frontend)
CMD ["node", "--max-old-space-size=1024", "index.js"]