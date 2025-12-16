/**
 * Dispatch Service
 *
 * Main orchestration service for OTP delivery.
 * Handles fraud checking, channel selection, failover, and status tracking.
 */

import crypto from 'crypto';
import type { IChannelProvider, ChannelType } from '../channels/IChannelProvider.js';
import { FraudEngine } from './FraudEngine.js';
import { WebhookService, type WebhookPayload } from './WebhookService.js';
import { OtpRequestRepository, type OtpStatus } from '../repositories/OtpRequestRepository.js';
import { logger } from '../utils/logger.js';

/**
 * Dispatch request input
 */
export interface DispatchRequest {
  phone: string;
  code: string;
  sessionId?: string;
  channels?: ChannelType[];
  webhookUrl?: string;
  ip: string;
}

/**
 * Dispatch response
 */
export interface DispatchResponse {
  success: boolean;
  requestId: string;
  status: 'dispatched' | 'queued' | 'shadow_banned';
  channel?: ChannelType;
  phone: string;
  message?: string;
}

/**
 * Dispatch service configuration
 */
export interface DispatchConfig {
  defaultChannels: ChannelType[];
  enableFailover: boolean;
  codeHashAlgorithm: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DispatchConfig = {
  defaultChannels: ['sms', 'voice'],
  enableFailover: true,
  codeHashAlgorithm: 'sha256',
};

/**
 * Dispatch Service
 */
export class DispatchService {
  private channelProviders: Map<ChannelType, IChannelProvider>;
  private fraudEngine: FraudEngine;
  private webhookService: WebhookService;
  private otpRepo: OtpRequestRepository;
  private config: DispatchConfig;

