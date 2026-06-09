/**
 * OTP Event Service
 *
 * Central service for emitting and handling OTP channel events.
 * All channels use this service to emit status events.
 */

import { OtpEventRepository, type ChannelEventType } from '../repositories/OtpEventRepository.js';
import { OtpRequestRepository, type OtpStatus } from '../repositories/OtpRequestRepository.js';
import { WebhookLogRepository } from '../repositories/WebhookLogRepository.js';
import { WebhookService } from './WebhookService.js';
import { getStatusTracker } from './StatusTracker.js';
import { getStatusStateMachine } from './StatusStateMachine.js';
import { getWebSocketServer } from '../admin/websocket.js';
import { logger } from '../utils/logger.js';

/**
 * Singleton instance
 */
let instance: OtpEventService | null = null;

/**
 * OTP Event Service
 */
export class OtpEventService {
  private eventRepo: OtpEventRepository;
  private otpRepo: OtpRequestRepository;
  private webhookService: WebhookService;

  /**
   * Event-metadata keys that are internal/admin-only and must NEVER be forwarded
   * to client-configured webhooks. These can leak provider-side operational detail
   * (e.g. "Insufficient balance", "SMS trunk is blocked", raw DIDWW status/codes).
   * They are still stored in the event DB and broadcast to the authenticated admin
   * WebSocket — only the outbound client webhook payload is redacted.
   */
  private static readonly INTERNAL_METADATA_KEYS = new Set<string>([
    'error', // raw provider error_message (may contain DIDWW-internal text)
    'error_code', // internal DIDWW numeric code
    'error_description', // admin-only DIDWW error-code description
    'didww_status', // raw provider status string
  ]);

  constructor() {
    this.eventRepo = new OtpEventRepository();
    this.otpRepo = new OtpRequestRepository();
    this.webhookService = new WebhookService(new WebhookLogRepository());
  }

