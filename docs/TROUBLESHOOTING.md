# Troubleshooting Guide

Solutions for common issues with the DIDWW Voice OTP Gateway.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Call Not Connecting](#call-not-connecting)
- [No Audio / One-Way Audio](#no-audio--one-way-audio)
- [API Errors](#api-errors)
- [Admin Panel & Security Hardening](#admin-panel--security-hardening)
- [Webhooks (Inbound & Outbound)](#webhooks-inbound--outbound)
- [Docker Issues](#docker-issues)
- [DIDWW-Specific Issues](#didww-specific-issues)
- [Log Analysis](#log-analysis)

## Quick Diagnostics

### Health Check

```bash
curl http://localhost:8080/health
```

**Healthy response:**
```json
{"status":"healthy","database":"connected","asterisk":"connected","uptime":3600,"version":"1.0.0"}
```

**Unhealthy response:**
```json
{"status":"degraded","database":"disconnected","asterisk":"disconnected","uptime":10,"version":"1.0.0"}
```

### Container Logs

```bash
# Recent logs
docker logs voice-otp --tail 100

# Follow logs in real-time
docker logs voice-otp -f

# Asterisk-specific logs
docker exec voice-otp cat /var/log/asterisk/messages
```

### Test Call

```bash
curl -X POST http://localhost:8080/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+1YOURPHONE","code":"123456","secret":"your_secret"}'
```

## Call Not Connecting

### Symptom: API returns success but phone doesn't ring

**Check 1: Verify PUBLIC_IP is correct**
```bash
# What you set
echo $PUBLIC_IP

# What it should be
curl ifconfig.me
```

If these don't match, update `PUBLIC_IP` and restart.

**Check 2: Firewall blocking SIP**
```bash
# Test SIP port accessibility (from another machine)
nc -vzu your_server_ip 5060

# Check local firewall
sudo ufw status
# Should show 5060/udp ALLOW
```

**Check 3: DIDWW credentials**

Verify in DIDWW portal:
1. Trunk is active
2. Username/password are correct
3. Outbound routes are configured

**Check 4: SIP registration in logs**
```bash
docker logs voice-otp 2>&1 | grep -i "sip\|register\|trunk"
```

Look for:
- `SIP trunk registered` - Good
- `Registration failed` - Check credentials
- `Connection refused` - Check `DIDWW_SIP_HOST`

### Symptom: "Call failed" error in API response

```json
{"error":"call_failed","message":"Failed to initiate call"}
```

**Causes:**
1. Asterisk not connected - Check health endpoint
2. Invalid phone format - Must be E.164 (`+14155551234`)
3. DIDWW trunk issue - Check DIDWW portal for errors

## No Audio / One-Way Audio

This is the most common issue, usually caused by NAT/firewall problems.

### Symptom: Call connects but no audio heard

**Check 1: RTP ports are open**
```bash
# Check firewall
sudo ufw status | grep 10000

# Test from external (use a different server)
nc -vzu your_server_ip 10000
nc -vzu your_server_ip 10010
nc -vzu your_server_ip 10020
```

**Check 2: PUBLIC_IP is set correctly**

The `PUBLIC_IP` tells DIDWW where to send audio. If wrong, audio goes nowhere.

```bash
# Verify
docker exec voice-otp printenv PUBLIC_IP
```

**Check 3: Docker networking mode**

For production, use `network_mode: host`:

```yaml
services:
  voice-otp:
    network_mode: host  # Avoids Docker NAT issues
```

**Check 4: NAT type**

Some NAT configurations (symmetric NAT) are problematic. Solutions:
- Use a VPS with direct public IP
- Configure port forwarding for UDP 10000-10020
- Use `network_mode: host` in Docker

### Symptom: Audio cuts out mid-call

**Causes:**
1. NAT timeout - Some routers drop UDP connections after 30s
2. Packet loss - Network quality issue
3. RTP port exhaustion - Too many concurrent calls

**Solutions:**
- Increase NAT timeout on router (if accessible)
- Use a different network/VPS provider
- Expand RTP port range for more concurrent calls

## API Errors

### 400 Bad Request

```json
{"error":"invalid_request","message":"Phone must be in E.164 format"}
```

**Fix:** Use correct phone format: `+14155551234` (with `+` and country code)

### 403 Forbidden

```json
{"error":"forbidden","message":"Invalid API secret"}
```

**Fixes:**
- Verify `API_SECRET` matches in request and container
- Check for whitespace in secret
- Ensure you're using the `secret` field in JSON body

### 503 Service Unavailable

```json
{"error":"service_unavailable","message":"Voice gateway is not ready"}
```

**Meaning:** Asterisk isn't connected yet.

**Fixes:**
- Wait 30 seconds after container start
- Check container logs for Asterisk errors
- Verify ARI connection in logs

## Admin Panel & Security Hardening

### Symptom: Admin dashboard live updates / WebSocket won't connect

The admin dashboard streams live OTP events over `/admin/ws`. This handshake now **requires an authenticated admin session** (it exposes phone numbers, fraud scores, and shadow-ban flags), so an unauthenticated upgrade is rejected.

Browser console / network tab typically shows the WebSocket upgrade failing with `401 Unauthorized`, `401 Session expired`, or `503 Session validation unavailable`.

**Check 1: You are actually logged in**

The browser must present a valid signed `admin.sid` cookie on the upgrade request. Log in through the admin UI first, then reload. If REST admin pages work but the WebSocket does not, the cause is almost always the cookie not reaching the upgrade request (see Check 2).

**Check 2: Secure cookie + proxy protocol forwarding**

Behind HTTPS, the `admin.sid` cookie is `Secure` (default `ADMIN_COOKIE_SECURE=auto`), so it is only sent over connections Express considers HTTPS. For `auto` to detect HTTPS behind a TLS-terminating proxy, the proxy must forward `X-Forwarded-Proto` **and** the app must trust it via `TRUST_PROXY`.

- Ensure nginx forwards `proxy_set_header X-Forwarded-Proto $scheme;`.
- Ensure `TRUST_PROXY` matches your proxy hop count (default `1` for a single nginx).
- For local plain-HTTP development only, set `ADMIN_COOKIE_SECURE=false` so the cookie is sent over HTTP.

Symptoms of a mismatch: the login appears to succeed but the cookie is never stored/sent, so every `/admin/ws` upgrade is rejected as `401 Unauthorized`.

**Check 3: Session expired**

The same TTL as the REST API applies (`ADMIN_SESSION_TTL`, default 480 minutes). After it elapses the upgrade is rejected with `401 Session expired` and re-login is required.

**Check 4: `503 Session validation unavailable`**

This means the session middleware was not wired into the WebSocket server. This is an internal wiring error (the server passes it by default); if you see it after modifying startup code, ensure the session middleware is passed into `initializeWebSocket`.

### Symptom: Admin users are logged out after every restart / redeploy

Sessions are signed with `ADMIN_SESSION_SECRET`. When it is **unset**, the gateway generates a new random signing secret on each process start (and logs a startup warning), so every previously issued `admin.sid` cookie becomes invalid the moment the container restarts. Symptom: admins must log in again after every deploy/restart, and any in-flight `/admin/ws` reconnect fails as `401 Unauthorized`.

**Fix:** Set a strong, stable `ADMIN_SESSION_SECRET` (>= 16 chars) in production, e.g. generate once with `openssl rand -hex 32`, and keep it constant across restarts and deploys so sessions survive.

### Symptom: Admin API blocked by CORS during local development

Cross-origin requests to the admin API are rejected unless their origin is allow-listed. `ADMIN_CORS_ORIGINS` defaults to empty, which disables cross-origin access — correct in production, where the admin UI is served same-origin. When developing the admin frontend against the Vite dev server, the browser reports a CORS error and admin API calls fail.

**Fix:** Set `ADMIN_CORS_ORIGINS` to the exact dev-server origin(s), comma-separated (exact scheme/host/port), e.g. `ADMIN_CORS_ORIGINS=http://localhost:5173`. Leave it empty in production.

### Symptom: Rate limiting or admin IP whitelist behaving oddly

`req.ip` is the single source of truth for the client IP across the system: per-IP/subnet fraud rate limiting, ASN/geo blocking on `/dispatch`, the admin IP whitelist (`ADMIN_IP_WHITELIST`), and the `auto` cookie-Secure decision. `req.ip` is derived from the `X-Forwarded-For` chain according to `TRUST_PROXY`, so a wrong `TRUST_PROXY` breaks all of them at once.

**Check 1: `TRUST_PROXY` matches your real proxy topology**

```bash
docker exec voice-otp printenv TRUST_PROXY
```

`TRUST_PROXY` is the number of trusted reverse-proxy hops in front of the app:

- `1` (default) - a single nginx. Correct for the standard deployment.
- `0` - no reverse proxy at all (talking directly to the gateway).
- A higher number - only if there are additional trusted proxies (e.g. Cloudflare + nginx).

**Set too high (or `true`):** Express trusts the entire client-controllable `X-Forwarded-For` chain, so an attacker can spoof `req.ip`. That spoofing bypasses per-IP/subnet rate limiting and ASN/geo blocking on `/dispatch` **and** defeats the admin IP whitelist. Never use `true` — it trusts the full attacker-controllable forwarded chain.

**Set too low (`0` / `false`) behind a real proxy:** every request appears to come from the proxy's IP, so per-client IP differentiation is lost (rate limits and the whitelist all evaluate the proxy IP instead of the real client).

> **Note:** The `/dispatch` body does not accept a client-supplied `ip` field; it is ignored if sent. The fraud IP comes exclusively from `req.ip` (the proxy chain), so callers cannot rotate fake IPs to dodge rate limiting. Fix client-IP problems via `TRUST_PROXY` and the proxy config, not the request body.

## Webhooks (Inbound & Outbound)

### Symptom: DIDWW DLR / CDR callbacks return 401/403 or are not processed

When `WEBHOOK_INBOUND_SECRET` is set, the inbound callback endpoints `POST /webhooks/dlr` (SMS delivery reports) and `POST /webhooks/cdr` (CDR batches) require a matching token. A missing/wrong token is rejected with HTTP 403 `{"error":"forbidden","message":"Invalid webhook token"}` and the callback is never processed (logs show `Inbound webhook authentication failed`).

**Fix: Add the token to the DIDWW callback URLs**

DIDWW callback configuration usually only lets you set a URL (no custom headers), so append the token as a query string to **both** the DLR and CDR callback URLs:

```
https://otp-gw.pro.makeup/webhooks/dlr?token=<WEBHOOK_INBOUND_SECRET>
https://otp-gw.pro.makeup/webhooks/cdr?token=<WEBHOOK_INBOUND_SECRET>
```

Alternatively, if your sender can set headers, send `X-Webhook-Token: <WEBHOOK_INBOUND_SECRET>` (the header takes precedence over the query token).

**Notes:**
- The token must match `WEBHOOK_INBOUND_SECRET` exactly (constant-time compared).
- `/webhooks/auth` is **not** covered by this token — it uses the standard API secret (`x-api-secret` header or `secret` body field).
- If `WEBHOOK_INBOUND_SECRET` is unset, inbound callbacks are accepted without authentication and a per-request warning is logged (`Inbound webhook accepted without authentication`). Set it in production.

### Symptom: Client webhook never fires / logged as "Blocked" (SSRF protection)

Client-configured outbound webhooks (the `webhook_url` on `/dispatch`) are validated before delivery. If the URL resolves to a non-public address it is **permanently blocked** (not retried): an `otp.failed` event is emitted and the webhook log records the attempt with `Blocked: <message>` (e.g. `Webhook URL resolves to a non-public address (...)`). Logs show `Webhook delivery blocked (unsafe URL)`.

**Cause:** the `webhook_url` host (an IP literal or its DNS-resolved address) falls in a private, loopback, link-local, CGNAT, or reserved range, or it is not `http(s)`. This deliberately prevents callers from reaching cloud metadata (`169.254.169.254`), the local Asterisk ARI, or the admin panel.

**Blocked includes (non-exhaustive):**
- IPv4: `0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16` (incl. metadata), `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` (CGNAT), TEST-NET / benchmarking ranges, multicast/reserved/broadcast.
- IPv6: `::1`, `::`, `fe80::/10`, `fc00::/7` (ULA), `ff00::/8`, and IPv4-mapped addresses whose embedded IPv4 is private.
- Non-`http(s)` schemes (e.g. `file:`, `gopher:`), hosts that do not resolve via DNS, and hostnames where **any** resolved address is private.

**Fix:**
- Use a publicly routable `http(s)` endpoint; every DNS-resolved address must be public.
- Redirects are **not** followed (`redirect: 'manual'`), so a `30x` response is logged as a non-2xx failure. The receiver must return a `2xx` directly rather than redirecting.

## Docker Issues

### Container won't start

```bash
docker logs voice-otp
```

**Common errors:**

**"Missing required environment variable"**
```
Error: Missing required environment variable: DIDWW_SIP_HOST
```
Fix: Set all required env vars (see Configuration guide)

**"Address already in use"**
```
Error: bind: address already in use
```
Fix: Another process is using port 5060 or 8080
```bash
# Find what's using the port
sudo lsof -i :5060
sudo lsof -i :8080
# Kill or stop the conflicting process
```

### Container keeps restarting

```bash
# Check restart count
docker inspect voice-otp --format='{{.RestartCount}}'

# Check last exit code
docker inspect voice-otp --format='{{.State.ExitCode}}'
```

**Exit code meanings:**
- `0` - Clean shutdown
- `1` - Application error (check logs)
- `137` - Killed (OOM or manual)
- `139` - Segfault (report as bug)

### Port mapping issues

**Symptom:** API works internally but not externally

```bash
# Test internal
docker exec voice-otp curl localhost:8080/health

# Test external
curl http://your_server_ip:8080/health
```

**Fixes:**
- Check Docker port mappings: `docker port voice-otp`
- Verify firewall allows the port
- Try `network_mode: host` for simplicity

## DIDWW-Specific Issues

### "Registration failed" in logs

**Causes:**
1. Wrong username/password
2. Trunk is disabled in DIDWW portal
3. IP not whitelisted (if using IP auth)

**Verify in DIDWW portal:**
1. Voice → SIP Trunks → Your trunk → Status should be "Active"
2. Check credentials match exactly (case-sensitive)
3. If IP-authenticated, ensure your IP is listed

### Calls rejected by DIDWW

Check DIDWW CDRs (Call Detail Records) for rejection reasons:

1. Log into DIDWW portal
2. Go to Reports → CDRs
3. Look for your call attempts
4. Check "Termination Cause"

**Common causes:**
- "Caller ID not allowed" - `DIDWW_CALLER_ID` must be your DID
- "No route" - Configure outbound routes in DIDWW
- "Rate limit" - Slow down call rate

### Call quality issues

DIDWW server selection matters for latency:

```bash
# Test latency to different DIDWW servers
ping nyc.us.out.didww.com
ping fra.eu.out.didww.com
ping ams.eu.out.didww.com
```

Use the server with lowest latency:
```bash
DIDWW_SIP_HOST=fra.eu.out.didww.com  # If in Europe
```

## Log Analysis

### Enable Debug Logging

```bash
LOG_LEVEL=debug
```

Restart container after changing.

### Key Log Messages

**Startup:**
```
INFO: DIDWW Voice OTP Gateway starting...
INFO: Configuration loaded
INFO: ARI connected
INFO: HTTP server listening on port 8080
INFO: Gateway ready
```

**Successful call:**
```
INFO: OTP request received {"callId":"xxx","phone":"+1***1234"}
INFO: Call initiated {"callId":"xxx"}
INFO: Channel answered {"channel":"xxx"}
INFO: Playback started {"callId":"xxx"}
INFO: Playback finished {"callId":"xxx"}
INFO: Call completed {"callId":"xxx"}
```

**Failed call:**
```
ERROR: Failed to originate call {"error":"..."}
WARN: Channel hung up unexpectedly {"cause":"..."}
```

### SIP Debug (Advanced)

For SIP-level debugging:

```bash
docker exec -it voice-otp asterisk -rx "sip set debug on"
docker exec -it voice-otp asterisk -rx "core show channels"
```

## Getting Help

If you're still stuck:

1. **Check existing issues:** [GitHub Issues](https://github.com/edwinux/DIDWW-OTP/issues)
2. **Gather information:**
   - Container logs (`docker logs voice-otp`)
   - Health endpoint output
   - Your configuration (redact secrets!)
   - Error messages
3. **Open an issue** with the above information

## Next Steps

- [Configuration Reference](CONFIGURATION.md) - All environment variables
- [Deployment Guide](DEPLOYMENT.md) - Production deployment
