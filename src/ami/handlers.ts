/**
 * AMI Event Handlers
 *
 * Processes Asterisk Manager Interface events to capture SIP failures
 * and emit appropriate voice channel events.
 */

import { getAmiClient, type AmiHangupEvent } from './client.js';
import { emitOtpEvent } from '../services/OtpEventService.js';
import { logger } from '../utils/logger.js';

/**
 * Q.850 cause code descriptions
 * These codes indicate why a call was disconnected
 */
const Q850_CAUSES: Record<number, { description: string; isFailure: boolean }> = {
  1: { description: 'Unallocated number', isFailure: true },
  2: { description: 'No route to network', isFailure: true },
  3: { description: 'No route to destination', isFailure: true },
  16: { description: 'Normal call clearing', isFailure: false },
  17: { description: 'User busy', isFailure: true },
  18: { description: 'No user responding', isFailure: true },
  19: { description: 'No answer from user', isFailure: true },
  20: { description: 'Subscriber absent', isFailure: true },
  21: { description: 'Call rejected', isFailure: true },
  22: { description: 'Number changed', isFailure: true },
  27: { description: 'Destination out of order', isFailure: true },
  28: { description: 'Invalid number format', isFailure: true },
  29: { description: 'Facility rejected', isFailure: true },
  31: { description: 'Normal, unspecified', isFailure: false },
  34: { description: 'No circuit available', isFailure: true },
  38: { description: 'Network out of order', isFailure: true },
  41: { description: 'Temporary failure', isFailure: true },
  42: { description: 'Switching equipment congestion', isFailure: true },
  44: { description: 'Requested channel not available', isFailure: true },
  47: { description: 'Resource unavailable', isFailure: true },
  50: { description: 'Facility not subscribed', isFailure: true },
  52: { description: 'Outgoing calls barred', isFailure: true },
  54: { description: 'Incoming calls barred', isFailure: true },
  57: { description: 'Bearer capability not authorized', isFailure: true },
  58: { description: 'Bearer capability not available', isFailure: true },
  63: { description: 'Service not available', isFailure: true },
  65: { description: 'Bearer capability not implemented', isFailure: true },
  69: { description: 'Facility not implemented', isFailure: true },
  79: { description: 'Service not implemented', isFailure: true },
  81: { description: 'Invalid call reference', isFailure: true },
  88: { description: 'Incompatible destination', isFailure: true },
  95: { description: 'Invalid message', isFailure: true },
  96: { description: 'Mandatory IE missing', isFailure: true },
  97: { description: 'Message type not implemented', isFailure: true },
  98: { description: 'Message incompatible with state', isFailure: true },
  99: { description: 'IE not implemented', isFailure: true },
  100: { description: 'Invalid IE contents', isFailure: true },
  101: { description: 'Message incompatible with call state', isFailure: true },
  102: { description: 'Recovery on timer expiry', isFailure: true },
  111: { description: 'Protocol error', isFailure: true },
  127: { description: 'Interworking error', isFailure: true },
};

/**
 * Map to track active calls by channel name
 * Key: channel name pattern, Value: requestId
 */
const activeCallMap = new Map<string, string>();

/**
 * Register a call for AMI tracking
 * Call this when originating a voice call
 */
export function registerCallForAmi(channelPattern: string, requestId: string): void {
  activeCallMap.set(channelPattern, requestId);
  logger.debug('AMI: Registered call for tracking', { channelPattern, requestId });
}

/**
 * Unregister a call from AMI tracking
 * Call this when a call completes normally via ARI
 */
export function unregisterCallFromAmi(channelPattern: string): void {
  activeCallMap.delete(channelPattern);
  logger.debug('AMI: Unregistered call from tracking', { channelPattern });
}

/**
 * Find request ID from channel name
 * PJSIP channels are named like: PJSIP/14155551234-00000001
 */
function findRequestIdFromChannel(channel: string): string | null {
  // Try exact match first
  if (activeCallMap.has(channel)) {
    return activeCallMap.get(channel) || null;
  }

  // Try pattern match (channel might have suffix)
  for (const [pattern, requestId] of activeCallMap.entries()) {
    if (channel.includes(pattern) || pattern.includes(channel.split('-')[0])) {
      return requestId;
    }
  }

  return null;
}

/**
 * Get cause info from Q.850 code
 */
function getCauseInfo(cause: number): { description: string; isFailure: boolean } {
  return Q850_CAUSES[cause] || { description: `Unknown cause ${cause}`, isFailure: cause !== 16 };
}

/**
 * Handle AMI Hangup event
 */
function handleHangup(event: AmiHangupEvent): void {
  const { channel, cause, causeText, uniqueid } = event;

  // Only process PJSIP channels (our SIP trunk)
  if (!channel.startsWith('PJSIP/')) {
    return;
  }

  const causeInfo = getCauseInfo(cause);

  // Find the associated request
  const requestId = findRequestIdFromChannel(channel);

  if (!requestId) {
    // This hangup is for a call we're not tracking (possibly already handled by ARI)
    logger.debug('AMI: Hangup for untracked channel', { channel, cause, causeText });
    return;
  }

  // Only emit failure event if this is actually a failure cause
  if (causeInfo.isFailure) {
    logger.info('AMI: SIP call failure detected', {
      requestId,
      channel,
      cause,
      causeText: causeInfo.description,
    });

    // Emit voice:failed event with Q.850 details
    emitOtpEvent(requestId, 'voice', 'failed', {
      q850_cause: cause,
      q850_description: causeInfo.description,
      ami_cause_text: causeText,
      channel,
      uniqueid,
      source: 'ami',
    });

    // Clean up tracking
    unregisterCallFromAmi(channel);
  } else {
    // Normal call clearing - the call was handled normally
    // ARI should have already emitted the completion event
    logger.debug('AMI: Normal call clearing', {
      requestId,
      channel,
      cause,
      causeText: causeInfo.description,
    });
  }
}

/**
 * Register AMI event handlers
 */
export function registerAmiHandlers(): void {
  const client = getAmiClient();

  client.on('hangup', (event: AmiHangupEvent) => {
    try {
      handleHangup(event);
    } catch (error) {
      logger.error('AMI: Error handling hangup event', {
        error: error instanceof Error ? error.message : String(error),
        event,
      });
    }
  });

  client.on('maxReconnectAttempts', () => {
    logger.warn('AMI: Connection lost permanently, SIP failure detection disabled');
  });

  logger.info('AMI: Event handlers registered');
}

/**
 * Get Q.850 cause description
 */
export function getQ850Description(cause: number): string {
  const info = Q850_CAUSES[cause];
  return info?.description || `Unknown cause ${cause}`;
}

/**
 * Check if Q.850 cause indicates a failure
 */
export function isQ850Failure(cause: number): boolean {
  const info = Q850_CAUSES[cause];
  return info?.isFailure ?? (cause !== 16 && cause !== 31);
}
