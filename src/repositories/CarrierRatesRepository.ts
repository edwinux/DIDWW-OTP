/**
 * Carrier Rates Repository
 *
 * Stores learned rates per prefix/channel from CDRs and DLRs.
 * Uses exponential moving average for rate updates.
 */

import { dbManager } from '../database/connection.js';

/**
 * Carrier rate record
 */
export interface CarrierRate {
  id: number;
  channel: 'sms' | 'voice';
  dst_prefix: string;
  src_prefix: string | null;
  rate_avg: number; // In 1/10000 dollars
  rate_min: number;
  rate_max: number;
  billing_increment: number;
  sample_count: number;
  confidence_score: number;
  last_seen_at: number;
  created_at: number;
  updated_at: number;
}

/**
 * Input for upserting a rate
 */
export interface UpsertRateInput {
  channel: 'sms' | 'voice';
  dstPrefix: string;
  srcPrefix?: string | null;
  rateUnits: number; // In 1/10000 dollars
  billingIncrement?: number;
}

/**
 * Carrier Rates Repository
 */
export class CarrierRatesRepository {
  private readonly EMA_ALPHA = 0.2; // Weight for new observations

  /**
   * Find rate by exact match
   */
  findRate(channel: 'sms' | 'voice', dstPrefix: string, srcPrefix?: string | null): CarrierRate | null {
    const db = dbManager.getDb();

    const srcCondition = srcPrefix ? 'src_prefix = ?' : 'src_prefix IS NULL';
    const params = srcPrefix ? [channel, dstPrefix, srcPrefix] : [channel, dstPrefix];

    const row = db
      .prepare(`SELECT * FROM carrier_rates WHERE channel = ? AND dst_prefix = ? AND ${srcCondition}`)
      .get(...params) as CarrierRate | undefined;

    return row || null;
  }

  /**
   * Find best matching rate using prefix hierarchy (longest match first)
   */
  findBestMatchingRate(
    channel: 'sms' | 'voice',
    dstNumber: string,
    srcPrefix?: string | null
  ): CarrierRate | null {
    // Generate prefix hierarchy (6 digits down to 1)
    const digits = dstNumber.replace(/\D/g, '');
    const prefixes: string[] = [];
    for (let len = Math.min(6, digits.length); len >= 1; len--) {
      prefixes.push(digits.slice(0, len));
    }

    // Try each prefix with src_prefix match first, then without
    for (const prefix of prefixes) {
      // Try with source prefix
      if (srcPrefix) {
        const withSrc = this.findRate(channel, prefix, srcPrefix);
        if (withSrc) return withSrc;
      }

      // Try without source prefix
      const withoutSrc = this.findRate(channel, prefix, null);
      if (withoutSrc) return withoutSrc;
    }

    return null;
  }

  /**
   * Upsert rate with EMA calculation
   */
  upsertRate(input: UpsertRateInput): void {
    const db = dbManager.getDb();
    const now = Date.now();

    const existing = this.findRate(input.channel, input.dstPrefix, input.srcPrefix);

    if (existing) {
      // Update with EMA
      const newAvg = Math.round(this.EMA_ALPHA * input.rateUnits + (1 - this.EMA_ALPHA) * existing.rate_avg);
      const newMin = Math.min(existing.rate_min, input.rateUnits);
      const newMax = Math.max(existing.rate_max, input.rateUnits);
      const newCount = existing.sample_count + 1;
      const newConfidence = Math.min(1.0, newCount / 100);

      db.prepare(
        `UPDATE carrier_rates
         SET rate_avg = ?, rate_min = ?, rate_max = ?,
             sample_count = ?, confidence_score = ?,
             billing_increment = COALESCE(?, billing_increment),
             last_seen_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        newAvg,
        newMin,
        newMax,
        newCount,
        newConfidence,
        input.billingIncrement ?? null,
        now,
        now,
        existing.id
      );
    } else {
      // Insert new
      db.prepare(
        `INSERT INTO carrier_rates (
           channel, dst_prefix, src_prefix,
           rate_avg, rate_min, rate_max,
           billing_increment, sample_count, confidence_score,
           last_seen_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0.01, ?, ?, ?)`
      ).run(
        input.channel,
        input.dstPrefix,
        input.srcPrefix ?? null,
        input.rateUnits,
        input.rateUnits,
        input.rateUnits,
        input.billingIncrement ?? 1,
        now,
        now,
        now
      );
    }
  }

  /**
   * Get all rates with optional filtering
   */
  findAll(filters?: { channel?: string; prefix?: string }, limit = 100, offset = 0): CarrierRate[] {
    const db = dbManager.getDb();
    let query = 'SELECT * FROM carrier_rates WHERE 1=1';
    const params: (string | number)[] = [];

    if (filters?.channel) {
      query += ' AND channel = ?';
      params.push(filters.channel);
    }
    if (filters?.prefix) {
      query += ' AND dst_prefix LIKE ?';
      params.push(`${filters.prefix}%`);
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(query).all(...params) as CarrierRate[];
  }

  /**
   * Get rate statistics
   */
  getStats(): { total: number; sms: number; voice: number; avgConfidence: number } {
    const db = dbManager.getDb();
    const row = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN channel = 'sms' THEN 1 ELSE 0 END) as sms,
           SUM(CASE WHEN channel = 'voice' THEN 1 ELSE 0 END) as voice,
           AVG(confidence_score) as avgConfidence
         FROM carrier_rates`
      )
      .get() as { total: number; sms: number; voice: number; avgConfidence: number };

    return {
      total: row.total || 0,
      sms: row.sms || 0,
      voice: row.voice || 0,
      avgConfidence: row.avgConfidence || 0,
    };
  }
}
