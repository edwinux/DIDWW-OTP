# DIDWW-OTP Gateway CLAUDE.md

## Purpose
Production-ready intelligent OTP gateway delivering one-time passwords via SMS and Voice channels using DIDWW wholesale SIP trunking. Features multi-channel delivery with automatic failover, real-time fraud detection with shadow-ban capabilities, granular event tracking via WebSocket and HTTP webhooks, and comprehensive admin dashboard.

## Architecture Overview
TypeScript/Node.js application orchestrating multi-channel OTP delivery through three main subsystems:
- Dispatch layer handling channel selection and fraud evaluation
- Channel providers (SMS via REST API, Voice via SIP/Asterisk)
- Event system providing real-time status updates via WebSocket and HTTP webhooks

The gateway processes OTP requests through fraud detection, routes to appropriate channels with automatic failover, and tracks delivery status with granular event emission at every stage.

## Key Components

### Entry Point
- `src/index.ts:18-137` - Main initialization, connects all services and starts servers

### Core Services (src/services/)
- `DispatchService.ts:61-369` - Main orchestration service
  - Coordinates fraud checking, channel selection, and failover
  - Handles shadow-ban responses (fake success returns)
  - Manages webhook notifications for lifecycle events
  - Lines 89-190: Main dispatch logic with fraud check and delivery attempt
  - Lines 195-283: Channel failover implementation

- `OtpEventService.ts:48-227` - Central event emission hub
  - Emits granular channel-specific events (sending, ringing, delivered, etc.)
  - Maps channel events to high-level OTP statuses
  - Broadcasts via WebSocket to admin clients
  - Triggers HTTP webhook notifications with session_id
  - Lines 65-109: Main emit() method handling all event types
  - Lines 174-197: HTTP webhook delivery for granular events

- `WebhookService.ts:47-195` - HTTP webhook delivery with retry
  - Fire-and-forget pattern with configurable retries
  - Logs all attempts to database
  - Lines 60-106: Retry logic with exponential backoff
  - Lines 111-187: Single delivery attempt with timeout handling

- `FraudEngine.ts:71-391` - Intelligent fraud detection
  - Rate limiting per phone and IP subnet
  - ASN-based blocking for VPN/datacenter detection
  - Geographic anomaly detection
  - Shadow-ban for high fraud scores (transparent rejection)
  - IP reputation tracking with circuit breaker patterns

### Channel Providers (src/channels/)
- `SmsChannelProvider.ts:18-151` - DIDWW SMS REST API integration
  - Separate credentials from voice SIP trunk
  - Region-specific caller ID (US/Canada vs international)
  - JSON:API format handling
  - Emits granular SMS events via OtpEventService

- `VoiceChannelProvider.ts:16-78` - Asterisk/ARI voice integration
  - SIP trunk-based voice delivery
  - Integrates with Asterisk ARI for call control
  - TTS-based OTP message playback

### Controllers (src/controllers/)
- `DispatchController.ts` - POST /dispatch and legacy /send-otp endpoints
- `WebhookController.ts:71-229` - Webhook callback handlers
  - Lines 81-120: POST /webhooks/auth - Authentication feedback
  - Lines 125-228: POST /webhooks/dlr - DIDWW delivery report callbacks
  - Lines 48-66: DIDWW error code mapping for admin logs
  - Lines 168-222: SMS DLR status mapping and event emission

### Configuration (src/config/)
- `index.ts:23-341` - Zod-based environment variable validation
  - Lines 24-31: DIDWW SIP trunk configuration
  - Lines 78-88: SMS-specific configuration (separate credentials)
  - Lines 90-101: Fraud detection thresholds
  - Lines 103-107: Channel selection and failover settings
  - Lines 109-113: Webhook retry configuration

### Data Layer (src/repositories/)
- `OtpRequestRepository.ts` - OTP request lifecycle tracking
- `OtpEventRepository.ts` - Granular channel event storage
- `FraudRulesRepository.ts` - ASN blocklist and fraud rules
- `WebhookLogRepository.ts` - Webhook delivery attempt logging

### ARI Integration (src/ari/)
- `client.ts` - Asterisk REST Interface WebSocket client
- `handlers.ts` - Stasis event handlers for call lifecycle

