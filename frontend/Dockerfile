# Multi-stage build for development and production
FROM node:20 AS base

WORKDIR /app

COPY package*.json ./
RUN npm install

# Development stage
FROM base AS development

# Install development dependencies
RUN npm install

COPY . .

# Copy data folder to dist (needed for static assets)
RUN cp -r srcs/data dist/
RUN mkdir -p languages && cp -r srcs/languages/* languages/


# Expose port for development server
EXPOSE 3001

# Development command - watch for changes
CMD ["npm", "run", "dev"]

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

RUN npm run build-ts
RUN npm run build-css

# Production stage
FROM nginx:alpine AS production

COPY --from=builder /app/index.html /usr/share/nginx/html
COPY --from=builder /app/dist /usr/share/nginx/html/dist
COPY --from=builder /app/img /usr/share/nginx/html/img
COPY --from=builder /app/ssl/selfsigned.crt /etc/ssl/certs/selfsigned.crt
COPY --from=builder /app/ssl/selfsigned.key /etc/ssl/private/selfsigned.key

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY srcs/languages /usr/share/nginx/html/languages
COPY srcs/css /usr/share/nginx/html/srcs/css

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
