#!/usr/bin/env python3
"""
Send Voice OTP using Python requests library.

Usage: python python-requests.py <phone> [code]

Prerequisites: pip install requests

Environment variables:
    GATEWAY_URL - Gateway base URL (required)
    API_SECRET  - API authentication secret (required)
"""

import os
import sys
import random
import re
import requests


def generate_otp() -> str:
    """Generate a random 6-digit OTP code."""
    return str(random.randint(100000, 999999))


def send_voice_otp(phone: str, code: str | None = None) -> dict:
    """
    Send a voice OTP to the specified phone number.

    Args:
        phone: Phone number in E.164 format (e.g., +14155551234)
        code: Optional OTP code (4-8 digits). Generated if not provided.

    Returns:
        API response with call_id and status

    Raises:
        ValueError: If environment variables are missing
        requests.HTTPError: If API request fails
    """
    gateway_url = os.environ.get("GATEWAY_URL")
    api_secret = os.environ.get("API_SECRET")

    if not gateway_url:
        raise ValueError("GATEWAY_URL environment variable is required")
    if not api_secret:
        raise ValueError("API_SECRET environment variable is required")

    otp_code = code or generate_otp()

    response = requests.post(
        f"{gateway_url}/send-otp",
        json={
            "phone": phone,
            "code": otp_code,
            "secret": api_secret,
        },
        headers={"Content-Type": "application/json"},
        timeout=30,
    )

    if not response.ok:
        error = response.json()
        raise requests.HTTPError(
            f"API Error: {error.get('message')} ({error.get('error')})"
        )

    return {"code": otp_code, **response.json()}


def main() -> None:
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python python-requests.py <phone> [code]")
        print("Example: python python-requests.py +14155551234")
        sys.exit(1)

    phone = sys.argv[1]
    code = sys.argv[2] if len(sys.argv) > 2 else None

    # Validate phone format
    if not re.match(r"^\+[1-9]\d{9,14}$", phone):
        print("Error: Phone must be in E.164 format (e.g., +14155551234)")
        sys.exit(1)

    try:
        print(f"Sending OTP to {phone}...")
        result = send_voice_otp(phone, code)
        print(f"Success: {result}")
    except Exception as e:
        print(f"Failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
