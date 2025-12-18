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
   * GET /admin/logs/hourly-traffic
   * Get traffic data with optional time range and granularity
   */
  async getHourlyTraffic(req: Request, res: Response): Promise<void> {
    try {
      const trafficQuerySchema = z.object({
        date_from: z.coerce.number().int().optional(),
        date_to: z.coerce.number().int().optional(),
        granularity: z.enum(['hourly', '6hourly', 'daily']).optional(),
      });

      const validation = trafficQuerySchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          error: 'validation_error',
          message: validation.error.issues.map((i) => `${i.path}: ${i.message}`).join(', '),
        });
        return;
      }

      const { date_from, date_to, granularity } = validation.data;

      // Use new getTrafficData if date params provided, otherwise fall back to legacy method
      if (date_from !== undefined || date_to !== undefined) {
        const now = Date.now();
        const from = date_from ?? now - 24 * 60 * 60 * 1000;
        const to = date_to ?? now;
        const data = this.otpRepo.getTrafficData(from, to, granularity ?? 'hourly');
        res.json({ data });
      } else {
        // Legacy: return 24h hourly data (backwards compatible)
        const data = this.otpRepo.getHourlyTraffic(24);
        res.json({ data });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch hourly traffic', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch hourly traffic',
      });
    }
  }

  /**
   * GET /admin/logs/stats
   * Get summary statistics with channel-specific breakdowns
   * Accepts optional date_from/date_to query params for time filtering
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const statsQuerySchema = z.object({
        date_from: z.coerce.number().int().optional(),
        date_to: z.coerce.number().int().optional(),
      });

      const validation = statsQuerySchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          error: 'validation_error',
          message: validation.error.issues.map((i) => `${i.path}: ${i.message}`).join(', '),
        });
        return;
      }

      const { date_from, date_to } = validation.data;
      const now = Date.now();

      // Build filter object for time range
      const timeFilter: { date_from?: number; date_to?: number } = {};
      if (date_from !== undefined) timeFilter.date_from = date_from;
      if (date_to !== undefined) timeFilter.date_to = date_to;

      // Get total count (within time range if specified)
      const total = this.otpRepo.countFiltered(timeFilter);

      // Get period count - if custom range, this equals total; otherwise show last24h
      const periodCount = date_from !== undefined
        ? total
        : this.otpRepo.countFiltered({ date_from: now - 24 * 60 * 60 * 1000 });

      // Get 24h trend (always based on last 24h comparison)
      const trend = this.otpRepo.get24hTrend();

      // Get status breakdown (with time filter)
      // Shadow-banned requests should be counted as "banned", not their simulated status
      const statuses = this.otpRepo.getDistinctValues('status');
      const byStatus: Record<string, number> = {};
      for (const status of statuses) {
        // Count only non-banned requests for each status
        byStatus[status] = this.otpRepo.countFiltered({ ...timeFilter, status, shadow_banned: false });
      }
      // Add banned count separately
      const bannedCount = this.otpRepo.countFiltered({ ...timeFilter, shadow_banned: true });
      if (bannedCount > 0) {
        byStatus['banned'] = bannedCount;
      }
      // Remove statuses with 0 count
      for (const status of Object.keys(byStatus)) {
        if (byStatus[status] === 0) {
          delete byStatus[status];
        }
      }

      // Get average fraud score (with time filter)
      let avgFraudScore: number | null = null;
      try {
        const requests = this.otpRepo.findAllPaginated(timeFilter, 1000, 0, 'created_at', 'desc');
        const scoresWithValues = requests.filter(r => r.fraud_score !== null && r.fraud_score !== undefined);
        if (scoresWithValues.length > 0) {
          const sum = scoresWithValues.reduce((acc, r) => acc + (r.fraud_score || 0), 0);
          avgFraudScore = sum / scoresWithValues.length;
        }
      } catch {
        // Ignore if fraud_score column doesn't exist
      }

      // Get voice channel stats (with time filter)
      const voiceRaw = this.otpRepo.getChannelStatsFiltered('voice', date_from, date_to);
      const voice = {
        total: voiceRaw.total,
        avgDuration: voiceRaw.avgDuration ? Math.round(voiceRaw.avgDuration * 10) / 10 : null,
        successRate: voiceRaw.total > 0 ? Math.round((voiceRaw.delivered / voiceRaw.total) * 100) : 0,
        authSuccessRate: voiceRaw.total > 0 ? Math.round((voiceRaw.verified / voiceRaw.total) * 100) : 0,
        avgCost: null, // Placeholder for future
      };

      // Get SMS channel stats (with time filter)
      const smsRaw = this.otpRepo.getChannelStatsFiltered('sms', date_from, date_to);
      const sms = {
        total: smsRaw.total,
        deliverySuccessRate: smsRaw.total > 0 ? Math.round((smsRaw.delivered / smsRaw.total) * 100) : 0,
        authSuccessRate: smsRaw.total > 0 ? Math.round((smsRaw.verified / smsRaw.total) * 100) : 0,
        avgCost: null, // Placeholder for future
      };

      // Get recent events - ALWAYS last 5, NOT filtered by time range
      const recentVerified = this.otpRepo.getRecentVerified(5);
      const recentFailed = this.otpRepo.getRecentFailed(5);
      const recentBanned = this.otpRepo.getRecentBanned(5);

      res.json({
        total,
        periodCount,
        trend,
        byStatus,
        avgFraudScore,
        voice,
        sms,
        recentVerified,
        recentFailed,
        recentBanned,
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
