/**
 * Call Tracker Service
 *
 * Centralizes call state management for voice OTP delivery.
 * Coordinates between ARI (call control) and AMI (SIP failure detection)
 * to provide comprehensive call tracking with duration metrics.
 */

import { logger } from '../utils/logger.js';

/**
 * Call state tracked throughout the call lifecycle
 */
export interface CallState {
  requestId: string;
  phone: string;
  code: string;
  callerId: string;

  // Call progress tracking
  otpPlayed: boolean;
  systemHangup: boolean;

  // Timing for duration calculation
  startTime: number;
  answerTime?: number;
  endTime?: number;

  // Asterisk identifiers for AMI correlation
  channelId?: string;
  uniqueId?: string;

  // Internal: channel pattern used for AMI correlation (stored for reliable cleanup)
  channelPattern?: string;
}

/**
 * Duration metrics calculated from call timestamps
 */
export interface CallDurations {
  ringDurationMs?: number;
  talkDurationMs?: number;
  totalDurationMs?: number;
}

/**
 * Call Tracker Service
 *
 * Single source of truth for active call state.
 * Provides correlation between ARI and AMI events.
 */
class CallTrackerService {
  // Primary lookup by requestId (our internal ID)
  private activeCalls = new Map<string, CallState>();

  // Secondary lookups for AMI correlation
  private channelToRequest = new Map<string, string>();
  private uniqueIdToRequest = new Map<string, string>();
  // Actual AMI channel names (PJSIP/didww-xxx) to request mapping
  private amiChannelToRequest = new Map<string, string>();

  /**
   * Register a new call when origination starts
   */
  registerCall(
    requestId: string,
    phone: string,
    code: string,
    callerId: string
  ): CallState {
    // Register channel pattern for AMI correlation
    // Channel names are like: PJSIP/14155551234-00000001
    const normalizedPhone = phone.replace(/^\+/, '');
    const channelPattern = `PJSIP/${normalizedPhone}`;

    const state: CallState = {
      requestId,
      phone,
      code,
      callerId,
      otpPlayed: false,
      systemHangup: false,
      startTime: Date.now(),
      channelPattern, // Store for reliable cleanup
    };

    this.activeCalls.set(requestId, state);
    this.channelToRequest.set(channelPattern, requestId);

    logger.debug('CallTracker: Registered call', {
      requestId,
      phone: phone.slice(0, 5) + '***',
      callerId,
      channelPattern,
    });

    return state;
  }

  /**
   * Update call with Asterisk unique ID (for precise AMI correlation)
   */
  setUniqueId(requestId: string, uniqueId: string): void {
    const state = this.activeCalls.get(requestId);
    if (!state) {
      logger.warn('CallTracker: setUniqueId for unknown call', { requestId });
      return;
    }

    state.uniqueId = uniqueId;
    this.uniqueIdToRequest.set(uniqueId, requestId);

    logger.debug('CallTracker: Set unique ID', { requestId, uniqueId });
  }

  /**
   * Update call with channel ID from ARI
   */
  setChannelId(requestId: string, channelId: string): void {
    const state = this.activeCalls.get(requestId);
    if (!state) {
      logger.warn('CallTracker: setChannelId for unknown call', { requestId });
      return;
    }

    state.channelId = channelId;

    logger.debug('CallTracker: Set channel ID', { requestId, channelId });
  }

  /**
   * Get call state by request ID
   */
  getCallState(requestId: string): CallState | undefined {
    return this.activeCalls.get(requestId);
  }

  /**
   * Find request ID from AMI channel name
   * Handles channel names like: PJSIP/14155551234-00000001
   */
  findRequestByChannel(channel: string): string | undefined {
    // Try exact match on channel pattern
    for (const [pattern, requestId] of this.channelToRequest.entries()) {
      if (channel.startsWith(pattern)) {
        return requestId;
      }
    }

    // Extract phone from channel name and try pattern match
    const match = channel.match(/^PJSIP\/(\d+)/);
    if (match) {
      const phone = match[1];
      const pattern = `PJSIP/${phone}`;
      return this.channelToRequest.get(pattern);
    }

    return undefined;
  }

  /**
   * Find request ID by phone number (ConnectedLineNum from AMI)
   * Used when channel name correlation fails (e.g., PJSIP/didww-00000000)
   */
  findRequestByPhone(phone: string): string | undefined {
    // Normalize phone (remove + prefix if present)
    const normalizedPhone = phone.replace(/^\+/, '');

    // Search active calls for matching phone
    for (const [requestId, state] of this.activeCalls.entries()) {
      const statePhone = state.phone.replace(/^\+/, '');
      if (statePhone === normalizedPhone) {
        return requestId;
      }
    }

    return undefined;
  }

