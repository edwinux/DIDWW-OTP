/**
 * CDR Repository
 *
 * Data access layer for Call Detail Records from DIDWW CDR streaming.
 * Stores all CDRs for audit trail and provides queries for rate learning.
 */

import { dbManager } from '../database/connection.js';
import { getPhoneNumberService } from '../services/PhoneNumberService.js';
import { logger } from '../utils/logger.js';

/**
 * CDR record as stored in database
 */
export interface CdrRecord {
  id: string;
  call_id: string;
  trunk_id: string;
  time_start: number;
  time_connect: number | null;
  time_end: number;
  duration: number;
  billing_duration: number;
  initial_billing_interval: number | null;
  next_billing_interval: number | null;
  rate: number;
  price: number;
  success: number;
  disconnect_code: number | null;
  disconnect_reason: string | null;
  source_ip: string | null;
  trunk_name: string | null;
  pop: string | null;
  src_number: string;
  dst_number: string;
  dst_prefix: string;
  src_prefix: string | null;
  call_type: string | null;
  ingested_at: number;
  processed_for_rates: number;
}

/**
 * Input for creating a CDR record
 */
export interface CreateCdrInput {
  id: string;
  call_id: string;
  trunk_id: string;
  time_start: number;
  time_connect?: number;
  time_end: number;
  duration: number;
  billing_duration: number;
  initial_billing_interval?: number;
  next_billing_interval?: number;
  rate: number;
  price: number;
  success: boolean;
  disconnect_code?: number;
  disconnect_reason?: string;
  source_ip?: string;
  trunk_name?: string;
  pop?: string;
  src_number: string;
  dst_number: string;
  call_type?: string;
}

/**
 * CDR Repository
 */
export class CdrRepository {
  private phoneService = getPhoneNumberService();

  /**
   * Create a single CDR record
   */
  create(input: CreateCdrInput): void {
    const db = dbManager.getDb();
    const now = Date.now();

    // Extract prefixes for rate learning
    const dstPrefix = this.phoneService.extractPrefix(input.dst_number, 4) || input.dst_number.slice(0, 4);
    const srcPrefix = input.src_number ? this.phoneService.extractPrefix(input.src_number, 4) : null;

    const stmt = db.prepare(`
      INSERT INTO cdr_records (
        id, call_id, trunk_id,
        time_start, time_connect, time_end,
        duration, billing_duration,
        initial_billing_interval, next_billing_interval,
        rate, price,
        success, disconnect_code, disconnect_reason,
        source_ip, trunk_name, pop,
        src_number, dst_number, dst_prefix, src_prefix, call_type,
        ingested_at, processed_for_rates
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, 0
      )
    `);

    stmt.run(
      input.id,
      input.call_id,
      input.trunk_id,
      input.time_start,
      input.time_connect ?? null,
      input.time_end,
      input.duration,
      input.billing_duration,
      input.initial_billing_interval ?? null,
      input.next_billing_interval ?? null,
      input.rate,
      input.price,
      input.success ? 1 : 0,
      input.disconnect_code ?? null,
      input.disconnect_reason ?? null,
      input.source_ip ?? null,
      input.trunk_name ?? null,
      input.pop ?? null,
      input.src_number,
      input.dst_number,
      dstPrefix,
      srcPrefix,
      input.call_type ?? null,
      now
    );
  }

