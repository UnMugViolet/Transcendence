# Multi-stage build for development and production
FROM node:20 AS base

WORKDIR /app

COPY package*.json ./

RUN npm install && \
	npm cache clean --force && \
	apt update && apt install -y sqlite3 libsqlite3-dev && \
	rm -rf /var/lib/apt/lists/*

# Development stage
FROM base AS development

RUN npm install -g nodemon

COPY . .

COPY languages /app/languages

RUN npm rebuild better-sqlite3

EXPOSE 3000

CMD ["nodemon", "srcs/server.js"]

# Production build stage
FROM base AS builder

COPY . .

# Install openssl for SSL certificates
RUN apt-get update && apt-get install -y openssl \
    && mkdir -p /app/ssl \
    && openssl req -x509 -nodes -days 365 \
        -subj "/CN=localhost" \
        -newkey rsa:2048 \
        -keyout /app/ssl/selfsigned.key \
        -out /app/ssl/selfsigned.crt

COPY languages /app/languages

RUN npm rebuild better-sqlite3

# Production stage
FROM base AS production

COPY --from=builder /app /app
COPY --from=builder /app/ssl /app/ssl

ENV NODE_ENV=production
ENV SSL_CERT_PATH=/app/ssl/selfsigned.crt
ENV SSL_KEY_PATH=/app/ssl/selfsigned.key

EXPOSE 3000 3443

CMD ["node", "srcs/server.js"]
