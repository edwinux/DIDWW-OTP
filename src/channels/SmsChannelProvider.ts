/**
 * SMS Channel Provider
 *
 * DIDWW REST API integration for SMS OTP delivery.
 * Uses CallerIdRouter for prefix-based caller ID selection.
 */

import type { IChannelProvider, ChannelDeliveryResult, ChannelType } from './IChannelProvider.js';
import { emitOtpEvent } from '../services/OtpEventService.js';
import { getCallerIdRouter } from '../services/CallerIdRouter.js';
import { logger } from '../utils/logger.js';

/**
 * SMS configuration
 */
export interface SmsConfig {
  apiEndpoint: string;
  username: string;
  password: string;
  messageTemplate: string;
  callbackUrl?: string;
}

/**
 * SMS Channel Provider using DIDWW REST API
 */
export class SmsChannelProvider implements IChannelProvider {
  readonly channelType: ChannelType = 'sms';
  private config: SmsConfig;

  constructor(config: SmsConfig) {
    this.config = config;
  }

  /**
   * Send OTP via SMS
   */
  async send(phone: string, code: string, requestId: string): Promise<ChannelDeliveryResult> {
    const e164Phone = phone.startsWith('+') ? phone : `+${phone}`;
    const destination = e164Phone.replace(/^\+/, '');

    // Get caller ID from router (prefix-based routing)
    const router = getCallerIdRouter();
    const source = router.getCallerId('sms', e164Phone);

    if (!source) {
      logger.error('No caller ID route configured for SMS destination', {
        requestId,
        phone: phone.slice(0, 5) + '***',
      });

      emitOtpEvent(requestId, 'sms', 'failed', {
        error: 'No caller ID route configured',
        error_code: 'NO_CALLER_ID_ROUTE',
      });

      return {
        success: false,
        channelType: 'sms',
        error: 'No caller ID route configured for this destination',
        errorCode: 'NO_CALLER_ID_ROUTE',
      };
    }

    // Format message
    const message = this.config.messageTemplate.replace(/\{code\}/g, code);

    logger.info('Sending SMS', {
      requestId,
      phone: phone.slice(0, 5) + '***',
      source,
    });

    // Emit sending event
    emitOtpEvent(requestId, 'sms', 'sending');

    try {
      // Build Basic Auth header
      const basicAuth = Buffer.from(`${this.config.username}:${this.config.password}`).toString(
        'base64'
      );

      // Build request body per DIDWW JSON:API spec
      const body: Record<string, unknown> = {
        data: {
          type: 'outbound_messages',
          attributes: {
            destination,
            source,
            content: message,
          },
        },
      };

      // Add callback URL if configured
      if (this.config.callbackUrl) {
        (body.data as Record<string, unknown>).attributes = {
          ...(body.data as Record<string, unknown>).attributes as Record<string, unknown>,
          callback_url: this.config.callbackUrl,
        };
      }

      const response = await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/vnd.api+json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorDetail = 'Unknown error';
        let errorCode = `HTTP_${response.status}`;

        try {
          const errorJson = JSON.parse(errorBody);
          errorDetail = errorJson.errors?.[0]?.detail || errorBody;
          errorCode = errorJson.errors?.[0]?.code || errorCode;
        } catch {
          errorDetail = errorBody;
        }

        logger.error('SMS API error', {
          requestId,
          status: response.status,
          error: errorDetail,
        });

        // Emit failed event
        emitOtpEvent(requestId, 'sms', 'failed', { error: errorDetail, error_code: errorCode });

        return {
          success: false,
          channelType: 'sms',
          error: errorDetail,
          errorCode,
        };
      }

      const result = (await response.json()) as { data?: { id?: string } };
      const messageId = result.data?.id;

      logger.info('SMS sent successfully', {
        requestId,
        messageId,
      });

      // Emit sent event (delivery confirmation comes via DLR callback)
      emitOtpEvent(requestId, 'sms', 'sent', { provider_id: messageId });

      return {
        success: true,
        channelType: 'sms',
        providerId: messageId,
        metadata: {
          destination,
          source,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('SMS send failed', {
        requestId,
        error: errorMessage,
      });

      // Emit failed event
      emitOtpEvent(requestId, 'sms', 'failed', { error: errorMessage, error_code: 'NETWORK_ERROR' });

      return {
        success: false,
        channelType: 'sms',
        error: errorMessage,
        errorCode: 'NETWORK_ERROR',
      };
    }
  }

  /**
   * Check if SMS channel is available
   */
  async isAvailable(): Promise<boolean> {
    // SMS is available if we have credentials configured
    return !!(this.config.username && this.config.password && this.config.apiEndpoint);
  }
}
