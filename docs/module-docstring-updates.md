# Module Docstring Updates

This document contains updated docstrings for key modules reflecting the completed Intelligent OTP Gateway implementation. Apply these updates to enhance inline documentation.

## src/services/OtpEventService.ts

Replace lines 1-6 with:

```typescript
/**
 * OTP Event Service
 *
 * Central event emission hub for all OTP channel events.
 * All channels use this service to emit granular status events.
 *
 * Key responsibilities:
 * - Store channel events in database (OtpEventRepository)
 * - Map granular events to high-level OTP statuses
 * - Broadcast events via WebSocket to admin clients
 * - Trigger HTTP webhook notifications with session_id
 *
 * Event flow:
 * 1. Channel calls emit(requestId, channel, eventType, eventData)
 * 2. Event stored in database for audit trail
 * 3. OTP request status and channel_status updated
 * 4. WebSocket broadcast to connected admin clients
 * 5. HTTP webhook sent to client-configured URL (if present)
 *
 * See Also:
 * - WebhookService: HTTP webhook delivery with retry logic
 * - repositories/OtpEventRepository: Event storage
 * - admin/websocket.ts: WebSocket broadcasting
 */
```

## src/services/WebhookService.ts

Replace lines 1-6 with:

```typescript
/**
 * Webhook Service
 *
 * HTTP webhook delivery service with retry logic for OTP status updates.
 * Fire-and-forget pattern with configurable timeout and retry delays.
 *
 * Key features:
 * - Non-blocking delivery (notify() returns immediately)
 * - Automatic retry with exponential backoff
 * - Logs all attempts to WebhookLogRepository
 * - Timeout protection per attempt
 * - Event emitter for monitoring (delivered/failed events)
 *
 * Configuration:
 * - timeout: Request timeout per attempt (default: 5000ms)
 * - maxRetries: Maximum delivery attempts (default: 3)
 * - retryDelays: Delay between attempts (default: [2s, 10s, 30s])
 *
 * See Also:
 * - OtpEventService: Calls notify() for each event
 * - repositories/WebhookLogRepository: Attempt logging
 */
```

## src/services/DispatchService.ts

Replace lines 1-6 with:

```typescript
/**
 * Dispatch Service
 *
 * Main orchestration service for intelligent OTP delivery.
 * Handles fraud checking, channel selection, automatic failover, and webhook notifications.
 *
 * Key responsibilities:
 * - Fraud evaluation via FraudEngine (with shadow-ban support)
 * - Channel provider coordination (SMS, Voice)
 * - Automatic failover between channels on failure
 * - OTP request lifecycle management
 * - Webhook notification for status events
 * - Authentication feedback processing
 *
 * Dispatch flow:
 * 1. Evaluate fraud risk (score, rate limits, IP reputation)
 * 2. Create OTP request record in database
 * 3. If shadow-banned: Return fake success, emit fake events
 * 4. If allowed: Attempt delivery via channels with failover
 * 5. Send webhook notification for status updates
 *
 * Shadow ban behavior:
 * - High fraud scores (>= threshold) appear successful
 * - Fake events emitted with realistic delays
 * - No actual delivery attempted
 * - Prevents attackers from detecting blocks
 *
 * See Also:
 * - FraudEngine: Risk evaluation and shadow-ban logic
 * - channels/IChannelProvider: Channel abstraction
 * - WebhookService: HTTP webhook delivery
 */
```

## src/controllers/WebhookController.ts

Replace lines 1-5 with:

```typescript
/**
 * Webhook Controller
 *
 * HTTP handlers for incoming webhook callbacks.
 *
 * Endpoints:
 * - POST /webhooks/auth: Authentication feedback from client
 *   - Receives verification success/failure for closed-loop learning
 *   - Updates fraud engine with outcome
 *
 * - POST /webhooks/dlr: DIDWW SMS delivery report callbacks
 *   - Receives JSON:API format delivery reports
 *   - Maps DIDWW status codes to normalized events
 *   - Translates error codes to human-readable descriptions (admin logs)
 *   - Emits SMS events via OtpEventService
 *
 * DIDWW DLR handling:
 * - Supports outbound_message_callbacks and dlr_event types
 * - Case-insensitive status matching
 * - Error code translation using DIDWW_ERROR_CODES map
 * - Always returns 200 OK to acknowledge receipt
 *
 * See Also:
 * - services/OtpEventService: Event emission from DLR callbacks
 * - services/DispatchService: Auth feedback processing
 */
```

## src/config/index.ts

Replace lines 1-6 with:

```typescript
/**
 * Configuration module
 *
 * Parses and validates environment variables using Zod schemas.
 * Provides type-safe access to all configuration values.
 *
 * Key features:
 * - Comprehensive validation with descriptive error messages
 * - Default values for optional settings
 * - Sensitive value masking for logs
 * - Singleton pattern for consistent access
 * - Additional runtime validation (e.g., RTP port ranges)
 *
 * Configuration groups:
 * - didww: SIP trunk credentials and caller IDs
 * - sms: SMS REST API credentials (separate from voice)
 * - fraud: Fraud detection thresholds and rules
 * - channels: Channel selection and failover behavior
 * - webhooks: HTTP webhook timeout and retry settings
 * - admin: Admin panel authentication and session
 *
 * SMS vs Voice credentials:
 * - SMS uses SMS_USERNAME/SMS_PASSWORD for REST API
 * - Voice uses DIDWW_USERNAME/DIDWW_PASSWORD for SIP trunk
 * - Separate caller IDs for SMS (supports alphanumeric international)
 * - Independent billing and capacity management
 *
 * Usage:
 * - getConfig(): Get validated configuration singleton
 * - validateConfig(): Check validity without throwing
 * - resetConfig(): Clear singleton (testing only)
 *
 * See Also:
 * - .env.example: Complete configuration reference
 * - README.md: Configuration documentation
 */
```

## src/index.ts

Replace lines 1-5 with:

```typescript
/**
 * DIDWW Intelligent OTP Gateway
 *
 * Main entry point - initializes all components and starts servers.
 *
 * Initialization sequence:
 * 1. Load and validate configuration (config/index.ts)
 * 2. Initialize SQLite database with migrations
 * 3. Seed ASN blocklist for fraud detection
 * 4. Initialize repositories (OTP, Fraud, Webhook)
 * 5. Configure channel providers (SMS, Voice)
 * 6. Initialize services (FraudEngine, WebhookService, DispatchService)
 * 7. Connect to Asterisk ARI for voice channel
 * 8. Register Stasis handlers for call events
 * 9. Start HTTP API server (port 8080 default)
 * 10. Start admin server if enabled (port 80 default)
 *
 * Channel initialization:
 * - SMS: Enabled if SMS_ENABLED=true and credentials provided
 *   - Uses separate SMS_USERNAME/SMS_PASSWORD (not SIP credentials)
 *   - Supports region-specific caller IDs (US/Canada vs international)
 * - Voice: Always enabled if Asterisk ARI connects
 *   - Uses DIDWW SIP trunk via Asterisk
 *
 * Graceful shutdown:
 * - SIGTERM/SIGINT handlers disconnect ARI and close database
 *
 * See Also:
 * - config/index.ts: Configuration validation
 * - services/DispatchService: Main orchestration
 * - server.ts: HTTP API server setup
 * - admin/index.ts: Admin panel server
 */
```
