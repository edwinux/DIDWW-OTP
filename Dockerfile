# =============================================================================
# DIDWW Voice OTP Gateway - Multi-stage Docker Build
# =============================================================================

# Stage 1: Build backend TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npm run build \
    && npm prune --production \
    && rm -rf /root/.npm

# Stage 2: Build admin frontend
FROM node:20-alpine AS admin-builder
WORKDIR /app/admin
COPY admin/package*.json admin/tsconfig.json admin/vite.config.ts admin/index.html ./
COPY admin/tailwind.config.js admin/postcss.config.js ./
RUN npm ci
COPY admin/src/ ./src/
COPY admin/public/ ./public/
RUN npm run build \
    && rm -rf node_modules /root/.npm

# Stage 3: Production runtime with Asterisk
FROM alpine:3.19

# Install runtime dependencies including PicoTTS
RUN apk add --no-cache \
    asterisk \
    asterisk-sounds-en \
    nodejs \
    gettext \
    bash \
    sox \
    picotts \
    && rm -rf /var/cache/apk/* \
    && rm -rf /usr/share/asterisk/sounds/en/silence \
    && rm -rf /usr/share/asterisk/sounds/en/hello-world.* \
    && find /var/lib/asterisk -name "*.txt" -delete \
    && mkdir -p /var/lib/asterisk/sounds/tts

# Create app and data directories
WORKDIR /app
RUN mkdir -p /data

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy admin frontend build
COPY --from=admin-builder /app/admin/dist ./admin/dist

# Copy Asterisk config templates
COPY src/config/templates /etc/asterisk/templates

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports
# 80   - Admin UI (HTTP)
# 8080 - HTTP API
# 5060 - SIP signaling (UDP)
# 10000-10020 - RTP media (UDP)
EXPOSE 80 8080 5060/udp 10000-10020/udp

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
