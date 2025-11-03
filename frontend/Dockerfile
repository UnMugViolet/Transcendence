# Utiliser Node 20
FROM node:20 AS builder

WORKDIR /app

# Copier les fichiers package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances (Tailwind + PostCSS)
RUN npm install

# Copier le reste du projet
COPY . .

CMD ["npm", "run", "dev"]

FROM nginx:alpine

COPY --from=builder /app/index.html /usr/share/nginx/html
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/upload /usr/share/nginx/html/upload

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY src/languages /usr/share/nginx/html/languages
# Exposer un port (si nécessaire pour dev server)
EXPOSE 80

# Commande par défaut : builder le CSS
CMD ["nginx", "-g", "daemon off;"]