  constructor(
    channelProviders: IChannelProvider[],
    fraudEngine: FraudEngine,
    webhookService: WebhookService,
    otpRepo: OtpRequestRepository,
    config?: Partial<DispatchConfig>
  ) {
    this.channelProviders = new Map();
    for (const provider of channelProviders) {
      this.channelProviders.set(provider.channelType, provider);
    }

    this.fraudEngine = fraudEngine;
    this.webhookService = webhookService;
    this.otpRepo = otpRepo;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Dispatch OTP to phone
   */
  async dispatch(request: DispatchRequest): Promise<DispatchResponse> {
    const requestId = crypto.randomUUID();
    const channels = request.channels || this.config.defaultChannels;

    logger.info('Dispatch request received', {
      requestId,
      phone: request.phone.slice(0, 5) + '***',
      channels,
      hasWebhook: !!request.webhookUrl,
    });

    // Step 1: Fraud check
    const fraudResult = this.fraudEngine.evaluate({
      phone: request.phone,
      ip: request.ip,
      sessionId: request.sessionId,
    });

    // Step 2: Create request record
    const codeHash = this.hashCode(request.code);
    this.otpRepo.create({
      id: requestId,
      session_id: request.sessionId,
      phone: request.phone,
      phone_prefix: fraudResult.phonePrefix || undefined,
      code_hash: codeHash,
      channels_requested: channels,
      ip_address: request.ip,
      ip_subnet: fraudResult.ipSubnet,
      asn: fraudResult.asn || undefined,
      country_code: fraudResult.ipCountry || undefined,
      phone_country: fraudResult.phoneCountry || undefined,
      fraud_score: fraudResult.score,
      fraud_reasons: fraudResult.reasons.length > 0 ? fraudResult.reasons : undefined,
      shadow_banned: fraudResult.shadowBan,
      webhook_url: request.webhookUrl,
      expires_at: Date.now() + 10 * 60 * 1000, // 10 minute expiry
    });

    // Step 3: Handle shadow ban (ALWAYS return fake success)
    if (fraudResult.shadowBan) {
      logger.warn('Request shadow-banned', {
        requestId,
        score: fraudResult.score,
        reasons: fraudResult.reasons,
      });

      // Update status to look like it was sent
      this.otpRepo.updateStatus(requestId, 'sent', { channel: channels[0] });

      // Send fake webhook (delayed to simulate real delivery)
      if (request.webhookUrl) {
        setTimeout(() => {
          this.sendWebhook(request.webhookUrl!, {
            event: 'otp.sent',
            request_id: requestId,
            phone: request.phone,
            status: 'sent',
            channel: channels[0],
            timestamp: Date.now(),
          });
        }, 500 + Math.random() * 1000);
      }

      // Return fake success (shadow ban is invisible to caller)
      return {
        success: true,
        requestId,
        status: 'dispatched',
        channel: channels[0],
        phone: request.phone,
      };
    }

    // Step 4: Attempt delivery via channels
    const deliveryResult = await this.attemptDelivery(requestId, request, channels);

    // Step 5: Send webhook for real delivery
    if (request.webhookUrl) {
      this.sendWebhook(request.webhookUrl, {
        event: deliveryResult.success ? 'otp.sent' : 'otp.failed',
        request_id: requestId,
        phone: request.phone,
        status: deliveryResult.success ? 'sent' : 'failed',
        channel: deliveryResult.channel,
        timestamp: Date.now(),
        metadata: deliveryResult.error ? { error: deliveryResult.error } : undefined,
      });
    }

    return {
      success: deliveryResult.success,
      requestId,
      status: deliveryResult.success ? 'dispatched' : 'queued',
      channel: deliveryResult.channel,
      phone: request.phone,
      message: deliveryResult.error,
    };
  }

  /**
   * Attempt delivery via available channels with failover
   */
  private async attemptDelivery(
    requestId: string,
    request: DispatchRequest,
    channels: ChannelType[]
  ): Promise<{ success: boolean; channel?: ChannelType; error?: string }> {
    for (const channelType of channels) {
      const provider = this.channelProviders.get(channelType);

      if (!provider) {
        logger.warn('Channel provider not configured', { requestId, channelType });
        continue;
      }

      // Check if channel is available
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        logger.warn('Channel not available', { requestId, channelType });
        continue;
      }

      // Update status to sending
      this.otpRepo.updateStatus(requestId, 'sending', { channel: channelType });

      // Attempt send
      const result = await provider.send(request.phone, request.code, requestId);

      if (result.success) {
        // Update status to sent
        this.otpRepo.updateStatus(requestId, 'sent', {
          channel: channelType,
          provider_id: result.providerId,
        });

        logger.info('OTP delivered', {
          requestId,
          channel: channelType,
          providerId: result.providerId,
        });

        return {
          success: true,
          channel: channelType,
        };
      }

      // Log failure
      logger.warn('Channel delivery failed', {
        requestId,
        channel: channelType,
        error: result.error,
        errorCode: result.errorCode,
      });

      // If failover is disabled, stop here
      if (!this.config.enableFailover) {
        this.otpRepo.updateStatus(requestId, 'failed', {
          channel: channelType,
          error_message: result.error,
        });

        return {
          success: false,
          channel: channelType,
          error: result.error,
        };
      }

      // Continue to next channel (failover)
    }

    // All channels failed
    this.otpRepo.updateStatus(requestId, 'failed', {
      error_message: 'All channels failed',
    });

    logger.error('All channels failed', {
      requestId,
      attemptedChannels: channels,
    });

    return {
      success: false,
      error: 'All delivery channels failed',
    };
  }

  /**
   * Handle auth feedback (verification result)
   */
  handleAuthFeedback(requestId: string, success: boolean): void {
    const request = this.otpRepo.findById(requestId);

    if (!request) {
      logger.warn('Auth feedback for unknown request', { requestId });
      return;
    }

    // Update request status
    const newStatus: OtpStatus = success ? 'verified' : 'rejected';
    this.otpRepo.updateStatus(requestId, newStatus);

    // Update fraud engine
    if (success) {
      this.fraudEngine.recordSuccess(request.phone, request.ip_subnet || '');
    } else {
      this.fraudEngine.recordFailure(request.phone, request.ip_subnet || '');
    }

    // Send webhook if configured
    if (request.webhook_url) {
      this.sendWebhook(request.webhook_url, {
        event: success ? 'otp.verified' : 'otp.rejected',
        request_id: requestId,
        phone: request.phone,
        status: newStatus,
        channel: request.channel || undefined,
        timestamp: Date.now(),
      });
    }

    logger.info('Auth feedback processed', {
      requestId,
      success,
      newStatus,
    });
  }

  /**
   * Send webhook notification
   */
  private sendWebhook(url: string, payload: WebhookPayload): void {
    this.webhookService.notify(url, payload).catch((error) => {
      logger.error('Failed to send webhook', {
        url,
        requestId: payload.request_id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Hash OTP code for storage
   */
  private hashCode(code: string): string {
    return crypto.createHash(this.config.codeHashAlgorithm).update(code).digest('hex');
  }
}
