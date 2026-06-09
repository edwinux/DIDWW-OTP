# DIDWW-OTP: Intelligent Voice & SMS OTP Gateway

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](Dockerfile)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)](package.json)

**Cut authentication costs by 90% with intelligent multi-channel OTP delivery.**

DIDWW-OTP is a production-ready OTP gateway that delivers One-Time Passwords via SMS and Voice calls using wholesale SIP trunking. Features intelligent fraud detection, real-time status tracking, and a built-in admin panel.

---

## Features

- **Multi-Channel Delivery** - SMS with automatic voice fallback
- **Real-Time Status Tracking** - WebSocket events for granular delivery status
- **Fraud Detection** - Rate limiting, IP reputation, ASN blocking, shadow banning
- **Admin Dashboard** - Live monitoring, logs browser, OTP tester
- **Cost Efficient** - Pay only for call duration (1/1 billing)
- **Zero Cost on No-Answer** - Unlike SMS, unanswered calls cost nothing

---

## Quick Start

```bash
docker run -d --name didww-otp \
  -p 80:80 \
  -p 8080:8080 \
  -p 5060:5060/udp \
  -p 10000-10020:10000-10020/udp \
  -v otp-data:/data \
  -e DIDWW_SIP_HOST=nyc.us.out.didww.com \
  -e DIDWW_USERNAME=your_sip_username \
  -e DIDWW_PASSWORD=your_sip_password \
  -e DIDWW_CALLER_ID=12125551234 \
  -e PUBLIC_IP=your_server_ip \
  -e API_SECRET=your_api_secret \
  -e SMS_ENABLED=true \
  -e SMS_USERNAME=your_sms_username \
  -e SMS_PASSWORD=your_sms_password \
  -e ADMIN_ENABLED=true \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=your_admin_password \
  ghcr.io/edwinux/didww-otp
```

Access the admin panel at `http://your_server_ip/`

---

## Docker Compose Deployment (Recommended)

Create a `docker-compose.yml`:

```yaml
services:
  didww-otp:
    image: ghcr.io/edwinux/didww-otp:latest
    container_name: didww-otp
    restart: unless-stopped
    env_file:
      - .env
    ports:
      # Admin UI (container:80 -> host:8080) - proxy via nginx
      - "127.0.0.1:8080:80"
      # API (container:8080 -> host:8081) - proxy via nginx
      - "127.0.0.1:8081:8080"
      # SIP signaling (direct, cannot proxy)
      - "5060:5060/udp"
      # RTP media (direct, cannot proxy)
      - "10000-10020:10000-10020/udp"
    volumes:
      # CRITICAL: Mount to /data (NOT /app/data)
      # Database is stored at /data/otp.db
      - didww-data:/data

volumes:
  didww-data:
```

Create a `.env` file:

```bash
# ===========================================
# REQUIRED - DIDWW SIP Credentials
# ===========================================
DIDWW_SIP_HOST=nyc.us.out.didww.com
DIDWW_USERNAME=your_sip_username
DIDWW_PASSWORD=your_sip_password
DIDWW_DID_NUMBER=+1234567890

# ===========================================
# REQUIRED - Server Configuration
# ===========================================
PUBLIC_IP=your.server.public.ip
API_SECRET=generate_with_openssl_rand_hex_32

# ===========================================
# Admin Dashboard
# ===========================================
ADMIN_ENABLED=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password_min_8_chars
# Session signing secret (>=16 chars). If unset, a random per-process secret is
# generated and ALL admin sessions are lost on every restart/redeploy. Set in production.
ADMIN_SESSION_SECRET=generate_with_openssl_rand_hex_32
# Session cookie Secure flag: 'auto' (default) sets Secure when the request is HTTPS
# (works behind a TLS proxy that forwards X-Forwarded-Proto + TRUST_PROXY set).
ADMIN_COOKIE_SECURE=auto
# Comma-separated CORS origins allowed to call the admin API cross-origin. Empty
# (default) blocks cross-origin access. Set only for local dev, e.g. http://localhost:5173
ADMIN_CORS_ORIGINS=

# ===========================================
# SMS Configuration (DIDWW SMS API)
# ===========================================
SMS_ENABLED=true
SMS_USERNAME=your_sms_api_username
SMS_PASSWORD=your_sms_api_password
SMS_MESSAGE_TEMPLATE=Your verification code is: {code}

# ===========================================
# CDR Streaming (for billing/cost tracking)
# ===========================================
CDR_ENABLED=true
# CDR_TARGET_TRUNK_ID=optional_trunk_uuid
```

