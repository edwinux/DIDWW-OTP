/**
 * Voice Channel Provider
 *
 * Wraps existing ARI logic for voice OTP delivery.
 */

import type { IChannelProvider, ChannelDeliveryResult, ChannelType } from './IChannelProvider.js';
import { isAriConnected, getAriClient } from '../ari/client.js';
import { originateOtpCall } from '../ari/handlers.js';
import { logger } from '../utils/logger.js';

/**
 * Voice configuration
 */
export interface VoiceConfig {
  callerId: string;
  messageTemplate: string;
  speed: 'slow' | 'medium' | 'fast';
  timeout: number;
}

/**
 * Voice Channel Provider using Asterisk ARI
 */
export class VoiceChannelProvider implements IChannelProvider {
  readonly channelType: ChannelType = 'voice';
  private config: VoiceConfig;

  constructor(config: VoiceConfig) {
    this.config = config;
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
      await originateOtpCall(client, e164Phone, code, requestId);

      logger.info('Voice call initiated', {
        requestId,
        phone: phone.slice(0, 5) + '***',
      });

      return {
        success: true,
        channelType: 'voice',
        providerId: requestId,
        metadata: {
          callerId: this.config.callerId,
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
