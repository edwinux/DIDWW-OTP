# Deployment Guide

This guide covers deploying the DIDWW Voice OTP Gateway to various environments.

## Table of Contents

- [Requirements](#requirements)
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
