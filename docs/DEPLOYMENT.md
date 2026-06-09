# Deployment Guide

This guide covers deploying the DIDWW Voice OTP Gateway to various environments.

## Table of Contents

- [Requirements](#requirements)
- [Operational Security Requirements](#operational-security-requirements)
- [VPS Deployment](#vps-deployment)
- [Docker Compose (Production)](#docker-compose-production)
- [Cloud Platforms](#cloud-platforms)
- [Port Forwarding](#port-forwarding)
- [Reverse Proxy Setup](#reverse-proxy-setup)

## Requirements

### Network Requirements

The gateway requires specific ports to be accessible from the internet:

| Port | Protocol | Purpose |
|------|----------|---------|
| 8080 | TCP | HTTP API (configurable) |
| 5060 | UDP | SIP signaling |
| 10000-10020 | UDP | RTP media (audio) |

**Important:** The RTP ports must be directly accessible. NAT traversal for RTP is limited.

### DIDWW Requirements

1. Active DIDWW account
2. SIP trunk credentials (username/password)
3. At least one DID (phone number) for caller ID
4. Trunk configured for your server's IP (if using IP-based auth)

## Operational Security Requirements

The gateway runs behind a TLS-terminating reverse proxy in production. The following settings **must** be configured correctly together — getting any one wrong silently weakens fraud protection, admin access control, or session handling. See [Reverse Proxy Setup](#reverse-proxy-setup) for the matching nginx configuration.

### Proxy trust (`TRUST_PROXY`)

`req.ip` is the single source of truth for the client IP across the whole system: per-IP/subnet fraud rate limiting, ASN/geo blocking on `/dispatch`, the admin IP whitelist, and the `ADMIN_COOKIE_SECURE=auto` HTTPS decision. Express derives `req.ip` from the `trust proxy` setting, which is controlled by `TRUST_PROXY`.

- Set `TRUST_PROXY` to the **number of trusted proxy hops** in front of the app. The default `1` matches the standard single-nginx deployment.
- Use `0` only when there is **no** reverse proxy in front of the gateway.
- **Never** use `true`. It trusts the entire client-controllable `X-Forwarded-For` chain, letting an attacker spoof `req.ip` to bypass IP rate limiting **and** the admin IP whitelist.
- Setting it too low (`0`) behind a real proxy makes every request appear to originate from the proxy IP, breaking per-client differentiation.

> Note: a client-supplied `ip` field in the `/dispatch` request body is **ignored** — the fraud IP comes exclusively from the trusted proxy chain. Callers that previously passed `ip` must rely on the real source IP instead.

### nginx forwarding headers

For the settings above to work, the proxy must forward both:

- `X-Forwarded-Proto $scheme` — so `ADMIN_COOKIE_SECURE=auto` detects HTTPS and sets the `Secure` flag on the `admin.sid` session cookie. Without it, Express sees plain HTTP and the cookie may be sent insecurely.
- The real client IP as the **last** `X-Forwarded-For` hop — so IP rate limiting, ASN/geo blocking, and the admin IP whitelist see the actual client. `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` appends the client IP; with `TRUST_PROXY=1` Express reads exactly that last hop.

### Admin session secret (`ADMIN_SESSION_SECRET`)

Set a strong random `ADMIN_SESSION_SECRET` (min 16 chars; e.g. `openssl rand -hex 32`) in production. If it is unset, a random per-process secret is generated at startup and **all admin sessions are invalidated on every restart/redeploy**, forcing re-login. A startup warning is logged when it is missing.

### Admin cookie Secure flag (`ADMIN_COOKIE_SECURE`)

Leave at the default `auto`, which sets the cookie `Secure` flag only when the request is HTTPS. This depends on the proxy forwarding `X-Forwarded-Proto` and on `TRUST_PROXY` being set (see above). The standard nginx deployment terminates TLS and forwards `X-Forwarded-Proto`, so `auto` yields Secure cookies in production. Set `ADMIN_COOKIE_SECURE=false` only for local plain-HTTP development.

### Admin CORS (`ADMIN_CORS_ORIGINS`)

Leave **unset** in production — the admin UI is served same-origin, so no cross-origin access is needed. Set it (comma-separated exact origins, e.g. `http://localhost:5173`) only for local development against the Vite dev server. Never use a wildcard: credentials are allowed on the admin API.

### Admin WebSocket authentication

The `/admin/ws` live-event WebSocket now **requires an authenticated admin session** at the handshake. The browser must present a valid signed `admin.sid` cookie from the login flow, and the same session TTL (`ADMIN_SESSION_TTL`, default 480 min) applies — after expiry the upgrade is rejected and re-login is required. Unauthenticated upgrades are refused (`401`), so no client can subscribe to the live OTP stream (phone numbers, fraud scores, shadow-ban flags) without logging in.

### Inbound webhook authentication (`WEBHOOK_INBOUND_SECRET`)

Optional but recommended. When unset, the inbound DIDWW callback endpoints `/webhooks/dlr` and `/webhooks/cdr` accept callbacks with **no authentication** (only a per-request warning is logged).

- Set `WEBHOOK_INBOUND_SECRET` to a strong shared secret to require a token on both inbound endpoints.
- Provide the token via the `X-Webhook-Token` header, or — since DIDWW's callback config typically only allows a URL — append `?token=<WEBHOOK_INBOUND_SECRET>` to the callback URL.
- You must update **both** the DIDWW **DLR** callback URL and the **CDR** callback URL with the token, or those callbacks will be rejected with `403`. (`/webhooks/auth` is unaffected — it uses the regular `API_SECRET`.)

```text
https://otp-gw.example.com/webhooks/dlr?token=<WEBHOOK_INBOUND_SECRET>
https://otp-gw.example.com/webhooks/cdr?token=<WEBHOOK_INBOUND_SECRET>
```

### Outbound webhook destinations (SSRF protection)

Client-configured outbound `webhook_url` targets must resolve to a **publicly routable** IP. The gateway blocks delivery to private, loopback, link-local (incl. cloud metadata `169.254.169.254`), CGNAT, and reserved ranges (IPv4 and IPv6), rejects non-`http(s)` schemes, and does **not** follow `30x` redirects. Blocked deliveries are logged as `Blocked` and are **not** retried. Webhook receivers must be on public hosts and return a `2xx` directly.

## VPS Deployment

### DigitalOcean / Linode / Vultr

1. **Create a droplet/instance:**
   - Ubuntu 22.04 LTS recommended
   - Minimum: 1 vCPU, 1GB RAM
   - Ensure you have a public IPv4 address

2. **Install Docker:**
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   # Log out and back in
   ```

3. **Configure firewall:**
   ```bash
   # UFW (Ubuntu)
   sudo ufw allow 22/tcp      # SSH
   sudo ufw allow 8080/tcp    # API
   sudo ufw allow 5060/udp    # SIP
   sudo ufw allow 10000:10020/udp  # RTP
   sudo ufw enable
   ```

4. **Run the gateway:**
   ```bash
   docker run -d \
     --name voice-otp \
     --restart unless-stopped \
     -e DIDWW_SIP_HOST=sip.didww.com \
     -e DIDWW_USERNAME=your_username \
     -e DIDWW_PASSWORD=your_password \
     -e DIDWW_CALLER_ID=12125551234 \
     -e PUBLIC_IP=$(curl -s ifconfig.me) \
     -e API_SECRET=your_secure_secret \
     -p 8080:8080 \
     -p 5060:5060/udp \
     -p 10000-10020:10000-10020/udp \
     ghcr.io/edwinux/didww-voice-gateway
   ```

5. **Verify deployment:**
   ```bash
   curl http://localhost:8080/health
   ```

### AWS EC2

1. **Launch an EC2 instance:**
   - Amazon Linux 2 or Ubuntu 22.04
   - t3.micro or larger
   - Assign an Elastic IP

2. **Configure Security Group:**
   ```
   Inbound Rules:
   - TCP 22 (SSH) from your IP
   - TCP 8080 (API) from anywhere (or your app's IP)
   - UDP 5060 (SIP) from DIDWW IPs
   - UDP 10000-10020 (RTP) from anywhere
   ```

3. **Install Docker and run** (same as VPS steps above)

## Docker Compose (Production)

For production deployments, use Docker Compose with proper configuration:

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  voice-otp:
    image: ghcr.io/edwinux/didww-voice-gateway
    container_name: voice-otp
    restart: unless-stopped
    network_mode: host  # Required for proper RTP handling
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

**Note:** `network_mode: host` is recommended for production to avoid Docker's NAT complications with RTP traffic.

### Environment File

Create `.env` from the example:

```bash
cp .env.example .env
# Edit with your values
nano .env
```

### Running

```bash
docker compose -f docker-compose.prod.yml up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart
docker compose -f docker-compose.prod.yml restart
```

## Cloud Platforms

### Fly.io

Fly.io works but requires careful UDP port configuration:

```toml
# fly.toml
app = "your-voice-otp"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  HTTP_PORT = "8080"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 8080

[[services]]
  internal_port = 5060
  protocol = "udp"

  [[services.ports]]
    port = 5060

# Note: RTP ports require Fly.io's UDP support
# Contact Fly.io support for high port range UDP
```

**Limitation:** Fly.io's UDP support for high port ranges (RTP) may require special configuration.

### Railway

Railway doesn't support UDP ports, making it **unsuitable** for this application.

### Render

Similar to Railway, Render has limited UDP support. **Not recommended.**

### Recommended Cloud Providers

For voice/VoIP workloads, traditional VPS providers work best:
- DigitalOcean
- Linode
- Vultr
- Hetzner
- AWS EC2 / Lightsail

## Port Forwarding

If running behind a NAT/router (home network, office, etc.):

### Required Port Forwards

| External Port | Internal Port | Protocol | Service |
|---------------|---------------|----------|---------|
| 8080 | 8080 | TCP | HTTP API |
| 5060 | 5060 | UDP | SIP |
| 10000-10020 | 10000-10020 | UDP | RTP |

### Router Configuration

1. Access your router admin panel
2. Find "Port Forwarding" or "NAT" settings
3. Add rules for each port/range above
4. Point to your server's internal IP

### PUBLIC_IP Setting

Set `PUBLIC_IP` to your **external/public** IP address, not the internal IP:

```bash
# Find your public IP
curl ifconfig.me

# Use this in your configuration
PUBLIC_IP=203.0.113.50
```

## Reverse Proxy Setup

You can put the HTTP API behind a reverse proxy for HTTPS. However, **do not proxy the SIP/RTP traffic**.

The proxy **must** forward `X-Forwarded-Proto` and the real client IP as the last `X-Forwarded-For` hop, and `TRUST_PROXY` must match the hop count (default `1`). See [Operational Security Requirements](#operational-security-requirements) for why.

### Nginx Example

```nginx
# /etc/nginx/sites-available/voice-otp
server {
    listen 443 ssl http2;
    server_name voice-otp.example.com;

    ssl_certificate /etc/letsencrypt/live/voice-otp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/voice-otp.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Append the real client IP as the LAST X-Forwarded-For hop. With TRUST_PROXY=1
        # Express reads exactly this hop as req.ip (IP rate limiting, ASN/geo, admin whitelist).
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # Forward the scheme so ADMIN_COOKIE_SECURE=auto detects HTTPS and sets the Secure flag.
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Admin WebSocket (/admin/ws) requires the upgrade headers to be forwarded.
    location /admin/ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name voice-otp.example.com;
    return 301 https://$server_name$request_uri;
}
```

### Caddy Example

```caddyfile
voice-otp.example.com {
    reverse_proxy localhost:8080
}
```

### With Let's Encrypt

```bash
# Nginx
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d voice-otp.example.com

# Caddy (automatic)
# Caddy handles TLS automatically
```

## Verification

After deployment, verify everything works:

```bash
# 1. Check health endpoint
curl https://voice-otp.example.com/health

# 2. Test OTP delivery
curl -X POST https://voice-otp.example.com/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1YOUR_PHONE",
    "code": "123456",
    "secret": "your_api_secret"
  }'
```

## Next Steps

- [Configuration Reference](CONFIGURATION.md) - All environment variables
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
