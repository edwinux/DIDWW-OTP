# Supabase Edge Function Example

A ready-to-deploy Supabase Edge Function for voice OTP delivery.

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- A Supabase project
- A running DIDWW Voice OTP Gateway

## Setup

### 1. Copy the function to your project

```bash
cp -r send-voice-otp your-supabase-project/supabase/functions/
```

### 2. Set environment variables

```bash
# In your Supabase project directory
supabase secrets set GATEWAY_URL=https://your-gateway.example.com
supabase secrets set VOICE_OTP_SECRET=your-api-secret
```

### 3. Deploy

```bash
supabase functions deploy send-voice-otp
```

## Usage

### From your frontend

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Send OTP
const { data, error } = await supabase.functions.invoke('send-voice-otp', {
  body: { phone: '+14155551234' }
})

if (error) {
  console.error('Failed to send OTP:', error)
} else {
  console.log('OTP sent, call_id:', data.call_id)
  // Store data.code securely for verification
}
```

### Direct HTTP call

```bash
curl -X POST https://your-project.supabase.co/functions/v1/send-voice-otp \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
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

The `code` is returned so you can store it for verification. In production, store this in your database with an expiration time.

## Verification Flow

1. User requests OTP via this function
2. Store the returned `code` in your database with user ID and expiration
3. User receives voice call with OTP
4. User enters code in your app
5. Verify against stored code
6. Delete/invalidate the code after successful verification

## Security Notes

- The `VOICE_OTP_SECRET` should only be set as a Supabase secret, never exposed to clients
- Consider adding rate limiting to prevent abuse
- Set appropriate CORS policies for your function
- OTP codes should expire after a short time (e.g., 5 minutes)
