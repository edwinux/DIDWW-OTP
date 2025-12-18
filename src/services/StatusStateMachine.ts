/**
 * Status State Machine
 *
 * Defines valid state transitions for OTP status tracking.
 * Provides type-safe status validation and transition logic.
 */

import type { OtpStatus, AuthStatus } from '../repositories/OtpRequestRepository.js';

/**
 * Channel-specific event types for SMS
 */
export type SmsEventType =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'undelivered';

/**
 * Channel-specific event types for Voice
 */
export type VoiceEventType =
  | 'queued'
  | 'calling'
  | 'ringing'
  | 'answered'
  | 'playing'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'busy'
  | 'hangup';

/**
 * Combined channel event type
 */
export type ChannelEventType = SmsEventType | VoiceEventType;

/**
 * Valid transitions from each OTP status
 */
const VALID_TRANSITIONS: Record<OtpStatus, OtpStatus[]> = {
  pending: ['sending', 'failed', 'expired'],
  sending: ['sent', 'failed', 'expired'],
  sent: ['delivered', 'failed', 'expired'],
  delivered: ['verified', 'rejected', 'expired'],
  failed: [], // Terminal state
  verified: [], // Terminal state
  rejected: [], // Terminal state
  expired: [], // Terminal state
};

/**
 * Map channel events to high-level OTP status
 */
const EVENT_TO_STATUS: Record<string, OtpStatus> = {
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
 * Terminal statuses that cannot transition further
 */
const TERMINAL_STATUSES: OtpStatus[] = ['failed', 'verified', 'rejected', 'expired'];

/**
 * Status State Machine
 */
export class StatusStateMachine {
  /**
   * Check if a status transition is valid
   */
  canTransition(from: OtpStatus, to: OtpStatus): boolean {
    // Same status is always allowed (idempotent)
    if (from === to) {
      return true;
    }

    const validTargets = VALID_TRANSITIONS[from];
    return validTargets.includes(to);
  }

  /**
   * Check if a status is terminal (cannot transition further)
   */
  isTerminal(status: OtpStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
  }

  /**
   * Get the high-level OTP status for a channel event
   */
  getStatusForEvent(channel: string, eventType: ChannelEventType): OtpStatus | undefined {
    const key = `${channel}:${eventType}`;
    return EVENT_TO_STATUS[key];
  }

  /**
   * Get all valid next statuses from current status
   */
  getValidTransitions(from: OtpStatus): OtpStatus[] {
    return VALID_TRANSITIONS[from] || [];
  }

  /**
   * Validate and return the new status, or current if transition is invalid
   * Logs a warning if transition is invalid but doesn't throw
   */
  transition(current: OtpStatus, next: OtpStatus): OtpStatus {
    if (this.canTransition(current, next)) {
      return next;
    }
    // Invalid transition - return current status (defensive)
    return current;
  }

  /**
   * Check if auth status transition is valid
   * Auth status can only go from null to verified/wrong_code
   */
  canTransitionAuth(current: AuthStatus, next: AuthStatus): boolean {
    // Can only set auth status once (from null)
    if (current === null && (next === 'verified' || next === 'wrong_code')) {
      return true;
    }
    // Same status is allowed (idempotent)
    if (current === next) {
      return true;
    }
    return false;
  }

  /**
   * Get the combined status based on delivery and auth status
   * This maintains backward compatibility with the single status field
   */
  getCombinedStatus(deliveryStatus: OtpStatus, authStatus: AuthStatus): OtpStatus {
    // If auth feedback received, return auth-based status
    if (authStatus === 'verified') {
      return 'verified';
    }
    if (authStatus === 'wrong_code') {
      return 'rejected';
    }
    // Otherwise return delivery status
    return deliveryStatus;
  }
}

/**
 * Singleton instance
 */
let instance: StatusStateMachine | null = null;

/**
 * Get singleton instance
 */
export function getStatusStateMachine(): StatusStateMachine {
  if (!instance) {
    instance = new StatusStateMachine();
  }
  return instance;
}
