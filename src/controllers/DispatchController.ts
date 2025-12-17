/**
 * Dispatch Controller
 *
 * HTTP handler for POST /dispatch endpoint.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import type { DispatchService } from '../services/DispatchService.js';
import { extractClientIp } from '../utils/ipv6.js';
import { logger } from '../utils/logger.js';

/**
 * Request body schema for /dispatch
 */
const dispatchSchema = z.object({
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{9,14}$/, 'Phone must be in E.164 format (e.g., +14155551234)'),
  code: z.string().regex(/^\d{4,8}$/, 'Code must be 4-8 numeric digits'),
  session_id: z.string().optional(),
  channels: z
    .array(z.enum(['sms', 'voice']))
    .min(1)
    .default(['sms', 'voice']),
  webhook_url: z.string().url().optional(),
  ip: z.string().ip().optional(),
});

/**
 * Dispatch Controller
 */
export class DispatchController {
  private dispatchService: DispatchService;

  constructor(dispatchService: DispatchService) {
    this.dispatchService = dispatchService;
  }

  /**
   * Handle POST /dispatch
   */
  async handle(req: Request, res: Response): Promise<void> {
    // Validate request body
    const validation = dispatchSchema.safeParse(req.body);

    if (!validation.success) {
      const errors = validation.error.issues.map((i) => i.message).join(', ');
      logger.warn('Invalid dispatch request', { errors });
      res.status(400).json({
        error: 'invalid_request',
        message: errors,
      });
      return;
    }

    const { phone, code, session_id, channels, webhook_url, ip: bodyIp } = validation.data;

    // Extract client IP - prefer explicit body IP over header/socket
    const headerIp = extractClientIp(
      req.headers as Record<string, string | string[] | undefined>,
      req.socket.remoteAddress
    );
    const clientIp = bodyIp || headerIp;

    // Normalize phone to E.164
    const e164Phone = phone.startsWith('+') ? phone : `+${phone}`;

    try {
      const result = await this.dispatchService.dispatch({
        phone: e164Phone,
        code,
        sessionId: session_id,
        channels: channels as ('sms' | 'voice')[],
        webhookUrl: webhook_url,
        ip: clientIp,
      });

      // Always return 200 OK (even for shadow-banned requests)
      res.status(200).json({
        status: result.status,
        request_id: result.requestId,
        channel: result.channel,
        phone: e164Phone,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Dispatch failed', { error: errorMessage });

      res.status(500).json({
        error: 'dispatch_failed',
        message: 'Failed to dispatch OTP',
      });
    }
  }
}