  /**
   * Bulk create CDR records (more efficient for batches)
   */
  bulkCreate(inputs: CreateCdrInput[]): number {
    if (inputs.length === 0) return 0;

    const db = dbManager.getDb();
    const now = Date.now();

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO cdr_records (
        id, call_id, trunk_id,
        time_start, time_connect, time_end,
        duration, billing_duration,
        initial_billing_interval, next_billing_interval,
        rate, price,
        success, disconnect_code, disconnect_reason,
        source_ip, trunk_name, pop,
        src_number, dst_number, dst_prefix, src_prefix, call_type,
        ingested_at, processed_for_rates
      ) VALUES (
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, 0
      )
    `);

    let inserted = 0;

    const insertMany = db.transaction((records: CreateCdrInput[]) => {
      for (const input of records) {
        // Extract prefixes for rate learning
        const dstPrefix = this.phoneService.extractPrefix(input.dst_number, 4) || input.dst_number.slice(0, 4);
        const srcPrefix = input.src_number ? this.phoneService.extractPrefix(input.src_number, 4) : null;

        const result = stmt.run(
          input.id,
          input.call_id,
          input.trunk_id,
          input.time_start,
          input.time_connect ?? null,
          input.time_end,
          input.duration,
          input.billing_duration,
          input.initial_billing_interval ?? null,
          input.next_billing_interval ?? null,
          input.rate,
          input.price,
          input.success ? 1 : 0,
          input.disconnect_code ?? null,
          input.disconnect_reason ?? null,
          input.source_ip ?? null,
          input.trunk_name ?? null,
          input.pop ?? null,
          input.src_number,
          input.dst_number,
          dstPrefix,
          srcPrefix,
          input.call_type ?? null,
          now
        );

        if (result.changes > 0) {
          inserted++;
        }
      }
    });

    insertMany(inputs);
    return inserted;
  }

  /**
   * Find CDR by ID
   */
  findById(id: string): CdrRecord | null {
    const db = dbManager.getDb();
    const row = db.prepare('SELECT * FROM cdr_records WHERE id = ?').get(id) as CdrRecord | undefined;
    return row || null;
  }

  /**
   * Find unprocessed CDRs for rate learning
   */
  findUnprocessedForRates(limit: number = 1000): CdrRecord[] {
    const db = dbManager.getDb();
    return db
      .prepare(
        `SELECT * FROM cdr_records
         WHERE processed_for_rates = 0
         ORDER BY time_start ASC
         LIMIT ?`
      )
      .all(limit) as CdrRecord[];
  }

  /**
   * Mark CDRs as processed for rate learning
   */
  markAsProcessed(ids: string[]): void {
    if (ids.length === 0) return;

    const db = dbManager.getDb();
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE cdr_records SET processed_for_rates = 1 WHERE id IN (${placeholders})`).run(...ids);
  }

  /**
   * Find CDRs by trunk and date range
   */
  findByTrunkAndDateRange(
    trunkId: string,
    fromDate: number,
    toDate: number,
    limit: number = 1000
  ): CdrRecord[] {
    const db = dbManager.getDb();
    return db
      .prepare(
        `SELECT * FROM cdr_records
         WHERE trunk_id = ? AND time_start >= ? AND time_start <= ?
         ORDER BY time_start DESC
         LIMIT ?`
      )
      .all(trunkId, fromDate, toDate, limit) as CdrRecord[];
  }

  /**
   * Count CDRs by trunk
   */
  countByTrunk(trunkId: string, fromDate?: number): number {
    const db = dbManager.getDb();

    if (fromDate) {
      const row = db
        .prepare('SELECT COUNT(*) as count FROM cdr_records WHERE trunk_id = ? AND time_start >= ?')
        .get(trunkId, fromDate) as { count: number };
      return row.count;
    }

    const row = db.prepare('SELECT COUNT(*) as count FROM cdr_records WHERE trunk_id = ?').get(trunkId) as {
      count: number;
    };
    return row.count;
  }

  /**
   * Get statistics for a trunk
   */
  getStats(trunkId: string, fromDate?: number): {
    totalCalls: number;
    successfulCalls: number;
    totalDuration: number;
    totalCost: number;
    avgRate: number;
  } {
    const db = dbManager.getDb();

    let query = `
      SELECT
        COUNT(*) as totalCalls,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successfulCalls,
        SUM(duration) as totalDuration,
        SUM(price) as totalCost,
        AVG(rate) as avgRate
      FROM cdr_records
      WHERE trunk_id = ?
    `;

    const params: (string | number)[] = [trunkId];

    if (fromDate) {
      query += ' AND time_start >= ?';
      params.push(fromDate);
    }

    const row = db.prepare(query).get(...params) as {
      totalCalls: number;
      successfulCalls: number;
      totalDuration: number;
      totalCost: number;
      avgRate: number;
    };

    return {
      totalCalls: row.totalCalls || 0,
      successfulCalls: row.successfulCalls || 0,
      totalDuration: row.totalDuration || 0,
      totalCost: row.totalCost || 0,
      avgRate: row.avgRate || 0,
    };
  }

  /**
   * Cleanup old CDR records
   */
  cleanup(olderThanDays: number): number {
    const db = dbManager.getDb();
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const result = db.prepare('DELETE FROM cdr_records WHERE ingested_at < ?').run(cutoff);
    logger.info('Cleaned up old CDR records', { deleted: result.changes, olderThanDays });
    return result.changes;
  }
}
