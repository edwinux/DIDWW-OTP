/**
 * Next.js API Route: Send Voice OTP (App Router)
 *
 * Place this file in: app/api/send-voice-otp/route.ts
 *
 * Environment variables:
 *   GATEWAY_URL      - Voice OTP Gateway base URL
 *   VOICE_OTP_SECRET - API secret for gateway authentication
 */

import { NextRequest, NextResponse } from 'next/server'

interface RequestBody {
  phone: string
  code?: string
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: RequestBody = await request.json()
    const { phone, code } = body

    // Validate phone
    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    if (!isValidPhone(phone)) {
      return NextResponse.json(
        { error: 'Phone must be in E.164 format (e.g., +14155551234)' },
        { status: 400 }
      )
    }

    // Get configuration from environment
    const gatewayUrl = process.env.GATEWAY_URL
    const apiSecret = process.env.VOICE_OTP_SECRET

    if (!gatewayUrl || !apiSecret) {
      console.error('Missing environment variables: GATEWAY_URL or VOICE_OTP_SECRET')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
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
      return NextResponse.json(
        { error: 'Failed to initiate voice call', details: error.message },
        { status: response.status }
      )
    }

    const result = await response.json()

    // Return success with code (store this for verification)
    return NextResponse.json({
      success: true,
      call_id: result.call_id,
      code: otpCode,
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Explicitly disallow other methods
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}
