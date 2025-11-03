# Utiliser Node 20
FROM node:20 AS builder

WORKDIR /app

COPY package*.json ./

RUN npm install

# Install openssl so we can generate a self-signed certificate in the build
RUN apt-get update && apt-get install -y openssl \
	&& mkdir -p /app/ssl \
	&& openssl req -x509 -nodes -days 365 \
		-subj "/CN=localhost" \
		-newkey rsa:2048 \
		-keyout /app/ssl/selfsigned.key \
		-out /app/ssl/selfsigned.crt


COPY . .

CMD ["npm", "run", "dev"]

FROM nginx:alpine

COPY --from=builder /app/index.html /usr/share/nginx/html
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/upload /usr/share/nginx/html/upload

# Copy the generated self-signed certificate into the nginx image
COPY --from=builder /app/ssl/selfsigned.crt /etc/ssl/certs/selfsigned.crt
COPY --from=builder /app/ssl/selfsigned.key  /etc/ssl/private/selfsigned.key

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY src/languages /usr/share/nginx/html/languages
# Exposer un port (si nécessaire pour dev server)
EXPOSE 443

# Commande par défaut : builder le CSS
CMD ["nginx", "-g", "daemon off;"]
