/**
 * Status Tracker Service
 *
 * Orchestrates status updates across channel_status, auth_status, and combined status.
 * Validates transitions, prevents duplicates, and ensures atomic updates.
 */

import type { OtpStatus, AuthStatus } from '../repositories/OtpRequestRepository.js';
import { OtpRequestRepository } from '../repositories/OtpRequestRepository.js';
import { OtpEventRepository } from '../repositories/OtpEventRepository.js';
import { getStatusStateMachine, type ChannelEventType } from './StatusStateMachine.js';
import { logger } from '../utils/logger.js';

/**
 * Status update request
 */
export interface StatusUpdate {
  requestId: string;
  channel: string;
  eventType: ChannelEventType;
  eventData?: Record<string, unknown>;
}

/**
 * Status Tracker Service
 */
export class StatusTracker {
  private otpRepo: OtpRequestRepository;
  private eventRepo: OtpEventRepository;
  private stateMachine = getStatusStateMachine();

  constructor(otpRepo?: OtpRequestRepository, eventRepo?: OtpEventRepository) {
    this.otpRepo = otpRepo || new OtpRequestRepository();
    this.eventRepo = eventRepo || new OtpEventRepository();
  }

  /**
   * Check if an event would be a duplicate
   * Returns true if we should skip this event
   */
  isDuplicateEvent(requestId: string, channel: string, eventType: string): boolean {
    // Only check duplicates for terminal delivery events
    if (eventType !== 'delivered' && eventType !== 'completed') {
      return false;
    }

    const events = this.eventRepo.findByRequestId(requestId);
    const isDuplicate = events.some(
      (e) => e.channel === channel && (e.event_type === 'delivered' || e.event_type === 'completed')
    );

    if (isDuplicate) {
      logger.debug('Duplicate delivery event detected, skipping', {
        requestId,
        channel,
        eventType,
      });
    }

    return isDuplicate;
  }

  /**
   * Update status based on channel event
   * Returns the new combined status, or null if update was skipped
   */
  updateFromEvent(update: StatusUpdate): OtpStatus | null {
    const { requestId, channel, eventType, eventData } = update;

    // Check for duplicate
    if (this.isDuplicateEvent(requestId, channel, eventType)) {
      return null;
    }

    // Get current request state
    const request = this.otpRepo.findById(requestId);
    if (!request) {
      logger.warn('StatusTracker: Request not found', { requestId });
      return null;
    }

    // Get the new high-level status from the event
    const newStatus = this.stateMachine.getStatusForEvent(channel, eventType);
    if (!newStatus) {
      logger.warn('StatusTracker: Unknown event type', { channel, eventType });
      return null;
    }

    // Validate transition
    const currentStatus = request.status;
    if (!this.stateMachine.canTransition(currentStatus, newStatus)) {
      logger.warn('StatusTracker: Invalid transition', {
        requestId,
        from: currentStatus,
        to: newStatus,
        event: `${channel}:${eventType}`,
      });
      // Still allow the update (defensive) but log warning
    }

    // Update the database
    this.updateRequestStatus(requestId, channel, eventType, newStatus, eventData);

    // Return the combined status (considers auth_status for backward compat)
    return this.stateMachine.getCombinedStatus(newStatus, request.auth_status);
  }

  /**
   * Update authentication status
   * Returns the new combined status
   */
  updateAuthStatus(requestId: string, success: boolean): OtpStatus | null {
    const request = this.otpRepo.findById(requestId);
    if (!request) {
      logger.warn('StatusTracker: Request not found for auth update', { requestId });
      return null;
    }

    const newAuthStatus: AuthStatus = success ? 'verified' : 'wrong_code';

    // Validate auth transition
    if (!this.stateMachine.canTransitionAuth(request.auth_status, newAuthStatus)) {
      logger.warn('StatusTracker: Invalid auth transition', {
        requestId,
        from: request.auth_status,
        to: newAuthStatus,
      });
      // Still allow (defensive)
    }

    // Update auth_status only - do NOT update main status field
    // The status field should remain as the delivery status (delivered, sent, etc.)
    this.otpRepo.updateAuthStatus(requestId, newAuthStatus);

    logger.debug('StatusTracker: Auth status updated', {
      requestId,
      authStatus: newAuthStatus,
      deliveryStatus: request.status,
    });

    // Return the delivery status (unchanged)
    return request.status as OtpStatus;
  }

  /**
   * Get current status info for a request
   */
  getStatus(requestId: string): {
    status: OtpStatus;
    channelStatus: string | null;
    authStatus: AuthStatus;
  } | null {
    const request = this.otpRepo.findById(requestId);
    if (!request) {
      return null;
    }

    return {
      status: request.status,
      channelStatus: request.channel_status,
      authStatus: request.auth_status,
    };
  }

  /**
   * Internal: Update request status in database
   */
  private updateRequestStatus(
    requestId: string,
    channel: string,
    channelStatus: string,
    status: OtpStatus,
    eventData?: Record<string, unknown>
  ): void {
    const db = this.otpRepo['db'];
    const now = Date.now();

    // Build update query
    const updates: string[] = [
      'channel_status = ?',
      'status = ?',
      'updated_at = ?',
      'channel = COALESCE(channel, ?)',
    ];
    const values: (string | number)[] = [channelStatus, status, now, channel];

    // Add error message if present in event data
    if (eventData?.error) {
      updates.push('error_message = ?');
      values.push(String(eventData.error));
    }

    // Add provider_id if present
    if (eventData?.provider_id) {
      updates.push('provider_id = ?');
      values.push(String(eventData.provider_id));
    }

    values.push(requestId);

    const stmt = db.prepare(`UPDATE otp_requests SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    logger.debug('StatusTracker: Status updated', {
      requestId,
      channel,
      channelStatus,
      status,
    });
  }
}

/**
 * Singleton instance
 */
let instance: StatusTracker | null = null;

/**
 * Get singleton instance
 */
export function getStatusTracker(): StatusTracker {
  if (!instance) {
    instance = new StatusTracker();
  }
  return instance;
}
