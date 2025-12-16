/**
 * OTP Event Service
 *
 * Central service for emitting and handling OTP channel events.
 * All channels use this service to emit status events.
 */

import { OtpEventRepository, type ChannelEventType } from '../repositories/OtpEventRepository.js';
import { OtpRequestRepository, type OtpStatus } from '../repositories/OtpRequestRepository.js';
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

  constructor() {
    this.eventRepo = new OtpEventRepository();
    this.otpRepo = new OtpRequestRepository();
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
      const newStatus = EVENT_TO_STATUS_MAP[statusKey];

      // Update OTP request with new channel_status
      this.updateRequestStatus(requestId, channel, eventType, newStatus);

      // Broadcast via WebSocket
      this.broadcastEvent(requestId, channel, eventType, eventData);

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
    status?: OtpStatus
  ): void {
    const updates: string[] = ['channel_status = ?', 'updated_at = ?'];
    const values: (string | number)[] = [channelStatus, Date.now()];

    if (status) {
      updates.push('status = ?');
      values.push(status);
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
