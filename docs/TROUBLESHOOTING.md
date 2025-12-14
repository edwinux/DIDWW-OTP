# Troubleshooting Guide

Solutions for common issues with the DIDWW Voice OTP Gateway.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Call Not Connecting](#call-not-connecting)
- [No Audio / One-Way Audio](#no-audio--one-way-audio)
- [API Errors](#api-errors)
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
{"status":"healthy","asterisk":"connected","uptime":3600,"version":"0.1.0"}
```

**Unhealthy response:**
```json
{"status":"degraded","asterisk":"disconnected","uptime":10,"version":"0.1.0"}
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
