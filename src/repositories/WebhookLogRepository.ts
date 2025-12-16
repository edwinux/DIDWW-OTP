/**
 * Webhook Log Repository
 *
 * Tracks webhook delivery attempts and status.
 */

import type Database from 'better-sqlite3';
import { getDb } from '../database/index.js';

/**
 * Webhook log record
 */
export interface WebhookLog {
  id: number;
  request_id: string;
  webhook_url: string;
  status_code: number | null;
  attempt: number;
  error_message: string | null;
  sent_at: number;
}

/**
 * Webhook Log Repository
 */
export class WebhookLogRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDb();
  }

  /**
   * Log a webhook delivery attempt
   */
  logAttempt(
    requestId: string,
    webhookUrl: string,
    statusCode: number | null,
    attempt: number,
    errorMessage?: string
  ): WebhookLog {
    const stmt = this.db.prepare(`
      INSERT INTO webhook_logs (request_id, webhook_url, status_code, attempt, error_message, sent_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(requestId, webhookUrl, statusCode, attempt, errorMessage || null, Date.now());

    return this.findById(result.lastInsertRowid as number)!;
  }

  /**
   * Find webhook log by ID
   */
  findById(id: number): WebhookLog | null {
    const stmt = this.db.prepare('SELECT * FROM webhook_logs WHERE id = ?');
    return (stmt.get(id) as WebhookLog) || null;
  }

  /**
   * Find all logs for a request
   */
  findByRequestId(requestId: string): WebhookLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM webhook_logs
      WHERE request_id = ?
      ORDER BY sent_at ASC
    `);
    return stmt.all(requestId) as WebhookLog[];
  }

  /**
   * Get last attempt number for a request
   */
  getLastAttempt(requestId: string): number {
    const stmt = this.db.prepare(`
      SELECT MAX(attempt) as last_attempt
      FROM webhook_logs
      WHERE request_id = ?
    `);
    const result = stmt.get(requestId) as { last_attempt: number | null };
    return result.last_attempt || 0;
  }

  /**
   * Check if webhook was successfully delivered
   */
  wasDelivered(requestId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM webhook_logs
      WHERE request_id = ? AND status_code >= 200 AND status_code < 300
      LIMIT 1
    `);
    return stmt.get(requestId) !== undefined;
  }

  /**
   * Cleanup old logs
   */
  cleanup(olderThanHours: number): number {
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    const stmt = this.db.prepare('DELETE FROM webhook_logs WHERE sent_at < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  }
}
