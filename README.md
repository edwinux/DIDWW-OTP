# DIDWW-OTP: Bare Metal SIP Authentication

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](Dockerfile)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)](package.json)

**Cut authentication costs by 90% by bypassing SMS aggregators and SaaS "Verify" APIs.**

`DIDWW-OTP` is a reference implementation for a "Bare Metal" Voice OTP system. Instead of paying per-message fees (SMS) or per-success surcharges (Managed SaaS), this system utilizes wholesale SIP trunking to deliver One-Time Passwords via voice calls. By leveraging 1/1 (per-second) billing increments, a 15-second OTP call costs a fraction of a penny.

---

## The Economic Rationale

The global telecommunications market has shifted. A2P SMS costs are rising due to aggressive monetization by Mobile Network Operators (MNOs) and regulatory fees (10DLC, DLT). Managed services (like Twilio Verify) add a "logic tax" on top of these fees.

**Bare Metal SIP** strips away the logic layer and interacts directly with the telecom backbone.

### The Arbitrage Mathematics

The savings rely on **Duration-Based Billing**.

- **SMS/SaaS:** You pay per message or per "success," regardless of the underlying cost.
- **Bare Metal:** You pay for the *exact duration* of the call.

If a wholesale carrier offers **1/1 billing** (per-second billing), a standard 15-second OTP call costs:

```
Cost = (Rate per Minute / 60) × Duration (seconds)
```

**Example (UK Mobile):**

- **SaaS/SMS:** ~$0.05 - $0.07 flat fee.
- **Bare Metal ($0.02/min, 15s):** ($0.02 / 60) × 15 = **$0.005** *(A 14x cost reduction)*

### Global Cost Comparison (Per 1,000 OTPs)

| Market | Bare SIP (15s)* | SMS (Twilio A2P) | SaaS Voice (Verify) | Savings (SIP vs SMS) |
|:-------|:----------------|:-----------------|:--------------------|:---------------------|
| **USA** | **$1.25** | $12.00 | $64.00 | **89.5%** |
| **UK** | **$5.00** | $45.00 | $77.00 | **88.8%** |
| **Germany** | **$5.00** | $112.00 | $150.00 | **95.5%** |
| **India** | **$6.25** | $83.20 | $90.00 | **92.4%** |
| **Brazil** | **$8.00** | $59.90 | $116.00 | **86.6%** |
| **Indonesia** | **$15.00** | $441.40 | $200.00 | **96.6%** |

> *Estimates based on 2025 market analysis. Bare Metal costs assume 15-second call duration and 1/1 billing increments.*

---

## Architecture & Flow

This project shifts the "logic layer" from the vendor to your infrastructure.

```
┌─────────────┐    POST /send-otp    ┌──────────────────┐
│  Your App   │ ──────────────────▶  │  Voice Gateway   │
└─────────────┘                      └────────┬─────────┘
                                              │
                      1. SIP INVITE           │ Ringing: $0.00
                      2. 200 OK (Answer)      │ Billing Starts
                      3. RTP Audio (OTP)      │
                      4. BYE                  │ Billing Stops
                                              ▼
                                     ┌──────────────────┐
                                     │   DIDWW Trunk    │
                                     └────────┬─────────┘
                                              │
                                              │ PSTN
                                              ▼
                                     ┌──────────────────┐
                                     │   User's Phone   │
                                     │  "Your code is   │
                                     │   1. 2. 3. 4..." │
                                     └──────────────────┘
```

**Key Advantage:** If the user does not answer, the cost is effectively **zero**. Unlike SMS, where you often pay for the attempt regardless of delivery.

---

## Why Voice OTP?

Beyond cost savings, Voice OTP provides additional benefits:

- **Higher security** - Voice calls are harder to intercept than SMS (no SIM swapping risk)
- **Better accessibility** - Works for users who can't read SMS easily
- **Wider reach** - Works on landlines and in areas with poor SMS delivery
- **No SIM required** - Users can receive calls on any phone
- **Zero cost on no-answer** - Only pay when the call connects

---

## Features

- **One-line deployment** - Single Docker command to get started
- **Voice OTP delivery** - Clear text-to-speech code pronunciation with digit pauses
- **DIDWW integration** - Works with DIDWW SIP trunks (no registration required)
- **Simple REST API** - Single `/send-otp` endpoint
- **Stateless design** - No database required, scales horizontally
- **Customizable** - Configurable voice speed, message template, and caller ID

---

## Quick Start

```bash
docker run -d \
  -e DIDWW_SIP_HOST=sip.didww.com \
  -e DIDWW_USERNAME=your_username \
  -e DIDWW_PASSWORD=your_password \
  -e DIDWW_CALLER_ID=12125551234 \
  -e PUBLIC_IP=your_server_ip \
  -e API_SECRET=your_secret \
  -p 8080:8080 \
  -p 5060:5060/udp \
  -p 10000-10020:10000-10020/udp \
  ghcr.io/edwinux/didww-voice-gateway
```

