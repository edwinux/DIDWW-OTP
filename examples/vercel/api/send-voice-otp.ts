/**
 * Next.js API Route: Send Voice OTP (Pages Router)
 *
 * Place this file in: pages/api/send-voice-otp.ts
 *
 * Environment variables:
 *   GATEWAY_URL      - Voice OTP Gateway base URL
 *   VOICE_OTP_SECRET - API secret for gateway authentication
 */

import type { NextApiRequest, NextApiResponse } from 'next'

interface SuccessResponse {
  success: true
  call_id: string
  code: string
}

interface ErrorResponse {
  error: string
  details?: string
}

type ResponseData = SuccessResponse | ErrorResponse

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
): Promise<void> {
  // Only allow POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { phone, code } = req.body

  // Validate phone
  if (!phone) {
    res.status(400).json({ error: 'Phone number is required' })
    return
  }

  if (!isValidPhone(phone)) {
    res.status(400).json({ error: 'Phone must be in E.164 format (e.g., +14155551234)' })
    return
  }

  // Get configuration from environment
  const gatewayUrl = process.env.GATEWAY_URL
  const apiSecret = process.env.VOICE_OTP_SECRET

  if (!gatewayUrl || !apiSecret) {
    console.error('Missing environment variables: GATEWAY_URL or VOICE_OTP_SECRET')
    res.status(500).json({ error: 'Server configuration error' })
    return
  }

  // Generate OTP if not provided
  const otpCode = code || generateOtp()

  try {
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
      res.status(response.status).json({
        error: 'Failed to initiate voice call',
        details: error.message,
      })
      return
    }

    const result = await response.json()

    // Return success with code (store this for verification)
    res.status(200).json({
      success: true,
      call_id: result.call_id,
      code: otpCode,
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
