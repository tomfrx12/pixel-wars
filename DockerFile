#contruction du de l'image et du build
FROM node:22-alpine as build
WORKDIR /app
#copy des fichiers de dépendances
COPY package*.json ./
#node_modules
RUN npm i
#copy code source
COPY . .
RUN npm run build

#reprends nginx coté serveur
FROM nginx:alpine
#copy le build 'dist' là où nginx gere les sites web
COPY --from=build /app/dist /usr/share/nginx/html
#config nginx pour afficher la page
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

#conteneur est sur le port 80
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]