---

## Strategic Configuration by Region

To achieve the savings listed above, you must configure your Source DIDs (Caller IDs) correctly to avoid **Origin-Based Pricing (OBP)** surcharges and Spam filters.

### United States

- **Strategy:** Use a STIR/SHAKEN attested SIP trunk.
- **Warning:** "Scam Likely" flags are the biggest risk. Ensure your DID is clean.
- **Billing:** Standard is 6/6 or 1/1.

### Germany (Critical)

- **Strategy:** You **MUST** use a Local German DID (+49) as the Caller ID.
- **Warning:** Originating a call to Germany from a non-EEA number (e.g., US +1) will trigger massive surcharges (up to $0.37/min).
- **Savings:** 95% savings possible if OBP is managed correctly.

### Indonesia

- **Strategy:** The largest arbitrage opportunity (29x cheaper than SMS).
- **Warning:** International SMS to Indonesia is prohibitively expensive (~$0.44). Voice is the only viable option for scale.

### India

- **Strategy:** Use strictly for International traffic.
- **Warning:** Do not attempt "Toll Bypass" (using VoIP to terminate locally). Route via legitimate ILDO white routes. Use a transparent International CLI to avoid carrier blocking.

### Dynamic Caller ID Example

```javascript
function getSourceDID(destinationCountry) {
  const didMap = {
    'DE': '+49...',  // Local German DID to avoid OBP
    'US': '+1...',   // Local US DID for trust
    'GB': '+44...',  // Local UK DID
  };
  return didMap[destinationCountry] || '+44...'; // Generic International fallback
}
```

---

## Risk Management

With great power comes great responsibility. By moving to Bare Metal, you are responsible for fraud mitigation.

### 1. International Revenue Share Fraud (IRSF)

Attackers may use your endpoint to generate calls to premium-rate numbers they own.

**Mitigation:**
- Implement rate limiting (e.g., Max 3 OTPs per hour per IP)
- **Geo-Fencing:** Block all destination country codes you do not service at the SIP trunk level

### 2. Billing Increments

Always audit your route. If a route uses **60/60 billing** (minimum 1 minute charge), your costs will quadruple. Ensure your provider offers **1/1** or **6/6** billing.

---

## API Reference

### Send OTP

```bash
curl -X POST http://localhost:8080/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+14155551234",
    "code": "123456",
    "secret": "your_api_secret"
  }'
```

**Response:**
```json
{
  "status": "calling",
  "call_id": "550e8400-e29b-41d4-a716-446655440000",
  "phone": "+14155551234"
}
```

### Health Check

```bash
curl http://localhost:8080/health
```

**Response:**
```json
{
  "status": "healthy",
  "asterisk": "connected",
  "uptime": 3600,
  "version": "0.1.0"
}
```

---

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DIDWW_SIP_HOST` | Yes | - | DIDWW SIP server (e.g., `sip.didww.com`) |
| `DIDWW_USERNAME` | Yes | - | SIP trunk username |
| `DIDWW_PASSWORD` | Yes | - | SIP trunk password |
| `DIDWW_CALLER_ID` | Yes | - | Outbound caller ID (your DIDWW DID) |
| `PUBLIC_IP` | Yes | - | Server's public IP address |
| `API_SECRET` | Yes | - | API authentication secret |
| `OTP_MESSAGE_TEMPLATE` | No | See docs | Voice message template |
| `OTP_VOICE_SPEED` | No | `medium` | Voice speed (slow/medium/fast) |
| `HTTP_PORT` | No | `8080` | API port |

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for all options.

---

## Documentation

- **[Deployment Guide](docs/DEPLOYMENT.md)** - VPS, Docker Compose, and cloud deployment
- **[Configuration Reference](docs/CONFIGURATION.md)** - All environment variables and options
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions

## Integration Examples

Ready-to-use examples for popular platforms:

- **[Generic](examples/generic/)** - curl, Node.js (fetch/axios), Python
- **[Supabase](examples/supabase/)** - Edge Function for Supabase projects
- **[Vercel/Next.js](examples/vercel/)** - API routes (Pages & App Router)

---

## Prerequisites

- A [DIDWW](https://www.didww.com/) account with:
  - SIP trunk credentials
  - At least one DID (phone number) for caller ID
- A server with a public IP address
- Docker (or Node.js 20+ for local development)

---

## Development

```bash
# Clone the repository
git clone https://github.com/edwinux/DIDWW-OTP.git
cd DIDWW-OTP

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run with Docker Compose (recommended)
cp .env.example .env
# Edit .env with your credentials
docker compose up --build
```

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

For security concerns, please see [SECURITY.md](SECURITY.md).

## License

MIT - see [LICENSE](LICENSE) for details.

**Disclaimer:** This project is a reference implementation. Users are responsible for their own regulatory compliance (GDPR, TCPA, etc.) and telecommunications fraud mitigation.
