/**
 * SMS Channel Provider
 *
 * DIDWW REST API integration for SMS OTP delivery.
 * Based on working implementation from pro.makeup/supabase/functions/send-sms.
 */

import type { IChannelProvider, ChannelDeliveryResult, ChannelType } from './IChannelProvider.js';
import { logger } from '../utils/logger.js';

/**
 * SMS configuration
 */
export interface SmsConfig {
  apiEndpoint: string;
  username: string;
  password: string;
  callerId: string;
  callerIdUsCanada?: string;
  messageTemplate: string;
  callbackUrl?: string;
}

/**
 * Check if phone is US or Canada (+1 followed by valid area code)
 */
function isUsOrCanada(phone: string): boolean {
  return /^\+1[2-9]\d{9}$/.test(phone);
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

    // Select caller ID based on destination
    const source = isUsOrCanada(e164Phone)
      ? this.config.callerIdUsCanada || this.config.callerId
      : this.config.callerId;

    // Format message
    const message = this.config.messageTemplate.replace(/\{code\}/g, code);

    logger.info('Sending SMS', {
      requestId,
      phone: phone.slice(0, 5) + '***',
      source,
    });

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
