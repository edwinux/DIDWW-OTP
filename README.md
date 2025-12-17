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

## API Reference

### Authentication

All API endpoints (except `/health` and `/webhooks/dlr`) require authentication via:
- Request body: `"secret": "your_api_secret"`
- Or header: `X-API-Secret: your_api_secret`

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
  "webhook_url": "https://your-app.com/webhook",
  "ip": "223.206.64.19"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phone` | string | Yes | Phone number in E.164 format |
| `code` | string | Yes | 4-8 digit OTP code |
| `channels` | array | No | Delivery channels: `["sms", "voice"]` (default: both) |
| `session_id` | string | No | Your session identifier for tracking |
| `webhook_url` | string | No | URL for delivery status webhooks |
| `ip` | string | No | End-user's IP address for fraud detection. Use when your backend proxies requests. |

**Response:**
```json
{
  "status": "sending",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "channel": "sms",
  "phone": "+14155551234"
}
```

**Security Note: Client IP for Fraud Detection**

The `ip` field enables accurate fraud detection when your backend proxies OTP requests:

- **Backend-to-API calls**: Include `ip` with your end-user's real IP address
- **Direct proxy calls**: Omit `ip` - the gateway uses `X-Forwarded-For` headers
- **Never send fake IPs** - this undermines fraud detection for legitimate users

Example: User at `223.206.64.19` → Your backend → OTP Gateway
```json
{"phone": "+14155551234", "code": "123456", "ip": "223.206.64.19"}
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

DIDWW Delivery Report callback endpoint (no authentication - called by DIDWW).

Receives SMS delivery status updates in JSON:API format.

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
| `ADMIN_SESSION_SECRET` | - | Session encryption secret |
| `ADMIN_SESSION_TTL` | `480` | Session timeout (minutes) |

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

### Network Configuration

| Variable | Default | Description |
|----------|---------|-------------|
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

## License

MIT - see [LICENSE](LICENSE) for details.

**Disclaimer:** This project is provided as-is. Users are responsible for regulatory compliance (GDPR, TCPA, etc.) and telecommunications fraud mitigation.
