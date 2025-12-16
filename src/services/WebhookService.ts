/**
 * Webhook Service
 *
 * Handles webhook delivery for status updates.
 * Fire-and-forget pattern with retry support.
 */

import { EventEmitter } from 'events';
import { WebhookLogRepository } from '../repositories/WebhookLogRepository.js';
import { logger } from '../utils/logger.js';

/**
 * Webhook payload
 */
export interface WebhookPayload {
  event: string;
  request_id: string;
  phone: string;
  status: string;
  channel?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  timeout: number;
  maxRetries: number;
  retryDelays: number[];
}

/**
 * Default webhook configuration
 */
const DEFAULT_CONFIG: WebhookConfig = {
  timeout: 5000,
  maxRetries: 3,
  retryDelays: [2000, 10000, 30000],
};

/**
 * Webhook Service
 */
export class WebhookService extends EventEmitter {
  private webhookLogRepo: WebhookLogRepository;
  private config: WebhookConfig;

  constructor(webhookLogRepo: WebhookLogRepository, config?: Partial<WebhookConfig>) {
    super();
    this.webhookLogRepo = webhookLogRepo;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Send webhook notification (fire-and-forget)
   */
  async notify(webhookUrl: string, payload: WebhookPayload): Promise<void> {
    // Fire and forget - don't await
    this.deliverWithRetry(webhookUrl, payload).catch((error) => {
      logger.error('Webhook delivery failed after all retries', {
        webhookUrl,
        requestId: payload.request_id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Deliver webhook with retry logic
   */
  private async deliverWithRetry(webhookUrl: string, payload: WebhookPayload): Promise<void> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.deliver(webhookUrl, payload, attempt);

        if (result.success) {
          this.emit('delivered', { webhookUrl, payload, attempt });
          return;
        }

        // Log failed attempt
        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelays[attempt - 1] || 30000;
          logger.warn('Webhook delivery failed, retrying', {
            webhookUrl,
            requestId: payload.request_id,
            attempt,
            nextRetryMs: delay,
            error: result.error,
          });
          await this.sleep(delay);
        }
      } catch (error) {
        if (attempt === this.config.maxRetries) {
          throw error;
        }
        const delay = this.config.retryDelays[attempt - 1] || 30000;
        await this.sleep(delay);
      }
    }

    this.emit('failed', { webhookUrl, payload });
  }

  /**
   * Deliver a single webhook attempt
   */
  private async deliver(
    webhookUrl: string,
    payload: WebhookPayload,
    attempt: number
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DIDWW-OTP-Gateway/1.0',
          'X-Webhook-Event': payload.event,
          'X-Request-ID': payload.request_id,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const success = response.status >= 200 && response.status < 300;

      // Log attempt
      this.webhookLogRepo.logAttempt(
        payload.request_id,
        webhookUrl,
        response.status,
        attempt,
        success ? undefined : `HTTP ${response.status}`
      );

      if (success) {
        logger.info('Webhook delivered', {
          webhookUrl,
          requestId: payload.request_id,
          statusCode: response.status,
          attempt,
        });
      }

      return {
        success,
        statusCode: response.status,
        error: success ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isTimeout = error instanceof Error && error.name === 'AbortError';

      // Log attempt
      this.webhookLogRepo.logAttempt(
        payload.request_id,
        webhookUrl,
        null,
        attempt,
        isTimeout ? 'Timeout' : errorMessage
      );

      logger.warn('Webhook delivery error', {
        webhookUrl,
        requestId: payload.request_id,
        attempt,
        error: errorMessage,
        isTimeout,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
