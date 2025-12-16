/**
 * Admin Logs Controller
 *
 * Provides paginated access to OTP request logs with filtering.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { OtpRequestRepository } from '../../repositories/OtpRequestRepository.js';
import { WebhookLogRepository } from '../../repositories/WebhookLogRepository.js';
import { logger } from '../../utils/logger.js';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(25).max(500).default(25),
  status: z.string().optional(),
  channel: z.string().optional(),
  phone: z.string().optional(),
  ip_address: z.string().optional(),
  country_code: z.string().optional(),
  shadow_banned: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  fraud_score_min: z.coerce.number().int().min(0).max(100).optional(),
  fraud_score_max: z.coerce.number().int().min(0).max(100).optional(),
  date_from: z.coerce.number().int().optional(),
  date_to: z.coerce.number().int().optional(),
  sort_by: z.string().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export class LogsController {
  private otpRepo: OtpRequestRepository;
  private webhookLogRepo: WebhookLogRepository;

  constructor() {
    this.otpRepo = new OtpRequestRepository();
    this.webhookLogRepo = new WebhookLogRepository();
  }

  /**
   * GET /admin/logs/otp-requests
   * Get paginated OTP request logs with filters
   */
  async getOtpRequests(req: Request, res: Response): Promise<void> {
    try {
      const validation = querySchema.safeParse(req.query);

      if (!validation.success) {
        res.status(400).json({
          error: 'validation_error',
          message: validation.error.issues.map((i) => `${i.path}: ${i.message}`).join(', '),
        });
        return;
      }

      const { page, limit, sort_by, sort_order, ...filters } = validation.data;
      const offset = (page - 1) * limit;

      const data = this.otpRepo.findAllPaginated(filters, limit, offset, sort_by, sort_order);
      const total = this.otpRepo.countFiltered(filters);
      const totalPages = Math.ceil(total / limit);

      res.json({
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch OTP requests', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch logs',
      });
    }
  }

  /**
   * GET /admin/logs/otp-requests/:id
   * Get single OTP request with related data
   */
  async getOtpRequestById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const request = this.otpRepo.findById(id);

      if (!request) {
        res.status(404).json({
          error: 'not_found',
          message: 'OTP request not found',
        });
        return;
      }

      // Get related webhook logs
      const webhookLogs = this.webhookLogRepo.findByRequestId(id);

      res.json({
        request,
        webhookLogs,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch OTP request', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch log details',
      });
    }
  }

  /**
   * GET /admin/logs/webhook-logs
   * Get paginated webhook logs
   */
  async getWebhookLogs(req: Request, res: Response): Promise<void> {
    try {
      const validation = z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(25).max(500).default(25),
          request_id: z.string().optional(),
        })
        .safeParse(req.query);

      if (!validation.success) {
        res.status(400).json({
          error: 'validation_error',
          message: validation.error.issues.map((i) => `${i.path}: ${i.message}`).join(', '),
        });
        return;
      }

      const { page, limit, request_id } = validation.data;
      const offset = (page - 1) * limit;

      let data;
      let total;

      if (request_id) {
        data = this.webhookLogRepo.findByRequestId(request_id);
        total = data.length;
      } else {
        data = this.webhookLogRepo.findAllPaginated(limit, offset);
        total = this.webhookLogRepo.countAll();
      }

      const totalPages = Math.ceil(total / limit);

      res.json({
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch webhook logs', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch webhook logs',
      });
    }
  }

  /**
   * GET /admin/logs/filters
   * Get available filter values for dropdowns
   */
  async getFilterOptions(_req: Request, res: Response): Promise<void> {
    try {
      const statuses = this.otpRepo.getDistinctValues('status');
      const channels = this.otpRepo.getDistinctValues('channel');
      const countries = this.otpRepo.getDistinctValues('country_code');

      res.json({
        statuses,
        channels,
        countries,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch filter options', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch filter options',
      });
    }
  }

  /**
   * GET /admin/logs/stats
   * Get summary statistics
   */
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      // Get total count
      const total = this.otpRepo.countFiltered({});

      // Get last 24h count
      const last24h = this.otpRepo.countFiltered({ date_from: oneDayAgo });

      // Get status breakdown
      const statuses = this.otpRepo.getDistinctValues('status');
      const byStatus: Record<string, number> = {};
      for (const status of statuses) {
        byStatus[status] = this.otpRepo.countFiltered({ status });
      }

      // Get average fraud score (if available)
      let avgFraudScore: number | null = null;
      try {
        const allRequests = this.otpRepo.findAllPaginated({}, 1000, 0, 'created_at', 'desc');
        const scoresWithValues = allRequests.filter(r => r.fraud_score !== null && r.fraud_score !== undefined);
        if (scoresWithValues.length > 0) {
          const sum = scoresWithValues.reduce((acc, r) => acc + (r.fraud_score || 0), 0);
          avgFraudScore = sum / scoresWithValues.length;
        }
      } catch {
        // Ignore if fraud_score column doesn't exist
      }

      res.json({
        total,
        last24h,
        byStatus,
        avgFraudScore,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch stats', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch statistics',
      });
    }
  }
}