### Admin Panel (src/admin/)
- `index.ts` - Admin HTTP server with session management
- `routes.ts:126-131` - GET /admin/version endpoint providing build metadata
- `controllers/LogsController.ts` - OTP request logs and statistics
- `controllers/TesterController.ts` - Live OTP testing interface
- `controllers/DatabaseController.ts` - Direct database browser
- `websocket.ts` - Real-time WebSocket event broadcasting

### Admin Frontend (admin/src/)
- `components/layout/Sidebar.tsx:38-43` - Version fetching from /admin/version
- `components/layout/Sidebar.tsx:145-167` - Version display in sidebar footer with commit SHA and build time

## Integration Points

### External Dependencies
- DIDWW SIP Trunk - Voice channel delivery (SIP/RTP)
- DIDWW SMS REST API - SMS channel delivery (separate credentials)
- Asterisk with ARI - SIP call handling and TTS
- SQLite - Persistent storage at /data/otp.db

### API Endpoints
- `POST /dispatch` - Send OTP with channel selection and optional webhook
- `POST /webhooks/dlr` - Receive SMS delivery reports from DIDWW
- `POST /webhooks/auth` - Receive authentication success/failure feedback
- `GET /health` - Service health check
- `GET /admin/version` - Build version metadata (public, no auth)
- `/admin/*` - Admin panel API (authenticated)

### WebSocket Events
- Channel: `otp-requests` - High-level status updates
- Channel: `otp-events` - Granular channel-specific events
- Connection: `/admin/ws` - Admin dashboard real-time updates

### HTTP Webhooks (Client-Configured)
- `otp.sending` - OTP dispatch started
- `otp.sent` - OTP accepted by carrier
- `otp.delivered` - OTP confirmed delivered
- `otp.failed` - Delivery failure
- `otp.verified` - OTP code verified by user
- `otp.rejected` - Request rejected by fraud detection

## Configuration

### Required Environment Variables
- `DIDWW_SIP_HOST` - SIP server hostname
- `DIDWW_USERNAME` - SIP trunk username
- `DIDWW_PASSWORD` - SIP trunk password
- `DIDWW_CALLER_ID` - Outbound caller ID (E.164 without +)
- `PUBLIC_IP` - Server public IP for SIP/RTP
- `API_SECRET` - API authentication secret

### SMS Configuration (Optional)
- `SMS_ENABLED` - Enable SMS channel (default: true)
- `SMS_USERNAME` - DIDWW SMS API username (separate from SIP)
- `SMS_PASSWORD` - DIDWW SMS API password (separate from SIP)
- `SMS_CALLER_ID` - Alphanumeric sender ID for international
- `SMS_CALLER_ID_US_CANADA` - Numeric caller ID for US/Canada

### Fraud Detection (Optional)
- `FRAUD_ENABLED` - Enable fraud engine (default: true)
- `FRAUD_SHADOW_BAN_THRESHOLD` - Shadow ban score threshold (default: 50)
- `FRAUD_RATE_LIMIT_HOUR` - Max requests per phone per hour (default: 3)
- `FRAUD_RATE_LIMIT_MINUTE` - Max requests per phone per minute (default: 1)

### Channel Configuration (Optional)
- `CHANNELS_DEFAULT` - Default channels if not specified (default: "sms,voice")
- `CHANNELS_ENABLE_FAILOVER` - Auto-failover to next channel (default: true)

### Admin Panel (Optional)
- `ADMIN_ENABLED` - Enable admin dashboard (default: false)
- `ADMIN_USERNAME` - Admin login username
- `ADMIN_PASSWORD` - Admin login password (min 8 chars)
- `ADMIN_PORT` - Admin panel port (default: 80)

See `.env.example` for complete configuration reference.

## Key Patterns

### Shadow Ban Implementation
High fraud score requests (>= threshold) appear successful to caller but are never actually delivered. Fake events are emitted with realistic delays to prevent detection. See DispatchService.ts:128-162.

### Channel Failover
When primary channel fails, automatically attempts next channel in list if CHANNELS_ENABLE_FAILOVER is true. Continues until success or all channels exhausted. See DispatchService.ts:195-283.

### Event-Driven Status Updates
All channel status changes flow through OtpEventService, which:
1. Stores event in database
2. Maps to high-level status
3. Broadcasts via WebSocket
4. Triggers HTTP webhook (if configured)

