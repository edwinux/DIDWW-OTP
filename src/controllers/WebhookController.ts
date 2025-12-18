/**
 * Webhook Controller
 *
 * HTTP handlers for webhook endpoints.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import type { DispatchService } from '../services/DispatchService.js';
import { OtpRequestRepository } from '../repositories/OtpRequestRepository.js';
import { emitOtpEvent } from '../services/OtpEventService.js';
import { SmsCost } from '../domain/SmsCost.js';
import { logger } from '../utils/logger.js';

/**
 * Auth feedback schema
 */
const authFeedbackSchema = z.object({
  request_id: z.string().uuid(),
  success: z.boolean(),
});

/**
 * DLR (Delivery Report) callback schema for DIDWW
 * Supports both outbound_message_callbacks and dlr_event types
 */
const dlrCallbackSchema = z.object({
  data: z.object({
    id: z.string(),
    type: z.enum(['outbound_message_callbacks', 'dlr_event', 'outbound_messages']),
    attributes: z.object({
      status: z.string(),
      source: z.string().optional(),
      destination: z.string().optional(),
      time_start: z.string().optional(),
      end_time: z.string().optional(),
      fragments_sent: z.number().optional(),
      price: z.number().optional(),
      code_id: z.union([z.string(), z.number()]).nullable().optional(),
      error_code: z.string().optional(),
      error_message: z.string().optional(),
    }),
  }),
});

/**
 * DIDWW SMS error code descriptions (for admin logs only)
 */
const DIDWW_ERROR_CODES: Record<number, string> = {
  1: 'No routes found',
  2: 'No rate found',
  3: 'No routes found',
  4: 'Internal error',
  5: 'SMS trunk is blocked',
  6: 'Internal error',
  7: 'Origination account is blocked',
  8: 'SMS source address is not allowed',
  9: 'SMS destination address is not allowed',
  10: 'SMS Campaign not found or blocked',
  11: 'SMS Campaign not found or blocked',
  100: 'Insufficient balance',
  101: 'All delivery attempts failed within the TTL',
  102: 'No encoding available',
  103: 'Max balance attempts reached',
  104: 'Message defragmentation failed',
  105: 'Routing failed',
};

/**
 * Webhook Controller
 */
export class WebhookController {
  private dispatchService: DispatchService;

  constructor(dispatchService: DispatchService) {
    this.dispatchService = dispatchService;
  }

  /**
   * Handle POST /webhooks/auth - Auth provider feedback
   */
  async handleAuthFeedback(req: Request, res: Response): Promise<void> {
    const validation = authFeedbackSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.issues.map((i) => i.message).join(', ');
      logger.warn('Invalid auth feedback', { errors });
      res.status(400).json({
        error: 'invalid_request',
        message: errors,
      });
      return;
    }

    const { request_id, success } = validation.data;

    try {
      this.dispatchService.handleAuthFeedback(request_id, success);

      logger.info('Auth feedback received', {
        requestId: request_id,
        success,
      });

      res.status(200).json({
        status: 'received',
        request_id,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Auth feedback processing failed', {
        requestId: request_id,
        error: errorMessage,
      });

      res.status(500).json({
        error: 'processing_failed',
        message: 'Failed to process auth feedback',
      });
    }
  }

  /**
   * Handle POST /webhooks/dlr - DIDWW delivery report callback
   */
  async handleDlrCallback(req: Request, res: Response): Promise<void> {
    // Log raw request for debugging
    logger.debug('DLR callback received', {
      contentType: req.headers['content-type'],
      body: JSON.stringify(req.body).slice(0, 500),
      query: req.query,
    });

    const validation = dlrCallbackSchema.safeParse(req.body);

    if (!validation.success) {
      // Log but still return 200 to acknowledge receipt
      logger.warn('Invalid DLR callback format', {
        contentType: req.headers['content-type'],
        body: JSON.stringify(req.body).slice(0, 500),
      });
      res.status(200).json({ status: 'acknowledged' });
      return;
    }

    const { data } = validation.data;
    const messageId = data.id;
    const status = data.attributes.status.toLowerCase();

    logger.info('DLR callback received', {
      messageId,
      status,
      originalStatus: data.attributes.status,
      errorCode: data.attributes.error_code,
      errorMessage: data.attributes.error_message,
    });

    // Look up OTP request by provider_id
    const otpRepo = new OtpRequestRepository();
    const otpRequest = otpRepo.findByProviderId(messageId);

    if (!otpRequest) {
      logger.warn('DLR callback for unknown message', { messageId });
      res.status(200).json({ status: 'acknowledged', message: 'unknown message' });
      return;
    }

    // Map DIDWW status to SMS event type (case-insensitive - status already lowercased)
    let eventType: 'delivered' | 'failed' | 'undelivered' | null = null;
    if (status === 'delivered' || status === 'sent' || status === 'success') {
      eventType = 'delivered';
    } else if (
      status === 'failed' ||
      status === 'rejected' ||
      status === 'expired' ||
      status === 'undelivered' ||
      status === 'routing error' ||
      status === 'error' ||
      status.includes('error') ||
      status.includes('failed')
    ) {
      eventType = 'failed';
    }

    // If code_id is present and non-null, treat as failure
    const codeId = data.attributes.code_id;
    if (codeId !== null && codeId !== undefined && codeId !== 'null') {
      const numericCode = typeof codeId === 'number' ? codeId : parseInt(codeId, 10);
      if (!isNaN(numericCode) && numericCode > 0) {
        eventType = 'failed';
      }
    }

    if (eventType) {
      // Build event data for admin logs (error descriptions not exposed to client API)
      const eventData: Record<string, unknown> = {};

      // Add error message if present
      if (data.attributes.error_message) {
        eventData.error = data.attributes.error_message;
      }

      // Add error code and description for admin logs
      if (codeId !== null && codeId !== undefined) {
        const numericCode = typeof codeId === 'number' ? codeId : parseInt(String(codeId), 10);
        eventData.error_code = numericCode;
        if (!isNaN(numericCode) && DIDWW_ERROR_CODES[numericCode]) {
          eventData.error_description = DIDWW_ERROR_CODES[numericCode];
        }
      }

      // Add original status for debugging
      eventData.didww_status = data.attributes.status;

      // Calculate and store SMS cost if price and fragments are available
      const smsCost = SmsCost.fromDidww(data.attributes.price, data.attributes.fragments_sent);
      if (smsCost) {
        otpRepo.updateSmsCost(otpRequest.id, smsCost.toStorageUnits());
        logger.info('SMS cost recorded', {
          requestId: otpRequest.id,
          price: data.attributes.price,
          fragments: data.attributes.fragments_sent,
          costUsd: smsCost.toUsd(),
        });
      }

      emitOtpEvent(otpRequest.id, 'sms', eventType, Object.keys(eventData).length > 0 ? eventData : undefined);

      logger.info('SMS DLR event emitted', {
        requestId: otpRequest.id,
        messageId,
        eventType,
        oldStatus: otpRequest.status,
      });
    }

    res.status(200).json({
      status: 'received',
      message_id: messageId,
    });
  }
}
