/**
 * Webhook Controller
 *
 * HTTP handlers for webhook endpoints.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import type { DispatchService } from '../services/DispatchService.js';
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
 */
const dlrCallbackSchema = z.object({
  data: z.object({
    id: z.string(),
    type: z.literal('outbound_messages'),
    attributes: z.object({
      status: z.string(),
      error_code: z.string().optional(),
      error_message: z.string().optional(),
    }),
  }),
});

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
    const status = data.attributes.status;

    logger.info('DLR callback received', {
      messageId,
      status,
      errorCode: data.attributes.error_code,
      errorMessage: data.attributes.error_message,
    });

    // TODO: Update OTP request status based on DLR
    // This would require looking up the request by provider_id (messageId)

    res.status(200).json({
      status: 'received',
      message_id: messageId,
    });
  }
}