This ensures consistent state management across all communication channels.

### Separate SMS/Voice Credentials
SMS uses REST API credentials (SMS_USERNAME/SMS_PASSWORD) while Voice uses SIP trunk credentials (DIDWW_USERNAME/DIDWW_PASSWORD). This allows separate billing/capacity management. See config/index.ts:78-88 and index.ts:44-59.

### DIDWW DLR Callback Handling
SMS delivery reports arrive via POST /webhooks/dlr in JSON:API format. Controller maps DIDWW-specific status codes to normalized events, translates error codes to descriptions (admin logs only), and emits events via OtpEventService. See WebhookController.ts:125-228.

### Build Version Tracking
Docker images are tagged with git commit SHA and build timestamp during CI/CD build. Version metadata is injected as BUILD_COMMIT and BUILD_TIME environment variables, exposed via GET /admin/version endpoint, and displayed in admin panel sidebar. Shows short SHA in UI with full SHA and build time on tooltip hover. Helps track deployed versions in production. See Dockerfile:29-33, routes.ts:126-131, and Sidebar.tsx:145-167.

### Automated Deployment with Rollback
GitHub Actions builds Docker image on every push to main, tags with commit SHA, pushes to GHCR, then SSHs to production server to run deployment script. Script pulls new image, stops old container, starts new one, performs health checks with retries, and automatically rolls back to previous image if health checks fail. Ensures zero-downtime deployments with safety net. See .github/workflows/deploy.yml and scripts/deploy.sh.

## Testing
- `test-otp.sh` - Shell script for testing OTP dispatch
- Admin panel OTP Tester - Live testing with debug console
- Reference: README.md API Reference section

## Build & Deployment

### Local Development
- Build: `npm run build` (outputs to dist/)
- Admin build: `cd admin && npm run build` (outputs to admin/dist/)
- Docker: `docker compose up` or standalone container
- See Dockerfile and docker-compose.yml for containerization

### CI/CD Pipeline
- `.github/workflows/deploy.yml:1-97` - GitHub Actions workflow
  - Lines 12-62: Build job - Creates multi-arch Docker image, pushes to GHCR
  - Lines 64-96: Deploy job - Copies deploy script and triggers deployment
  - Uses build args BUILD_COMMIT and BUILD_TIME for version tracking

- `scripts/deploy.sh:1-143` - Production deployment script
  - Lines 28-50: Health check with configurable retries
  - Lines 52-78: Automatic rollback on health check failure
  - Lines 81-142: Main deployment flow with health verification
  - Runs on production server via SSH from GitHub Actions

### Docker Build Process
- `Dockerfile:29-33` - Build arguments for version metadata
  - BUILD_COMMIT injected from git SHA
  - BUILD_TIME from commit timestamp
  - Exposed as environment variables in container

- `docker-compose.yml:3` - Image configuration
  - Uses DEPLOY_IMAGE environment variable for production
  - Defaults to ghcr.io/edwinux/didww-otp:latest
  - Deploy script overrides this with versioned image

### Production Environment
- URL: https://otp-gw.pro.makeup
- SSL/HTTPS: nginx reverse proxy with Cloudflare Origin Certificate
- Deployment: Automatic on push to main branch
- Registry: GitHub Container Registry (ghcr.io)

See docs/DEPLOYMENT.md for detailed deployment instructions.

## Recent Changes
CI/CD and Production Deployment:
- GitHub Actions workflow for automated Docker builds and deployments
- Production deployment script with automatic rollback on health check failures
- Version tracking via build metadata (commit SHA and build time)
- Admin panel version display in sidebar footer
- SSL/HTTPS via nginx with Cloudflare Origin Certificate
- Production deployment at https://otp-gw.pro.makeup

Previous Features:
- Multi-channel delivery (SMS/Voice) with automatic failover
- Fraud detection with shadow-ban capabilities
- Granular event system with WebSocket and HTTP webhook support
- DIDWW DLR callback processing with error code translation
- Separate SMS API credentials for independent configuration
- Session ID tracking throughout request lifecycle

## Related Documentation
- README.md - User-facing documentation and API reference
- .env.example - Complete environment variable reference
- docs/ - Additional architecture documentation
- examples/ - Integration examples for different platforms
