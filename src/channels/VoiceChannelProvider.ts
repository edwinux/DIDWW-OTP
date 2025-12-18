/**
 * Voice Channel Provider
 *
 * Wraps existing ARI logic for voice OTP delivery.
 * Uses CallerIdRouter for prefix-based caller ID selection.
 */

import type { IChannelProvider, ChannelDeliveryResult, ChannelType } from './IChannelProvider.js';
import { isAriConnected, getAriClient } from '../ari/client.js';
import { originateOtpCall } from '../ari/handlers.js';
import { getCallerIdRouter } from '../services/CallerIdRouter.js';
import { logger } from '../utils/logger.js';

/**
 * Voice configuration (kept for interface compatibility)
 */
export interface VoiceConfig {
  messageTemplate: string;
  speed: 'slow' | 'medium' | 'fast';
  timeout: number;
}

/**
 * Voice Channel Provider using Asterisk ARI
 */
export class VoiceChannelProvider implements IChannelProvider {
  readonly channelType: ChannelType = 'voice';

  // Voice config (messageTemplate, speed) is read directly from global config in handlers.ts
  // Caller ID is now obtained from CallerIdRouter
  constructor(_config: VoiceConfig) {
    // Config stored for potential future use
  }

  /**
   * Send OTP via voice call
   */
  async send(phone: string, code: string, requestId: string): Promise<ChannelDeliveryResult> {
    const e164Phone = phone.startsWith('+') ? phone : `+${phone}`;

    logger.info('Initiating voice call', {
      requestId,
      phone: phone.slice(0, 5) + '***',
    });

    // Get caller ID from router (prefix-based routing)
    const router = getCallerIdRouter();
    const callerId = router.getCallerId('voice', e164Phone);

    if (!callerId) {
      logger.error('No caller ID route configured for voice destination', {
        requestId,
        phone: phone.slice(0, 5) + '***',
      });

      return {
        success: false,
        channelType: 'voice',
        error: 'No caller ID route configured for this destination',
        errorCode: 'NO_CALLER_ID_ROUTE',
      };
    }

    // Check ARI connection
    if (!isAriConnected()) {
      logger.error('ARI not connected for voice call', { requestId });
      return {
        success: false,
        channelType: 'voice',
        error: 'Voice gateway not available',
        errorCode: 'ARI_DISCONNECTED',
      };
    }

    try {
      const client = getAriClient();
      await originateOtpCall(client, e164Phone, code, requestId, callerId);

      logger.info('Voice call initiated', {
        requestId,
        phone: phone.slice(0, 5) + '***',
        callerId,
      });

      return {
        success: true,
        channelType: 'voice',
        providerId: requestId,
        metadata: {
          callerId,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Voice call failed', {
        requestId,
        error: errorMessage,
      });

      return {
        success: false,
        channelType: 'voice',
        error: errorMessage,
        errorCode: 'CALL_FAILED',
      };
    }
  }

  /**
   * Check if voice channel is available
   */
  async isAvailable(): Promise<boolean> {
    return isAriConnected();
  }
}
