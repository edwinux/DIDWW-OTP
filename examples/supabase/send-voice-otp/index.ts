/**
 * Supabase Edge Function: Send Voice OTP
 *
 * Initiates a voice call to deliver an OTP code using the DIDWW Voice OTP Gateway.
 *
 * Environment variables (set via `supabase secrets set`):
 *   GATEWAY_URL      - Voice OTP Gateway base URL
 *   VOICE_OTP_SECRET - API secret for gateway authentication
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  phone: string
  code?: string
}

interface GatewayResponse {
  status: string
  call_id: string
  phone: string
}

/**
 * Generate a random 6-digit OTP code
 */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

/**
 * Validate E.164 phone number format
 */
function isValidPhone(phone: string): boolean {
  return /^\+[1-9]\d{9,14}$/.test(phone)
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { phone, code }: RequestBody = await req.json()

    // Validate phone
    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!isValidPhone(phone)) {
      return new Response(
        JSON.stringify({ error: 'Phone must be in E.164 format (e.g., +14155551234)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get configuration from environment
    const gatewayUrl = Deno.env.get('GATEWAY_URL')
    const apiSecret = Deno.env.get('VOICE_OTP_SECRET')

    if (!gatewayUrl || !apiSecret) {
      console.error('Missing environment variables: GATEWAY_URL or VOICE_OTP_SECRET')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate OTP if not provided
    const otpCode = code || generateOtp()

    // Call the Voice OTP Gateway
    const response = await fetch(`${gatewayUrl}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        code: otpCode,
        secret: apiSecret,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Gateway error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to initiate voice call', details: error.message }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result: GatewayResponse = await response.json()

    // Return success with code (store this for verification)
    return new Response(
      JSON.stringify({
        success: true,
        call_id: result.call_id,
        code: otpCode, // Return code so caller can store it for verification
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
