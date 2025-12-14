/**
 * Send Voice OTP using Node.js with axios
 *
 * Usage: npx tsx node-axios.ts <phone> [code]
 *
 * Prerequisites: npm install axios
 *
 * Environment variables:
 *   GATEWAY_URL - Gateway base URL (required)
 *   API_SECRET  - API authentication secret (required)
 */

import axios, { AxiosError } from 'axios';

// Configuration from environment
const GATEWAY_URL = process.env.GATEWAY_URL;
const API_SECRET = process.env.API_SECRET;

interface SendOtpResponse {
  status: string;
  call_id: string;
  phone: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Generate a random 6-digit OTP code
 */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send a voice OTP to the specified phone number
 */
async function sendVoiceOtp(phone: string, code?: string): Promise<SendOtpResponse> {
  if (!GATEWAY_URL) {
    throw new Error('GATEWAY_URL environment variable is required');
  }
  if (!API_SECRET) {
    throw new Error('API_SECRET environment variable is required');
  }

  const otpCode = code || generateOtp();

  try {
    const response = await axios.post<SendOtpResponse>(
      `${GATEWAY_URL}/send-otp`,
      {
        phone,
        code: otpCode,
        secret: API_SECRET,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error) {
    if (error instanceof AxiosError && error.response) {
      const data = error.response.data as ErrorResponse;
      throw new Error(`API Error: ${data.message} (${data.error})`);
    }
    throw error;
  }
}

// Main execution
async function main(): Promise<void> {
  const phone = process.argv[2];
  const code = process.argv[3];

  if (!phone) {
    console.error('Usage: npx tsx node-axios.ts <phone> [code]');
    console.error('Example: npx tsx node-axios.ts +14155551234');
    process.exit(1);
  }

  // Validate phone format
  if (!/^\+[1-9]\d{9,14}$/.test(phone)) {
    console.error('Error: Phone must be in E.164 format (e.g., +14155551234)');
    process.exit(1);
  }

  try {
    console.log(`Sending OTP to ${phone}...`);
    const result = await sendVoiceOtp(phone, code);
    console.log('Success:', result);
  } catch (error) {
    console.error('Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
