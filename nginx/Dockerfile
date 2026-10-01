# TLS reverse proxy: serves the built React SPA and proxies /api to the backend.
# The SPA itself is built by the `frontend` service and handed over through the
# spa_dist volume, so this image carries no application code.
# ═══════════════════════════════════════════════════════════

FROM debian:bookworm

# Install nginx with modules + OpenSSL for TLS
RUN apt-get update && apt-get install -y \
	nginx-extras \
	netcat-openbsd \
	openssl \
	curl \
	&& rm -rf /var/lib/apt/lists/*

# Create secure vault directory for TLS keys
RUN mkdir -p /etc/nginx/ssl

# Generate Self-Signed TLS certificates (v1.2/v1.3)
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
	-keyout /etc/nginx/ssl/transcendence.key \
	-out /etc/nginx/ssl/transcendence.crt \
	-subj "/C=MY/ST=Selangor/L=Subang Jaya/O=42KL/OU=Transcendence/CN=transcendence-ludo"

# conf/ is bind-mounted by compose so it can be edited without a rebuild; this
# COPY is the fallback that keeps the image runnable on its own.
COPY conf/nginx.conf /etc/nginx/nginx.conf

COPY nginx.sh /usr/local/bin/nginx.sh
RUN chmod +x /usr/local/bin/nginx.sh

# Open ONLY port 443 (HTTPS) to the public
EXPOSE 443

ENTRYPOINT ["/usr/local/bin/nginx.sh"]
