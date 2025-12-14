#!/bin/bash
#
# Send Voice OTP using curl
#
# Usage: ./curl.sh <phone> [code]
#   phone: E.164 format (e.g., +14155551234)
#   code:  4-8 digit OTP (default: random 6 digits)
#
# Environment variables:
#   GATEWAY_URL - Gateway base URL (required)
#   API_SECRET  - API authentication secret (required)

set -e

# Validate environment
if [ -z "$GATEWAY_URL" ]; then
  echo "Error: GATEWAY_URL environment variable is required"
  echo "Example: export GATEWAY_URL=https://your-gateway.example.com"
  exit 1
fi

if [ -z "$API_SECRET" ]; then
  echo "Error: API_SECRET environment variable is required"
  exit 1
fi

# Parse arguments
PHONE="${1:-}"
CODE="${2:-$(shuf -i 100000-999999 -n 1)}"

if [ -z "$PHONE" ]; then
  echo "Usage: $0 <phone> [code]"
  echo "Example: $0 +14155551234 123456"
  exit 1
fi

# Validate phone format
if ! echo "$PHONE" | grep -qE '^\+[1-9][0-9]{9,14}$'; then
  echo "Error: Phone must be in E.164 format (e.g., +14155551234)"
  exit 1
fi

echo "Sending OTP to $PHONE..."
echo "Code: $CODE"
echo ""

# Make the API call
curl -X POST "${GATEWAY_URL}/send-otp" \
  -H "Content-Type: application/json" \
  -d "{
    \"phone\": \"${PHONE}\",
    \"code\": \"${CODE}\",
    \"secret\": \"${API_SECRET}\"
  }"

echo ""
