/**
 * Admin Tester Controller
 *
 * Provides endpoints for testing OTP dispatch flow.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import type { DispatchService } from '../../services/DispatchService.js';
import { OtpRequestRepository } from '../../repositories/OtpRequestRepository.js';
import { WebhookLogRepository } from '../../repositories/WebhookLogRepository.js';
import { logger } from '../../utils/logger.js';

const sendOtpSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/, 'Phone must be in E.164 format'),
  code: z
    .string()
    .regex(/^\d{4,8}$/, 'Code must be 4-8 digits')
    .optional(),
  channel: z.enum(['sms', 'voice']).optional(),
});

export class TesterController {
  private dispatchService: DispatchService;
  private otpRepo: OtpRequestRepository;
  private webhookLogRepo: WebhookLogRepository;

  constructor(dispatchService: DispatchService) {
    this.dispatchService = dispatchService;
    this.otpRepo = new OtpRequestRepository();
    this.webhookLogRepo = new WebhookLogRepository();
  }

  /**
   * Generate a random OTP code
   */
  private generateCode(length: number = 6): string {
    const digits = '0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += digits[Math.floor(Math.random() * digits.length)];
    }
    return code;
  }

  /**
   * POST /admin/test/send-otp
   * Trigger a test OTP dispatch
   */
  async sendTestOtp(req: Request, res: Response): Promise<void> {
    try {
      const validation = sendOtpSchema.safeParse(req.body);

      if (!validation.success) {
        res.status(400).json({
          error: 'validation_error',
          message: validation.error.issues.map((i) => i.message).join(', '),
        });
        return;
      }

      const { phone, channel } = validation.data;
      const code = validation.data.code || this.generateCode();

      // Normalize phone to E.164
      const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;

      // Use a test IP that won't trigger fraud detection
      const testIp = '127.0.0.1';

      logger.info('Admin test OTP dispatch', {
        phone: normalizedPhone,
        channel,
        ip: req.ip,
        adminUser: req.session?.adminUsername,
      });

      // Dispatch through the service
      const result = await this.dispatchService.dispatch({
        phone: normalizedPhone,
        code,
        channels: channel ? [channel] : undefined,
        ip: testIp,
      });

      res.json({
        success: result.success,
        testId: result.requestId,
        phone: normalizedPhone,
        code, // Return the code for testing (wouldn't do this in production API)
        status: result.status,
        channel: result.channel,
        message: result.message,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Test OTP dispatch failed', { error: errorMessage });
      res.status(500).json({
        error: 'dispatch_failed',
        message: 'Failed to send test OTP',
      });
    }
  }

  /**
   * GET /admin/test/status/:testId
   * Get status of a test OTP
   */
  async getTestStatus(req: Request, res: Response): Promise<void> {
    try {
      const { testId } = req.params;

      const request = this.otpRepo.findById(testId);

      if (!request) {
        res.status(404).json({
          error: 'not_found',
          message: 'Test request not found',
        });
        return;
      }

      // Get webhook logs for this request
      const webhookLogs = this.webhookLogRepo.findByRequestId(testId);

      res.json({
        testId,
        phone: request.phone,
        status: request.status,
        channel: request.channel,
        fraudScore: request.fraud_score,
        shadowBanned: request.shadow_banned === 1,
        timestamps: {
          created: request.created_at,
          updated: request.updated_at,
          expires: request.expires_at,
        },
        providerId: request.provider_id,
        errorMessage: request.error_message,
        webhookLogs: webhookLogs.map((log) => ({
          attempt: log.attempt,
          statusCode: log.status_code,
          sentAt: log.sent_at,
          error: log.error_message,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch test status', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch test status',
      });
    }
  }

  /**
   * GET /admin/test/history
   * Get recent test OTP history
   */
  async getTestHistory(req: Request, res: Response): Promise<void> {
    try {
      const limitParam = req.query.limit;
      const limit = typeof limitParam === 'string' ? Math.min(parseInt(limitParam, 10) || 10, 50) : 10;

      // Get recent requests (from localhost/test IPs)
      const requests = this.otpRepo.findAllPaginated(
        { ip_address: '127.0.0.1' },
        limit,
        0,
        'created_at',
        'desc'
      );

      res.json({
        tests: requests.map((r) => ({
          id: r.id,
          phone: r.phone,
          status: r.status,
          channel: r.channel,
          fraudScore: r.fraud_score,
          createdAt: r.created_at,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch test history', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch test history',
      });
    }
  }
}