  /**
   * Emit a channel event
   * - Stores event in database
   * - Updates OTP request status and channel_status
   * - Broadcasts via WebSocket
   */
  emit(
    requestId: string,
    channel: string,
    eventType: ChannelEventType,
    eventData?: Record<string, unknown>
  ): void {
    try {
      // Check for duplicate delivery events using StatusTracker
      const statusTracker = getStatusTracker();
      if (statusTracker.isDuplicateEvent(requestId, channel, eventType)) {
        logger.debug('Skipping duplicate event', { requestId, channel, eventType });
        return;
      }

      // Store event in database
      const event = this.eventRepo.create({
        request_id: requestId,
        channel,
        event_type: eventType,
        event_data: eventData,
      });

      logger.debug('OTP event emitted', {
        requestId,
        channel,
        eventType,
        eventId: event.id,
      });

      // Get high-level status from event (single source of truth: StatusStateMachine)
      const statusKey = `${channel}:${eventType}`;
      let newStatus = getStatusStateMachine().getStatusForEvent(channel, eventType);

      // Special case: voice:hangup with otp_played=true means successful delivery
      if (statusKey === 'voice:hangup' && eventData?.otp_played === true) {
        newStatus = 'delivered';
      }

      // Update OTP request with new channel_status and error_message if present
      this.updateRequestStatus(requestId, channel, eventType, newStatus, eventData);

      // Broadcast via WebSocket
      this.broadcastEvent(requestId, channel, eventType, eventData);

      // Send HTTP webhook if configured
      this.sendEventWebhook(requestId, channel, eventType, eventData, newStatus);

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to emit OTP event', {
        requestId,
        channel,
        eventType,
        error: msg,
      });
    }
  }

  /**
   * Update OTP request status based on event
   */
  private updateRequestStatus(
    requestId: string,
    channel: string,
    channelStatus: string,
    status?: OtpStatus,
    eventData?: Record<string, unknown>
  ): void {
    const updates: string[] = ['channel_status = ?', 'updated_at = ?'];
    const values: (string | number)[] = [channelStatus, Date.now()];

    // Decide whether the high-level `status` column may be written. The channel_status
    // (raw per-channel event) is always recorded, but the aggregate `status` must not
    // be regressed or clobbered. Without this guard a late delivery report (e.g. a
    // delayed sms:failed) can overwrite an already-verified / delivered outcome.
    let writeStatus = !!status;
    if (status) {
      const current = this.otpRepo.findById(requestId);
      if (current) {
        const stateMachine = getStatusStateMachine();
        if (current.auth_status === 'verified' || current.auth_status === 'wrong_code') {
          // Auth outcome is final - never let a delivery event overwrite it.
          writeStatus = false;
        } else if (stateMachine.isTerminal(current.status) && current.status !== status) {
          // Do not move out of a terminal delivery state.
          writeStatus = false;
        } else if (!stateMachine.canTransition(current.status, status)) {
          // Reject invalid / backward transitions (e.g. delivered -> failed).
          writeStatus = false;
        }
        if (!writeStatus && current.status !== status) {
          logger.debug('Skipping invalid status transition', {
            requestId,
            from: current.status,
            to: status,
            authStatus: current.auth_status,
            event: `${channel}:${channelStatus}`,
          });
        }
      }
    }

    if (status && writeStatus) {
      updates.push('status = ?');
      values.push(status);
    }

    // Store error message if present in event data
    if (eventData?.error) {
      updates.push('error_message = ?');
      values.push(String(eventData.error));
    }

    // Only update channel if not already set
    updates.push('channel = COALESCE(channel, ?)');
    values.push(channel);

    values.push(requestId);

    const db = this.otpRepo['db'];
    const stmt = db.prepare(`UPDATE otp_requests SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  /**
   * Broadcast event via WebSocket
   */
  private broadcastEvent(
    requestId: string,
    channel: string,
    eventType: ChannelEventType,
    eventData?: Record<string, unknown>
  ): void {
    const wsServer = getWebSocketServer();
    if (!wsServer) return;

    // Get high-level status for backward compatibility
    const status = getStatusStateMachine().getStatusForEvent(channel, eventType) || 'pending';

    // Broadcast status update (backward compatible)
    wsServer.broadcastOtpUpdate({
      id: requestId,
      status,
      channel,
      channel_status: eventType,
      updated_at: Date.now(),
    });

    // Also broadcast detailed event
    wsServer.broadcast('otp-events', 'otp-event', {
      request_id: requestId,
      channel,
      event_type: eventType,
      event_data: eventData,
      timestamp: Date.now(),
    });
  }

  /**
   * Send HTTP webhook for granular events
   */
  private sendEventWebhook(
    requestId: string,
    channel: string,
    eventType: string,
    eventData?: Record<string, unknown>,
    status?: OtpStatus
  ): void {
    const request = this.otpRepo.findById(requestId);
    if (!request?.webhook_url) return;

    this.webhookService.notify(request.webhook_url, {
      event: `otp.${eventType}`,
      request_id: requestId,
      session_id: request.session_id || undefined,
      phone: request.phone,
      status: status || 'sending',
      channel,
      timestamp: Date.now(),
      metadata: this.toClientMetadata(eventData),
    });
  }

  /**
   * Strip internal/admin-only keys from event metadata before it is forwarded to
   * a client-configured webhook. Returns undefined when nothing client-safe remains.
   */
  private toClientMetadata(
    eventData?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!eventData) return undefined;
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(eventData)) {
      if (OtpEventService.INTERNAL_METADATA_KEYS.has(key)) continue;
      safe[key] = value;
    }
    return Object.keys(safe).length > 0 ? safe : undefined;
  }

  /**
   * Get all events for a request
   */
  getEvents(requestId: string) {
    return this.eventRepo.findByRequestId(requestId);
  }
}

/**
 * Get singleton instance
 */
export function getOtpEventService(): OtpEventService {
  if (!instance) {
    instance = new OtpEventService();
  }
  return instance;
}

/**
 * Emit an OTP event (convenience function)
 */
export function emitOtpEvent(
  requestId: string,
  channel: string,
  eventType: ChannelEventType,
  eventData?: Record<string, unknown>
): void {
  getOtpEventService().emit(requestId, channel, eventType, eventData);
}
