# Configuration Reference

Complete reference for all environment variables and configuration options.

## Table of Contents

- [Required Variables](#required-variables)
- [Optional Variables](#optional-variables)
- [DIDWW Trunk Setup](#didww-trunk-setup)
- [Message Customization](#message-customization)
- [Example Configurations](#example-configurations)

## Required Variables

These variables must be set for the gateway to start.

### DIDWW_SIP_HOST

DIDWW outbound SIP server hostname.

```bash
DIDWW_SIP_HOST=sip.didww.com
```

**Options:**
- `sip.didww.com` - Anycast (auto-routes to nearest)
- `any.out.didww.com` - Anycast outbound
- `nyc.us.out.didww.com` - New York
- `lax.us.out.didww.com` - Los Angeles
- `fra.eu.out.didww.com` - Frankfurt
- `ams.eu.out.didww.com` - Amsterdam

### DIDWW_USERNAME

SIP trunk username from your DIDWW portal.

```bash
DIDWW_USERNAME=your_trunk_username
```

### DIDWW_PASSWORD

SIP trunk password from your DIDWW portal.

```bash
DIDWW_PASSWORD=your_trunk_password
```

### DIDWW_CALLER_ID

Outbound caller ID number. Must be a DID you own in DIDWW.

```bash
DIDWW_CALLER_ID=12125551234
```

**Format:** E.164 without the `+` prefix (e.g., `12125551234` not `+12125551234`)

### PUBLIC_IP

Your server's public IP address. Critical for NAT traversal.

```bash
PUBLIC_IP=203.0.113.50
```

**How to find:**
```bash
curl ifconfig.me
# or
curl icanhazip.com
```

### API_SECRET

Shared secret for API authentication. Use a strong, random value.

```bash
API_SECRET=your-secure-random-secret
```

**Generate a secure secret:**
```bash
openssl rand -hex 32
```

Callers authenticate by sending this value in the request body field `secret` or the
`x-api-secret` header. The comparison is constant-time (timing-safe).

## Security & Proxy

### TRUST_PROXY

Express `trust proxy` setting: the number of trusted reverse-proxy hops in front of the
gateway. This single setting governs how `req.ip` (the client IP) is derived, and that IP
is the source of truth for per-IP/subnet fraud rate limiting, ASN/geo blocking on
`/dispatch`, the admin IP whitelist, and the `auto` cookie-Secure decision (via
`X-Forwarded-Proto`).

```bash
TRUST_PROXY=1
```

**Default:** `1` (a single nginx hop — matches the standard deployment)

**Values:**
- A number (`0`, `1`, `2`, …) — count of trusted proxy hops
- `0` — only when there is **no** reverse proxy in front of the gateway
- A named/CIDR value (e.g. `loopback`) — passed through to Express verbatim

**Operational requirement:** Set this to the actual number of proxy hops. For the
documented single-nginx setup, keep the default `1`.

**Failure mode:** If set too high (or to `true`), Express trusts the entire
client-controllable `X-Forwarded-For` chain, letting an attacker spoof `req.ip` — which
**bypasses both IP rate limiting on `/dispatch` and the admin IP whitelist**. Never use
`true`. If set too low (`0`/`false`) behind a real proxy, every request appears to come
from the proxy IP, breaking per-client IP differentiation.

> Note: the `/dispatch` body does **not** accept a client-supplied `ip` field — the fraud
> IP comes exclusively from `req.ip` so callers cannot rotate fake IPs.

### WEBHOOK_INBOUND_SECRET

Optional shared secret that authenticates **inbound** DIDWW provider callbacks
(`POST /webhooks/dlr` delivery reports and `POST /webhooks/cdr` CDR batches). The token is
compared constant-time.

```bash
WEBHOOK_INBOUND_SECRET=change-me-inbound-secret
```

**Default:** unset (inbound callbacks are accepted **without authentication**; a warning is
logged per request)

**How callers supply it:** the matching token must be sent either in the `X-Webhook-Token`
header or appended as a `?token=<secret>` query parameter (header takes precedence). DIDWW
callback configuration usually only allows a URL, so append the token to the callback URL:

```
https://otp-gw.example/webhooks/dlr?token=<WEBHOOK_INBOUND_SECRET>
https://otp-gw.example/webhooks/cdr?token=<WEBHOOK_INBOUND_SECRET>
```

**Operational requirement:** Set this in production to close the open-callback exposure. If
set, configure the token on **both** the DIDWW DLR and CDR callback URLs. Note that
`/webhooks/auth` is **not** covered by this secret — it uses the regular `API_SECRET`
(`x-api-secret` / body `secret`).

**Failure mode:** If set but the supplied token is missing or does not match, the callback
is rejected with HTTP `403 {error:"forbidden", message:"Invalid webhook token"}` and never
processed — a mismatch silently drops all delivery reports / CDRs.

## Optional Variables

### Voice Message Settings

#### OTP_MESSAGE_TEMPLATE

Template for the voice message. Use `{code}` as placeholder.

```bash
OTP_MESSAGE_TEMPLATE="Your verification code is {code}. Repeating. {code}."
```

**Default:** `Your verification code is {code}. Repeating. {code}.`

The code digits are automatically spoken with pauses between them for clarity.

#### OTP_VOICE_SPEED

Text-to-speech voice speed.

```bash
OTP_VOICE_SPEED=medium
```

**Options:**
- `slow` - Slower speech, easier to understand
- `medium` - Normal speech rate (default)
- `fast` - Faster speech

#### OTP_DIGIT_PAUSE_MS

Pause duration between digits in milliseconds.

```bash
OTP_DIGIT_PAUSE_MS=500
```

**Default:** `500` (half second between each digit)

### Network Settings

#### HTTP_PORT

Port for the HTTP API.

```bash
HTTP_PORT=8080
```

**Default:** `8080`

#### SIP_PORT

Port for SIP signaling (UDP).

```bash
SIP_PORT=5060
```

**Default:** `5060`

#### RTP_PORT_START / RTP_PORT_END

Range of ports for RTP media (audio).

```bash
RTP_PORT_START=10000
RTP_PORT_END=10020
```

**Defaults:** `10000` - `10020`

Each concurrent call uses one RTP port. The default range supports ~10 concurrent calls.

### Internal Settings

#### ARI_PASSWORD

Password for internal Asterisk-to-Node.js communication.

```bash
ARI_PASSWORD=internal-ari-secret
```

**Default:** Auto-generated if not set

#### LOG_LEVEL

Logging verbosity.

```bash
LOG_LEVEL=info
```

**Options:**
- `debug` - Verbose debugging information
- `info` - Normal operational logs (default)
- `warn` - Warnings and errors only
- `error` - Errors only

### Admin Panel Security

These harden the admin dashboard. They only apply when the admin panel is enabled.

#### ADMIN_SESSION_SECRET

Secret used to sign the express-session `admin.sid` cookie. Must be at least 16 characters
when provided.

```bash
ADMIN_SESSION_SECRET=please-generate-a-long-random-string
```

**Default:** unset — a random per-process secret is generated at startup (and a warning is
logged). The fallback is never a hardcoded/source-visible constant, so cookies cannot be
forged offline even when this is absent.

**Operational requirement:** Set this in production (e.g. `openssl rand -hex 32`) so admin
sessions survive container restarts and deploys.

**Failure mode:** When unset, the signing secret is regenerated on every process
start/restart, invalidating all existing admin sessions — users must log in again after
each restart or redeploy.

#### ADMIN_COOKIE_SECURE

Controls the `Secure` flag on the `admin.sid` session cookie.

```bash
ADMIN_COOKIE_SECURE=auto
```

**Default:** `auto`

**Values:**
- `auto` — set `Secure` only when the request is HTTPS (recommended; never sends the cookie
  over plaintext in production)
- `true` — always `Secure`
- `false` — never `Secure` (local plain-HTTP development only)

**Operational requirement:** For `auto` to detect HTTPS behind a TLS-terminating reverse
proxy, the proxy must forward `X-Forwarded-Proto` and the app must trust it via
`TRUST_PROXY` (default `1`). The standard nginx deployment terminates TLS and forwards this
header, so `auto` yields Secure cookies in production.

**Failure mode:** If set to `false`, the cookie has no `Secure` flag and can be sent over
plaintext HTTP. If left `auto` but the proxy does not forward protocol info (or
`TRUST_PROXY=0`), Express sees the connection as HTTP, never sets `Secure`, and the cookie
may be transmitted insecurely.

#### ADMIN_CORS_ORIGINS

Comma-separated allowlist of Origins permitted to make cross-origin requests against the
admin API.

```bash
ADMIN_CORS_ORIGINS=http://localhost:5173
```

**Default:** empty (unset) — no cross-origin access; no `Origin` is ever reflected.

Only an `Origin` that **exactly** matches an allowlisted entry is reflected (with
`Access-Control-Allow-Credentials: true`).

**Operational requirement:** Leave unset in production (the admin UI is served same-origin).
Set it only for local development against the dev frontend (e.g. the Vite dev server).

**Failure mode:** Because credentials are allowed, a wildcard or untrusted origin would let
that site make authenticated cross-origin requests against the admin API. Never use a
wildcard.

## DIDWW Trunk Setup

### Creating a SIP Trunk

1. Log into [DIDWW Portal](https://my.didww.com/)
2. Go to **Voice** → **SIP Trunks**
3. Click **Create SIP Trunk**
4. Configure:
   - **Name:** Voice OTP Gateway
   - **Authentication:** Username/Password
   - **Username:** (note this for `DIDWW_USERNAME`)
   - **Password:** (note this for `DIDWW_PASSWORD`)
5. Save the trunk

### Configuring Outbound Routes

1. Go to **Voice** → **Outbound Routes**
2. Create a route pointing to your SIP trunk
3. Configure allowed destinations (countries)

### Getting a DID (Caller ID)

1. Go to **DIDs** → **Buy DIDs**
2. Purchase a number in your desired country
3. Use this number for `DIDWW_CALLER_ID`

**Note:** The caller ID must be a DID you own, or calls may be rejected.

## Message Customization

### Template Variables

| Variable | Description |
|----------|-------------|
| `{code}` | The OTP code (digits spoken individually) |

### Example Templates

**Default (English):**
```bash
OTP_MESSAGE_TEMPLATE="Your verification code is {code}. Repeating. {code}."
```

**Formal:**
```bash
OTP_MESSAGE_TEMPLATE="This is an automated message. Your security code is {code}. Again, your code is {code}. Goodbye."
```

**Brief:**
```bash
OTP_MESSAGE_TEMPLATE="Code: {code}. Repeat: {code}."
```

### Voice Behavior

- Digits are spoken individually: "1. 2. 3. 4. 5. 6."
- Pauses between digits controlled by `OTP_DIGIT_PAUSE_MS`
- Message is spoken using PicoTTS text-to-speech

## Example Configurations

### Minimal Production

```bash
# .env
DIDWW_SIP_HOST=sip.didww.com
DIDWW_USERNAME=my_trunk_user
DIDWW_PASSWORD=my_trunk_pass
DIDWW_CALLER_ID=12125551234
PUBLIC_IP=203.0.113.50
API_SECRET=a1b2c3d4e5f6g7h8i9j0
```

### Full Configuration

```bash
# .env
# Required
DIDWW_SIP_HOST=fra.eu.out.didww.com
DIDWW_USERNAME=my_trunk_user
DIDWW_PASSWORD=my_trunk_pass
DIDWW_CALLER_ID=442012345678
PUBLIC_IP=203.0.113.50
API_SECRET=your-very-long-secure-random-secret

# Voice customization
OTP_MESSAGE_TEMPLATE="Your security code is {code}. I repeat: {code}."
OTP_VOICE_SPEED=slow
OTP_DIGIT_PAUSE_MS=750

# Network (if non-standard ports needed)
HTTP_PORT=3000
SIP_PORT=5060
RTP_PORT_START=16384
RTP_PORT_END=16394

# Debugging
LOG_LEVEL=debug
```

### High-Volume Setup

For higher concurrent call volume, expand the RTP port range:

```bash
# Support ~50 concurrent calls
RTP_PORT_START=10000
RTP_PORT_END=10050
```

Remember to:
1. Update firewall rules for the expanded range
2. Update Docker port mappings
3. Ensure DIDWW trunk has sufficient capacity

## Next Steps

- [Deployment Guide](DEPLOYMENT.md) - Deploy to production
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
