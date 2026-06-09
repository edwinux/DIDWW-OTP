/**
 * Status Tracker Service
 *
 * Orchestrates status updates across channel_status, auth_status, and combined status.
 * Validates transitions, prevents duplicates, and ensures atomic updates.
 */

import type { OtpStatus, AuthStatus } from '../repositories/OtpRequestRepository.js';
import { OtpRequestRepository } from '../repositories/OtpRequestRepository.js';
import { OtpEventRepository } from '../repositories/OtpEventRepository.js';
import { getStatusStateMachine } from './StatusStateMachine.js';
import { logger } from '../utils/logger.js';

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

    // Validate auth transition - block invalid transitions (e.g., verified -> wrong_code)
    if (!this.stateMachine.canTransitionAuth(request.auth_status, newAuthStatus)) {
      logger.warn('StatusTracker: Invalid auth transition blocked', {
        requestId,
        from: request.auth_status,
        to: newAuthStatus,
      });
      // Return current status without updating - verified status is final
      return request.status as OtpStatus;
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
