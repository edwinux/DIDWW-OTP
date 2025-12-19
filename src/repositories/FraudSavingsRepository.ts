/**
 * Fraud Savings Repository
 *
 * Tracks estimated costs saved by blocking fraudulent requests.
 */

import { dbManager } from '../database/connection.js';

export interface FraudSaving {
  id: number;
  request_id: string;
  channel: string;
  estimated_cost_units: number;
  dst_prefix: string;
  fraud_score: number;
  fraud_reasons: string | null;
  created_at: number;
}

export class FraudSavingsRepository {
  /**
   * Record a fraud saving
   */
  record(
    requestId: string,
    channel: string,
    estimatedCostUnits: number,
    dstPrefix: string,
    fraudScore: number,
    fraudReasons: string[]
  ): void {
    const db = dbManager.getDb();
    db.prepare(
      `INSERT INTO fraud_savings (request_id, channel, estimated_cost_units, dst_prefix, fraud_score, fraud_reasons, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(requestId, channel, estimatedCostUnits, dstPrefix, fraudScore, JSON.stringify(fraudReasons), Date.now());
  }

  /**
   * Get total savings for a time period
   */
  getTotalSavings(fromDate?: number, toDate?: number): { totalUnits: number; requestCount: number } {
    const db = dbManager.getDb();
    let query = 'SELECT SUM(estimated_cost_units) as total, COUNT(*) as count FROM fraud_savings WHERE 1=1';
    const params: number[] = [];

    if (fromDate) {
      query += ' AND created_at >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      query += ' AND created_at <= ?';
      params.push(toDate);
    }

    const row = db.prepare(query).get(...params) as { total: number; count: number };
    return { totalUnits: row.total || 0, requestCount: row.count || 0 };
  }

  /**
   * Get recent savings
   */
  getRecent(limit = 50): FraudSaving[] {
    const db = dbManager.getDb();
    return db.prepare('SELECT * FROM fraud_savings ORDER BY created_at DESC LIMIT ?').all(limit) as FraudSaving[];
  }
}
