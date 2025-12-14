# Vercel / Next.js Examples

Ready-to-use API routes for voice OTP delivery in Next.js applications.

## Prerequisites

- A Next.js project deployed on Vercel (or running locally)
- A running DIDWW Voice OTP Gateway

## Examples

| File | Router | Description |
|------|--------|-------------|
| `api/send-voice-otp.ts` | Pages Router | For `pages/api/` directory |
| `app/api/send-voice-otp/route.ts` | App Router | For `app/api/` directory (Next.js 13+) |

## Setup

### 1. Copy the appropriate file

**Pages Router (Next.js 12 or pages directory):**
```bash
cp api/send-voice-otp.ts your-project/pages/api/
```

**App Router (Next.js 13+ with app directory):**
```bash
cp -r app/api/send-voice-otp your-project/app/api/
```

### 2. Set environment variables

In your Vercel dashboard or `.env.local`:

```bash
GATEWAY_URL=https://your-gateway.example.com
VOICE_OTP_SECRET=your-api-secret
```

### 3. Deploy

```bash
vercel deploy
```

## Usage

### From your frontend

```typescript
async function sendOtp(phone: string) {
  const response = await fetch('/api/send-voice-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error)
  }

  return response.json()
}

// Usage
try {
  const { call_id, code } = await sendOtp('+14155551234')
  // Store code securely for verification
} catch (error) {
  console.error('Failed to send OTP:', error)
}
```

### Direct HTTP call

```bash
curl -X POST https://your-app.vercel.app/api/send-voice-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+14155551234"}'
```

## Response

```json
{
  "success": true,
  "call_id": "550e8400-e29b-41d4-a716-446655440000",
  "code": "123456"
}
```

## Verification Flow

1. User requests OTP via this API route
2. Store the returned `code` in your database with user ID and expiration
3. User receives voice call with OTP
4. User enters code in your app
5. Verify against stored code
6. Delete/invalidate the code after successful verification

## Security Notes

- Environment variables are server-side only and never exposed to clients
- Consider adding rate limiting using Vercel's Edge Config or a service like Upstash
- OTP codes should expire after a short time (e.g., 5 minutes)
- Add authentication if this endpoint should only be accessible to logged-in users