Start the service:

```bash
docker compose up -d
```

> **Important:** Use `docker compose down && docker compose up -d` to reload `.env` changes. A simple `docker compose restart` does NOT reload environment variables.

---

## Port Architecture

| Service | Container Port | Host Port (recommended) | Purpose |
|---------|---------------|------------------------|---------|
| Admin UI | 80 | 8080 (localhost only) | Web dashboard, WebSocket `/admin/ws` |
| API | 8080 | 8081 (localhost only) | REST API endpoints |
| SIP | 5060/udp | 5060 (public) | SIP signaling |
| RTP | 10000-10020/udp | 10000-10020 (public) | Voice media |

---

## DIDWW Webhook Configuration

Configure these URLs in your DIDWW console:

| Webhook | URL | Purpose |
|---------|-----|---------|
| SMS Delivery Reports | `https://your-domain/webhooks/dlr` | SMS delivery status updates |
| CDR Streaming | `https://your-domain/webhooks/cdr` | Voice call billing records |

> **Inbound auth:** If you set `WEBHOOK_INBOUND_SECRET`, append `?token=<WEBHOOK_INBOUND_SECRET>` to **both** callback URLs above (DIDWW callbacks send no custom headers), otherwise these endpoints reject the callbacks with `403`. Leave it unset to accept callbacks unauthenticated.

---

## Nginx Reverse Proxy with SSL

For production deployments behind nginx with SSL:

> **Required headers:** Every proxied location below forwards both `X-Forwarded-Proto $scheme` (so `ADMIN_COOKIE_SECURE=auto` can detect HTTPS and set the `Secure` cookie flag) and `X-Forwarded-For $proxy_add_x_forwarded_for` (so the gateway can derive the real client IP for rate limiting and the admin IP whitelist). Keep `TRUST_PROXY` set to the number of proxy hops (default `1` for the single nginx below). With one trusted hop, the last `X-Forwarded-For` entry — appended by nginx — is the real client IP; do not add extra untrusted proxies without raising `TRUST_PROXY` to match.