  /**
   * Register AMI channel name when we see a Newchannel event
   * This associates the actual channel (PJSIP/didww-00000000) with our request
   */
  registerAmiChannel(phone: string, amiChannel: string): string | undefined {
    // Find request by phone number
    const requestId = this.findRequestByPhone(phone);
    if (!requestId) {
      logger.debug('CallTracker: No active call for phone', { phone, amiChannel });
      return undefined;
    }

    // Store the AMI channel mapping
    this.amiChannelToRequest.set(amiChannel, requestId);

    logger.info('CallTracker: Registered AMI channel', {
      requestId,
      amiChannel,
      phone: phone.slice(0, 5) + '***',
    });

    return requestId;
  }

  /**
   * Find request ID by AMI channel name (PJSIP/didww-xxx)
   */
  findRequestByAmiChannel(amiChannel: string): string | undefined {
    return this.amiChannelToRequest.get(amiChannel);
  }

  /**
   * Find request ID from Asterisk unique ID
   */
  findRequestByUniqueId(uniqueId: string): string | undefined {
    return this.uniqueIdToRequest.get(uniqueId);
  }

  /**
   * Mark call as answered and record answer time
   */
  markAnswered(requestId: string): CallDurations {
    const state = this.activeCalls.get(requestId);
    if (!state) {
      logger.warn('CallTracker: markAnswered for unknown call', { requestId });
      return {};
    }

    state.answerTime = Date.now();

    const durations = this.calculateDurations(state);

    logger.debug('CallTracker: Call answered', {
      requestId,
      ringDurationMs: durations.ringDurationMs,
    });

    return durations;
  }

  /**
   * Mark that OTP audio finished playing
   */
  markOtpPlayed(requestId: string): void {
    const state = this.activeCalls.get(requestId);
    if (!state) {
      logger.warn('CallTracker: markOtpPlayed for unknown call', { requestId });
      return;
    }

    state.otpPlayed = true;

    logger.debug('CallTracker: OTP played', { requestId });
  }

  /**
   * Mark that system initiated hangup (vs user hangup)
   */
  markSystemHangup(requestId: string): void {
    const state = this.activeCalls.get(requestId);
    if (!state) {
      logger.warn('CallTracker: markSystemHangup for unknown call', { requestId });
      return;
    }

    state.systemHangup = true;

    logger.debug('CallTracker: System hangup marked', { requestId });
  }

  /**
   * End call and calculate final durations
   * Returns state and durations, then removes from tracking
   */
  endCall(requestId: string): { state: CallState; durations: CallDurations } | undefined {
    const state = this.activeCalls.get(requestId);
    if (!state) {
      logger.debug('CallTracker: endCall for unknown/already-ended call', { requestId });
      return undefined;
    }

    state.endTime = Date.now();
    const durations = this.calculateDurations(state);

    // Clean up all maps
    this.cleanup(requestId, state);

    logger.debug('CallTracker: Call ended', {
      requestId,
      ...durations,
      otpPlayed: state.otpPlayed,
      systemHangup: state.systemHangup,
    });

    return { state, durations };
  }

  /**
   * Check if a call is being tracked
   */
  isTracking(requestId: string): boolean {
    return this.activeCalls.has(requestId);
  }

  /**
   * Get count of active calls (for monitoring)
   */
  getActiveCallCount(): number {
    return this.activeCalls.size;
  }

  /**
   * Calculate durations from call state
   */
  private calculateDurations(state: CallState): CallDurations {
    const durations: CallDurations = {};

    if (state.answerTime) {
      durations.ringDurationMs = state.answerTime - state.startTime;
    }

    if (state.answerTime && state.endTime) {
      durations.talkDurationMs = state.endTime - state.answerTime;
    }

    if (state.endTime) {
      durations.totalDurationMs = state.endTime - state.startTime;
    }

    return durations;
  }

  /**
   * Clean up all tracking maps for a call
   */
  private cleanup(requestId: string, state: CallState): void {
    this.activeCalls.delete(requestId);

    // Clean up channel pattern (use stored value for reliability)
    if (state.channelPattern) {
      this.channelToRequest.delete(state.channelPattern);
    }

    // Clean up unique ID if set
    if (state.uniqueId) {
      this.uniqueIdToRequest.delete(state.uniqueId);
    }

    // Clean up AMI channel mapping
    for (const [channel, reqId] of this.amiChannelToRequest.entries()) {
      if (reqId === requestId) {
        this.amiChannelToRequest.delete(channel);
        break;
      }
    }
  }
}

/**
 * Singleton instance
 */
let instance: CallTrackerService | null = null;

/**
 * Get the CallTracker service instance
 */
export function getCallTracker(): CallTrackerService {
  if (!instance) {
    instance = new CallTrackerService();
  }
  return instance;
}

/**
 * Reset the CallTracker (for testing)
 */
export function resetCallTracker(): void {
  instance = null;
}
