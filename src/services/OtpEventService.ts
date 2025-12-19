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
import { getWebSocketServer } from '../admin/websocket.js';
import { logger } from '../utils/logger.js';

/**
 * Map channel events to high-level OTP status
 */
const EVENT_TO_STATUS_MAP: Record<string, OtpStatus> = {
  // SMS events
  'sms:queued': 'pending',
  'sms:sending': 'sending',
  'sms:sent': 'sent',
  'sms:delivered': 'delivered',
  'sms:failed': 'failed',
  'sms:undelivered': 'failed',

  // Voice events
  'voice:queued': 'pending',
  'voice:calling': 'sending',
  'voice:ringing': 'sent',
  'voice:answered': 'sent',
  'voice:playing': 'sent',
  'voice:completed': 'delivered',
  'voice:failed': 'failed',
  'voice:no_answer': 'failed',
  'voice:busy': 'failed',
  'voice:hangup': 'failed',
};

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

      // Get high-level status from event
      const statusKey = `${channel}:${eventType}`;
      let newStatus = EVENT_TO_STATUS_MAP[statusKey];

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

    if (status) {
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
    const statusKey = `${channel}:${eventType}`;
    const status = EVENT_TO_STATUS_MAP[statusKey] || 'pending';

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
      metadata: eventData,
    });
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