```nginx
upstream didww_admin {
    server 127.0.0.1:8080;  # Admin UI
}

upstream didww_api {
    server 127.0.0.1:8081;  # API
}

server {
    listen 80;
    server_name your-domain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # API endpoints -> API upstream (port 8081)
    location /dispatch {
        proxy_pass http://didww_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://didww_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /webhooks {
        proxy_pass http://didww_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Admin WebSocket -> Admin upstream (port 8080)
    location /admin/ws {
        proxy_pass http://didww_admin;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Admin UI (everything else) -> Admin upstream (port 8080)
    location / {
        proxy_pass http://didww_admin;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Cloudflare Configuration

If using Cloudflare:

1. **SSL Mode:** Full (Strict) - requires valid SSL certificate on origin server
2. **Proxied (orange cloud):** Only for HTTP/HTTPS traffic (ports 80/443)
3. **DNS-only (gray cloud):** Required for SIP/RTP traffic (Cloudflare cannot proxy UDP)

**Firewall ports to open:**
| Port | Protocol | Purpose | Cloudflare Compatible |
|------|----------|---------|----------------------|
| 80 | TCP | HTTP/Let's Encrypt | Yes |
| 443 | TCP | HTTPS | Yes |
| 5060 | UDP | SIP signaling | No (direct only) |
| 10000-10020 | UDP | RTP media | No (direct only) |

For Cloudflare real IP detection, add to nginx:
```nginx
# Cloudflare IP ranges
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
real_ip_header CF-Connecting-IP;
```

---

## API Reference

### Authentication

Most API endpoints (`/dispatch`, the legacy `/send-otp`, and `/webhooks/auth`) require authentication via:
- Request body: `"secret": "your_api_secret"`
- Or header: `X-API-Secret: your_api_secret`

The secret is compared in constant time. `/health` requires no authentication. Inbound DIDWW callbacks (`/webhooks/dlr`, `/webhooks/cdr`) use a separate token — see [POST /webhooks/dlr](#post-webhooksdlr) and `WEBHOOK_INBOUND_SECRET`.

---

### POST /dispatch

Send an OTP via SMS and/or Voice.

**Request:**
```json
{
  "phone": "+14155551234",
  "code": "123456",
  "channels": ["sms", "voice"],
  "session_id": "optional-session-id",
  "webhook_url": "https://your-app.com/webhook"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phone` | string | Yes | Phone number in E.164 format |
| `code` | string | Yes | 4-8 digit OTP code |
| `channels` | array | No | Delivery channels: `["sms", "voice"]` (default: both) |
| `session_id` | string | No | Your session identifier for tracking |
| `webhook_url` | string | No | URL for delivery status webhooks |

**Response:**
```json
{
  "status": "sending",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "channel": "sms",
  "phone": "+14155551234"
}
```

---

### POST /send-otp (Deprecated)

Legacy voice-only endpoint. Use `/dispatch` instead.

```json
{
  "phone": "+14155551234",
  "code": "123456"
}
```

---

### GET /health

Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "asterisk": "connected",
  "uptime": 3600,
  "version": "1.0.0"
}
```

---

### POST /webhooks/dlr

DIDWW Delivery Report callback endpoint (called by DIDWW).

Receives SMS delivery status updates in JSON:API format.

**Inbound authentication:** When `WEBHOOK_INBOUND_SECRET` is set, this endpoint (and `/webhooks/cdr`) requires a matching token, supplied either via the `X-Webhook-Token` header or a `?token=` query parameter; the token is compared in constant time and a mismatch returns `403`. Because DIDWW's callback configuration only lets you set a URL (no custom headers), append the token to the configured callback URL, e.g. `https://your-domain/webhooks/dlr?token=<WEBHOOK_INBOUND_SECRET>` (do the same for the CDR URL). If `WEBHOOK_INBOUND_SECRET` is unset, callbacks are accepted without authentication and a per-request warning is logged.

---

### POST /webhooks/auth

Authentication feedback endpoint for closed-loop learning.

**Request:**
```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "success": true
}
```

---

## OTP Statuses

High-level status values for OTP requests:

| Status | Description |
|--------|-------------|
| `pending` | Request received, queued for processing |
| `sending` | OTP is being sent via selected channel |
| `sent` | OTP sent to carrier/network |
| `delivered` | OTP confirmed delivered to device |
| `failed` | Delivery failed |
| `verified` | OTP code verified successfully |
| `rejected` | Request rejected by fraud detection |
| `expired` | OTP code has expired |

---

## Channel Events

Granular, channel-specific events for real-time tracking.

### SMS Events

| Event | Description | Maps to Status |
|-------|-------------|----------------|
| `sending` | SMS being sent to API | `sending` |
| `sent` | SMS accepted by carrier | `sent` |
| `delivered` | SMS delivered to device (via DLR) | `delivered` |
| `failed` | SMS delivery failed | `failed` |
| `undelivered` | SMS could not be delivered | `failed` |

### Voice Events

| Event | Description | Maps to Status |
|-------|-------------|----------------|
| `calling` | Initiating outbound call | `sending` |
| `ringing` | Phone is ringing | `sent` |
| `answered` | Call answered by recipient | `sent` |
| `playing` | Playing OTP audio message | `sent` |
| `completed` | Call completed, OTP delivered | `delivered` |
| `hangup` | User hung up (with `otp_played` flag) | `failed`* |
| `no_answer` | No answer within timeout | `failed` |
| `busy` | Line busy | `failed` |
| `failed` | Call failed (network error) | `failed` |

*Note: `hangup` with `otp_played: true` indicates successful delivery (user heard the code).

---

## WebSocket Events

Connect to `/admin/ws` for real-time status updates.

> **Authentication required:** The `/admin/ws` endpoint now requires an authenticated admin session at the WebSocket handshake. The browser must present a valid signed `admin.sid` cookie (obtained via the admin login flow), and the same session TTL (`ADMIN_SESSION_TTL`, default 480 min) applies — once it expires the handshake is rejected and re-login is required. Unauthenticated upgrades are refused with `401`. This prevents unauthenticated clients from subscribing to the live event stream (which exposes phone numbers, fraud scores, and shadow-ban flags).

### Subscribing to Channels

```javascript
const ws = new WebSocket('wss://your-server/admin/ws');

ws.onopen = () => {
  // Subscribe to OTP status updates
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'otp-requests' }));

  // Subscribe to detailed channel events
  ws.send(JSON.stringify({ type: 'subscribe', channel: 'otp-events' }));
};
```

### Event Types

**otp-request:updated** - High-level status change
```json
{
  "type": "otp-request:updated",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "delivered",
    "channel": "sms",
    "channel_status": "delivered",
    "updated_at": 1702828800000
  }
}
```

**otp-event** - Granular channel event
```json
{
  "type": "otp-event",
  "data": {
    "request_id": "550e8400-e29b-41d4-a716-446655440000",
    "channel": "voice",
    "event_type": "answered",
    "event_data": {},
    "timestamp": 1702828800000
  }
}
```

---

## Admin Panel

Access at `http://your-server/` (port 80 by default).

### Features

- **Dashboard** - Real-time traffic charts, success rates, fraud scores
- **Logs Browser** - Search and filter OTP requests with pagination
- **OTP Tester** - Send test OTPs with live debug console
- **Database Browser** - Direct database access for debugging

### Admin API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/auth/login` | POST | Admin login |
| `/admin/auth/logout` | POST | Admin logout |
| `/admin/auth/session` | GET | Check session status |
| `/admin/logs/otp-requests` | GET | List OTP requests (paginated) |
| `/admin/logs/otp-requests/:id` | GET | Get single request details |
| `/admin/logs/stats` | GET | Get summary statistics |
| `/admin/logs/hourly-traffic` | GET | Get 24-hour traffic data |
| `/admin/logs/filters` | GET | Get available filter values |
| `/admin/test/send-otp` | POST | Send test OTP |
| `/admin/test/verify/:id` | POST | Verify test OTP code |
| `/admin/db/tables` | GET | List database tables |
| `/admin/db/query/:table` | GET | Query table data |

---

## Configuration

### Required Variables

| Variable | Description |
|----------|-------------|
| `DIDWW_SIP_HOST` | DIDWW SIP server (e.g., `nyc.us.out.didww.com`) |
| `DIDWW_USERNAME` | SIP trunk username |
| `DIDWW_PASSWORD` | SIP trunk password |
| `DIDWW_CALLER_ID` | Outbound caller ID (your DID) |
| `PUBLIC_IP` | Server's public IP address |
| `API_SECRET` | API authentication secret |

### SMS Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SMS_ENABLED` | `false` | Enable SMS channel |
| `SMS_USERNAME` | - | DIDWW SMS API username |
| `SMS_PASSWORD` | - | DIDWW SMS API password |
| `SMS_MESSAGE_TEMPLATE` | `Your code is: {code}` | SMS message template |

### Voice Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OTP_MESSAGE_TEMPLATE` | See below | Voice message template |
| `OTP_VOICE_SPEED` | `medium` | Voice speed: `slow`, `medium`, `fast` |
| `DIDWW_CALLER_ID_US_CANADA` | - | Caller ID for US/Canada destinations |

### Admin Panel

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_ENABLED` | `false` | Enable admin panel |
| `ADMIN_USERNAME` | - | Admin login username |
| `ADMIN_PASSWORD` | - | Admin login password |
| `ADMIN_PORT` | `80` | Admin panel port |
| `ADMIN_SESSION_SECRET` | _(random per-process)_ | Session signing secret (>=16 chars). If unset, a random secret is generated at startup and all sessions are lost on every restart/redeploy. Set in production. |
| `ADMIN_SESSION_TTL` | `480` | Session timeout (minutes) |
| `ADMIN_COOKIE_SECURE` | `auto` | Session cookie `Secure` flag: `auto` sets it when the request is HTTPS (needs `X-Forwarded-Proto` + `TRUST_PROXY` behind a TLS proxy), `true` always, `false` never (local HTTP dev only) |
| `ADMIN_CORS_ORIGINS` | _(empty)_ | Comma-separated allowlist of Origins permitted cross-origin access to the admin API. Empty blocks all cross-origin requests. Never use a wildcard (credentials are allowed) |

### Fraud Detection

| Variable | Default | Description |
|----------|---------|-------------|
| `FRAUD_ENABLED` | `true` | Enable fraud detection |
| `FRAUD_RATE_LIMIT_MINUTE` | `2` | Max requests per phone per minute |
| `FRAUD_RATE_LIMIT_HOUR` | `5` | Max requests per phone per hour |
| `FRAUD_SHADOW_BAN_THRESHOLD` | `50` | Fraud score threshold for shadow banning |

### Channel Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CHANNELS_DEFAULT` | `sms,voice` | Default channels if not specified |
| `CHANNELS_ENABLE_FAILOVER` | `true` | Auto-failover to next channel on failure |

### CDR Streaming

| Variable | Default | Description |
|----------|---------|-------------|
| `CDR_ENABLED` | `false` | Enable CDR webhook endpoint for billing |
| `CDR_TARGET_TRUNK_ID` | - | Filter CDRs by trunk UUID (optional) |
| `CDR_LEARNING_INTERVAL_MINUTES` | `60` | Rate learning interval |
| `CDR_LEARNING_BATCH_SIZE` | `1000` | Batch size for rate learning |

### Network Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TRUST_PROXY` | `1` | Number of trusted reverse-proxy hops in front of the app (`1` = single nginx). Determines how `req.ip` is derived, which drives IP rate limiting, ASN/geo blocking, and the admin IP whitelist. Use `0` only when there is no proxy. Never set `true` — it trusts the entire client-controllable `X-Forwarded-For` chain and lets attackers spoof their source IP |
| `HTTP_PORT` | `8080` | API server port |
| `SIP_PORT` | `5060` | SIP signaling port |
| `RTP_PORT_START` | `10000` | RTP port range start |
| `RTP_PORT_END` | `10020` | RTP port range end |

---

## Fraud Detection

Built-in fraud protection includes:

### Rate Limiting
- Per-phone limits (configurable per minute/hour)
- Per-IP subnet limits
- Automatic throttling

### IP Reputation
- Track request patterns per IP subnet
- Automatic trust scoring
- Shadow banning for suspicious IPs

### ASN Blocking
- Block known VPN/proxy/datacenter ASNs
- Configurable blocklist

### Shadow Banning
- High fraud score requests appear successful but are not delivered
- Prevents attackers from knowing they're blocked

### Outbound Webhook SSRF Protection
- Client-supplied `webhook_url` targets are validated before each delivery: any URL resolving to a private, loopback, link-local (incl. cloud metadata `169.254.169.254`), CGNAT, or reserved IPv4/IPv6 address is permanently blocked (not retried) and logged
- Only `http`/`https` schemes are allowed; the hostname is DNS-resolved at send time and every resolved address must be public
- HTTP redirects are not followed (`redirect: manual`), so a webhook server cannot redirect into an internal address
- This prevents callers from reaching internal services (cloud metadata, Asterisk ARI, the admin panel) via the webhook delivery mechanism

### Fraud Score Factors
- Request velocity
- IP reputation
- Phone prefix patterns (IRSF detection)
- Geographic anomalies

---

## Architecture

```
┌─────────────┐    POST /dispatch    ┌──────────────────┐
│  Your App   │ ──────────────────▶  │   OTP Gateway    │
└─────────────┘                      └────────┬─────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
           ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
           │  SMS Channel │          │ Voice Channel│          │ Fraud Engine │
           │  (DIDWW API) │          │  (Asterisk)  │          │              │
           └──────┬───────┘          └──────┬───────┘          └──────────────┘
                  │                         │
                  │                         │ SIP/RTP
                  ▼                         ▼
           ┌──────────────┐          ┌──────────────┐
           │  SMS Gateway │          │  DIDWW Trunk │
           └──────┬───────┘          └──────┬───────┘
                  │                         │
                  │                         │ PSTN
                  ▼                         ▼
           ┌────────────────────────────────────────┐
           │              User's Phone              │
           │  SMS: "Your code is 123456"            │
           │  Voice: "Your code is 1. 2. 3. 4..."   │
           └────────────────────────────────────────┘
```

---

## Development

```bash
# Clone repository
git clone https://github.com/edwinux/DIDWW-OTP.git
cd DIDWW-OTP

# Install dependencies
npm install

# Build TypeScript
npm run build

# Build admin panel
cd admin && npm install && npm run build && cd ..

# Run with Docker Compose
cp .env.example .env
# Edit .env with your credentials
docker compose up --build
```

---

## Prerequisites

- [DIDWW](https://www.didww.com/) account with:
  - SIP trunk credentials
  - SMS API credentials (optional)
  - At least one DID for caller ID
- Server with public IP address
- Docker (recommended) or Node.js 20+

---

## Troubleshooting

### "Admin UI is disabled" in logs

- Ensure `ADMIN_ENABLED=true` (not `ADMIN_UI_ENABLED`)
- The password must be at least 8 characters
- Requires full container recreation: `docker compose down && docker compose up -d`

### Data/settings lost after restart

- Volume must mount to `/data` not `/app/data`
- Database is stored at `/data/otp.db`
- Check volume mount: `docker exec didww-otp ls -la /data/`

### CDR webhook not receiving data

- Set `CDR_ENABLED=true` in `.env`
- Verify in logs: should show "CDR webhook endpoint registered"
- Configure webhook URL in DIDWW console: `https://your-domain/webhooks/cdr`

### Environment variables not updating

- `docker compose restart` does NOT reload `.env` files
- Must use: `docker compose down && docker compose up -d`
- Verify with: `docker exec didww-otp env | grep VARIABLE_NAME`

### SIP registration failing

- Ensure `PUBLIC_IP` is set to your server's actual public IP
- Check firewall allows UDP 5060 and 10000-10020
- SIP/RTP cannot go through Cloudflare proxy (must be DNS-only)

### WebSocket not connecting

- Nginx must have `proxy_set_header Upgrade` and `Connection "upgrade"` for `/admin/ws`
- Check `proxy_read_timeout` is set high (e.g., 86400 for 24h)

### SMS not sending

- SMS uses separate DIDWW API credentials (not SIP credentials)
- Set both `SMS_USERNAME` and `SMS_PASSWORD`
- Verify `SMS_ENABLED=true`

---

## License

MIT - see [LICENSE](LICENSE) for details.

**Disclaimer:** This project is provided as-is. Users are responsible for regulatory compliance (GDPR, TCPA, etc.) and telecommunications fraud mitigation.
