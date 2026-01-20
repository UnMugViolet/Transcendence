FROM alpine:latest AS builder

# Generate self-signed certificates
RUN apk add --no-cache openssl && \
    mkdir -p /ssl && \
    openssl req -x509 -nodes -days 365 \
        -subj "/CN=localhost" \
        -newkey rsa:2048 \
        -keyout /ssl/selfsigned.key \
        -out /ssl/selfsigned.crt

FROM grafana/grafana:latest

USER root

# Copy certificates from builder
COPY --from=builder /ssl/selfsigned.crt /etc/grafana/ssl/selfsigned.crt
COPY --from=builder /ssl/selfsigned.key /etc/grafana/ssl/selfsigned.key

RUN chown -R grafana:root /etc/grafana/ssl && \
    chmod 600 /etc/grafana/ssl/selfsigned.key

USER grafana

EXPOSE 3000
