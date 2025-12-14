# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email the maintainers directly or use GitHub's private vulnerability reporting feature
3. Include detailed steps to reproduce the vulnerability
4. Allow reasonable time for a fix before public disclosure

## Security Considerations

This project handles sensitive operations (phone verification). When deploying:

- **API_SECRET**: Use a strong, unique secret for API authentication
- **Network**: Deploy behind a firewall, expose only necessary ports
- **SIP Credentials**: Never commit DIDWW credentials to version control
- **Rate Limiting**: Consider adding rate limiting in production
- **TLS**: Use HTTPS for the API in production environments

## Known Security Requirements

- The `.env` file containing secrets must never be committed
- Docker containers should run with minimal privileges
- SIP traffic should be restricted to DIDWW IP ranges when possible
