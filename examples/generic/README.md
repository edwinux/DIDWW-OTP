# Generic Integration Examples

Simple, framework-agnostic examples for calling the DIDWW Voice OTP Gateway.

## Prerequisites

- A running DIDWW Voice OTP Gateway instance
- Your `API_SECRET` configured on the gateway
- The gateway's public URL (e.g., `https://your-gateway.example.com`)

## Examples

| File | Language/Tool | Use Case |
|------|---------------|----------|
| `curl.sh` | curl | Quick testing, shell scripts |
| `node-fetch.ts` | Node.js (fetch) | Modern Node.js (18+) |
| `node-axios.ts` | Node.js (axios) | Node.js with axios library |
| `python-requests.py` | Python | Python backends |

## API Reference

### POST /send-otp

Initiates a voice call to deliver an OTP code.

**Request:**
```json
{
  "phone": "+14155551234",
  "code": "123456",
  "secret": "your-api-secret"
}
```

**Parameters:**
- `phone` (required): Phone number in E.164 format (e.g., `+14155551234`)
- `code` (required): 4-8 digit numeric OTP code
- `secret` (required): Your API secret for authentication

**Response (202 Accepted):**
```json
{
  "status": "calling",
  "call_id": "550e8400-e29b-41d4-a716-446655440000",
  "phone": "+14155551234"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid phone format or code
- `403 Forbidden`: Invalid API secret
- `503 Service Unavailable`: Gateway not ready (Asterisk disconnected)

### GET /health

Check gateway health status.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "asterisk": "connected",
  "uptime": 3600,
  "version": "0.1.0"
}
```

## Environment Variables

Set these before running the examples:

```bash
export GATEWAY_URL="https://your-gateway.example.com"
export API_SECRET="your-api-secret"
```

## Running Examples

### curl
```bash
./curl.sh +14155551234 123456
```

### Node.js (fetch)
```bash
npx tsx node-fetch.ts +14155551234
```

### Node.js (axios)
```bash
npm install axios
npx tsx node-axios.ts +14155551234
```

### Python
```bash
pip install requests
python python-requests.py +14155551234
```
