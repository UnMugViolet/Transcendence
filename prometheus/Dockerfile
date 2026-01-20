FROM alpine:latest AS builder

# Generate self-signed certificates
RUN apk add --no-cache openssl && \
    mkdir -p /ssl && \
    openssl req -x509 -nodes -days 365 \
        -subj "/CN=localhost" \
        -newkey rsa:2048 \
        -keyout /ssl/selfsigned.key \
        -out /ssl/selfsigned.crt && \
    chmod 644 /ssl/selfsigned.key /ssl/selfsigned.crt

FROM prom/prometheus:latest

USER root

# Copy certificates from builder
COPY --from=builder /ssl/selfsigned.crt /etc/prometheus/ssl/selfsigned.crt
COPY --from=builder /ssl/selfsigned.key /etc/prometheus/ssl/selfsigned.key

RUN chown -R nobody:nobody /etc/prometheus/ssl && \
    chmod 644 /etc/prometheus/ssl/selfsigned.key /etc/prometheus/ssl/selfsigned.crt

USER nobody

EXPOSE 9090
