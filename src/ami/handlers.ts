/**
 * AMI Event Handlers
 *
 * Processes Asterisk Manager Interface events to capture SIP failures
 * and emit appropriate voice channel events.
 * Uses CallTrackerService for call correlation.
 */

import { getAmiClient, type AmiHangupEvent, type AmiNewchannelEvent } from './client.js';
import { emitOtpEvent } from '../services/OtpEventService.js';
import { logger } from '../utils/logger.js';
import { getCallTracker } from '../services/CallTrackerService.js';

/**
 * Q.850 cause code descriptions
 * These codes indicate why a call was disconnected
 */
const Q850_CAUSES: Record<number, { description: string; isFailure: boolean }> = {
  // Cause 0 is ambiguous - will be refined based on call state in handleHangup()
  0: { description: 'Call failed', isFailure: true },
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
 * Find request ID from channel name using CallTracker
 * PJSIP channels are named like: PJSIP/14155551234-00000001
 */
function findRequestIdFromChannel(channel: string): string | undefined {
  const tracker = getCallTracker();
  return tracker.findRequestByChannel(channel);
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
  const { channel, cause, causeText, uniqueid, connectedLineNum } = event;
  const tracker = getCallTracker();

  // Only process PJSIP channels (our SIP trunk)
  if (!channel.startsWith('PJSIP/')) {
    return;
  }

  const causeInfo = getCauseInfo(cause);

  // Find the associated request - try multiple correlation methods
  // 1. Try AMI channel name (registered from Newchannel event)
  let requestId = tracker.findRequestByAmiChannel(channel);
  if (requestId) {
    logger.debug('AMI: Correlated hangup via AMI channel', { channel, requestId });
  }

  // 2. Try original channel pattern matching
  if (!requestId) {
    requestId = findRequestIdFromChannel(channel);
  }

  // 3. Fallback: use ConnectedLineNum (destination phone) for correlation
  if (!requestId && connectedLineNum) {
    requestId = tracker.findRequestByPhone(connectedLineNum);
    if (requestId) {
      logger.debug('AMI: Correlated hangup via ConnectedLineNum', {
        channel,
        connectedLineNum,
        requestId,
      });
    }
  }

  if (!requestId) {
    // This hangup is for a call we're not tracking (possibly already handled by ARI)
    logger.debug('AMI: Hangup for untracked channel', {
      channel,
      cause,
      causeText,
      connectedLineNum,
    });
    return;
  }

  // Check if call is still being tracked (might have been handled by ARI already)
  if (!tracker.isTracking(requestId)) {
    logger.debug('AMI: Call already ended via ARI', { requestId, channel, cause });
    return;
  }

  // Only emit failure event if this is actually a failure cause
  if (causeInfo.isFailure) {
    // End call and get durations
    const result = tracker.endCall(requestId);

    // Refine cause 0 description based on call state
    // Cause 0 happens when Asterisk sends CANCEL (e.g., ringing timeout)
    // If call was ringing, it's "No answer"; otherwise "No response"
    let description = causeInfo.description;
    if (cause === 0) {
      const wasRinging = result?.durations.ringDurationMs && result.durations.ringDurationMs > 0;
      description = wasRinging
        ? 'No answer (ringing timeout)'
        : 'Call failed (no response from network)';
    }

    logger.info('AMI: SIP call failure detected', {
      requestId,
      channel,
      cause,
      causeText: description,
      ringDurationMs: result?.durations.ringDurationMs,
    });

    // Emit voice:failed event with Q.850 details and durations
    // Include 'error' field for storage in error_message column
    const errorMessage = `Voice call failed: ${description} (Q.850 cause ${cause})`;
    emitOtpEvent(requestId, 'voice', 'failed', {
      error: errorMessage,
      q850_cause: cause,
      q850_description: description,
      ami_cause_text: causeText,
      channel,
      uniqueid,
      source: 'ami',
      ring_duration_ms: result?.durations.ringDurationMs,
      talk_duration_ms: result?.durations.talkDurationMs,
    });
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

  // Handle DialBegin events to track channel names for later correlation
  // DialBegin has DialString with the actual destination phone number
  client.on('dialbegin', (event: { destChannel: string; phone: string }) => {
    try {
      const tracker = getCallTracker();
      // Register the AMI channel (PJSIP/didww-xxx) with the phone number from DialString
      tracker.registerAmiChannel(event.phone, event.destChannel);
    } catch (error) {
      logger.error('AMI: Error handling dialbegin event', {
        error: error instanceof Error ? error.message : String(error),
        event,
      });
    }
  });

  // Handle Newchannel events as backup (if Exten has actual phone, not "s")
  client.on('newchannel', (event: AmiNewchannelEvent) => {
    try {
      const tracker = getCallTracker();
      // Register the AMI channel (PJSIP/didww-xxx) with the phone number (Exten)
      tracker.registerAmiChannel(event.exten, event.channel);
    } catch (error) {
      logger.error('AMI: Error handling newchannel event', {
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
