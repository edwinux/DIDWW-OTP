/**
 * Billing Controller
 *
 * Admin API endpoints for carrier rates and fraud savings.
 */

import type { Request, Response } from 'express';
import { CarrierRatesRepository } from '../../repositories/CarrierRatesRepository.js';
import { FraudSavingsRepository } from '../../repositories/FraudSavingsRepository.js';
import { CdrRepository } from '../../repositories/CdrRepository.js';

/**
 * Billing Controller
 */
export class BillingController {
  private ratesRepo: CarrierRatesRepository;
  private savingsRepo: FraudSavingsRepository;
  private cdrRepo: CdrRepository;

  constructor() {
    this.ratesRepo = new CarrierRatesRepository();
    this.savingsRepo = new FraudSavingsRepository();
    this.cdrRepo = new CdrRepository();
  }

  /**
   * GET /admin/billing/rates
   * List carrier rates with optional filtering
   */
  getRates(req: Request, res: Response): void {
    try {
      const { channel, prefix, limit = '100', offset = '0' } = req.query;

      const rates = this.ratesRepo.findAll(
        {
          channel: channel as string | undefined,
          prefix: prefix as string | undefined,
        },
        parseInt(limit as string, 10),
        parseInt(offset as string, 10)
      );

      // Format rates for display
      const formattedRates = rates.map((rate) => ({
        id: rate.id,
        channel: rate.channel,
        dst_prefix: rate.dst_prefix,
        src_prefix: rate.src_prefix,
        rate_avg_usd: (rate.rate_avg / 10000).toFixed(4),
        rate_min_usd: (rate.rate_min / 10000).toFixed(4),
        rate_max_usd: (rate.rate_max / 10000).toFixed(4),
        billing_increment: rate.billing_increment,
        sample_count: rate.sample_count,
        confidence: (rate.confidence_score * 100).toFixed(1) + '%',
        last_seen: new Date(rate.last_seen_at).toISOString(),
        updated_at: new Date(rate.updated_at).toISOString(),
      }));

      res.json({
        rates: formattedRates,
        count: formattedRates.length,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch rates',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * GET /admin/billing/rates/stats
   * Get rate statistics
   */
  getRateStats(_req: Request, res: Response): void {
    try {
      const stats = this.ratesRepo.getStats();

      res.json({
        total_rates: stats.total,
        sms_rates: stats.sms,
        voice_rates: stats.voice,
        avg_confidence: (stats.avgConfidence * 100).toFixed(1) + '%',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch rate stats',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * GET /admin/billing/savings
   * Get fraud savings summary
   */
  getSavings(req: Request, res: Response): void {
    try {
      const { from, to } = req.query;

      const fromDate = from ? parseInt(from as string, 10) : undefined;
      const toDate = to ? parseInt(to as string, 10) : undefined;

      const savings = this.savingsRepo.getTotalSavings(fromDate, toDate);

      res.json({
        total_savings_usd: (savings.totalUnits / 10000).toFixed(2),
        total_savings_units: savings.totalUnits,
        blocked_requests: savings.requestCount,
        avg_savings_per_block_usd:
          savings.requestCount > 0
            ? (savings.totalUnits / savings.requestCount / 10000).toFixed(4)
            : '0.0000',
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch savings',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * GET /admin/billing/savings/recent
   * Get recent fraud savings records
   */
  getRecentSavings(req: Request, res: Response): void {
    try {
      const limit = parseInt((req.query.limit as string) || '50', 10);
      const recentSavings = this.savingsRepo.getRecent(limit);

      const formatted = recentSavings.map((saving) => ({
        id: saving.id,
        request_id: saving.request_id,
        channel: saving.channel,
        estimated_cost_usd: (saving.estimated_cost_units / 10000).toFixed(4),
        dst_prefix: saving.dst_prefix,
        fraud_score: saving.fraud_score,
        fraud_reasons: saving.fraud_reasons ? JSON.parse(saving.fraud_reasons) : [],
        created_at: new Date(saving.created_at).toISOString(),
      }));

      res.json({
        savings: formatted,
        count: formatted.length,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch recent savings',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * GET /admin/billing/cdrs
   * Get CDR records (for debugging/audit)
   */
  getCdrs(req: Request, res: Response): void {
    try {
      const limit = parseInt((req.query.limit as string) || '50', 10);
      const recentCdrs = this.cdrRepo.findRecent(limit);

      const formatted = recentCdrs.map((cdr) => ({
        id: cdr.id,
        call_id: cdr.call_id,
        trunk_id: cdr.trunk_id,
        time_start: new Date(cdr.time_start).toISOString(),
        duration_seconds: cdr.duration,
        billing_duration: cdr.billing_duration,
        dst_number: cdr.dst_number,
        src_number: cdr.src_number,
        dst_prefix: cdr.dst_prefix,
        src_prefix: cdr.src_prefix,
        rate: cdr.rate,
        price_usd: cdr.price.toFixed(6),
        processed: cdr.processed_for_rates === 1,
      }));

      res.json({
        cdrs: formatted,
        count: formatted.length,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch CDRs',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
