/**
 * OTP Request Repository
 *
 * CRUD operations for OTP dispatch requests.
 */

import type Database from 'better-sqlite3';
import { getDb } from '../database/index.js';

/**
 * OTP request status values (combined/legacy status)
 */
export type OtpStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'verified'
  | 'rejected'
  | 'expired';

/**
 * Authentication verification status values
 * - null: Not verified yet (no auth feedback received)
 * - 'verified': User successfully entered correct OTP code
 * - 'wrong_code': User entered incorrect OTP code
 */
export type AuthStatus = null | 'verified' | 'wrong_code';

/**
 * OTP request record
 */
export interface OtpRequest {
  id: string;
  session_id: string | null;
  phone: string;
  phone_prefix: string | null;
  code_hash: string | null;
  status: OtpStatus;
  channel: string | null;
  channel_status: string | null;
  auth_status: AuthStatus;
  channels_requested: string | null;
  ip_address: string | null;
  ip_subnet: string | null;
  asn: number | null;
  country_code: string | null;
  phone_country: string | null;
  fraud_score: number;
  fraud_reasons: string | null;
  shadow_banned: number;
  webhook_url: string | null;
  provider_id: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
}

/**
 * Create OTP request input
 */
export interface CreateOtpRequestInput {
  id: string;
  session_id?: string;
  phone: string;
  phone_prefix?: string;
  code_hash?: string;
  channels_requested?: string[];
  ip_address?: string;
  ip_subnet?: string;
  asn?: number;
  country_code?: string;
  phone_country?: string;
  fraud_score?: number;
  fraud_reasons?: string[];
  shadow_banned?: boolean;
  webhook_url?: string;
  expires_at?: number;
}

/**
 * OTP Request Repository
 */
export class OtpRequestRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDb();
  }

  /**
   * Create a new OTP request
   */
  create(input: CreateOtpRequestInput): OtpRequest {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO otp_requests (
        id, session_id, phone, phone_prefix, code_hash, status,
        channels_requested, ip_address, ip_subnet, asn, country_code,
        phone_country, fraud_score, fraud_reasons, shadow_banned,
        webhook_url, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      input.id,
      input.session_id || null,
      input.phone,
      input.phone_prefix || null,
      input.code_hash || null,
      'pending',
      input.channels_requested ? JSON.stringify(input.channels_requested) : null,
      input.ip_address || null,
      input.ip_subnet || null,
      input.asn || null,
      input.country_code || null,
      input.phone_country || null,
      input.fraud_score || 0,
      input.fraud_reasons ? JSON.stringify(input.fraud_reasons) : null,
      input.shadow_banned ? 1 : 0,
      input.webhook_url || null,
      input.expires_at || null,
      now,
      now
    );

    return this.findById(input.id)!;
  }

  /**
   * Find OTP request by ID
   */
  findById(id: string): OtpRequest | null {
    const stmt = this.db.prepare('SELECT * FROM otp_requests WHERE id = ?');
    return (stmt.get(id) as OtpRequest) || null;
  }

  /**
   * Find OTP request by provider ID (message ID from DIDWW)
   * Uses case-insensitive matching since DIDWW may send different cases
   */
  findByProviderId(providerId: string): OtpRequest | null {
    const stmt = this.db.prepare('SELECT * FROM otp_requests WHERE LOWER(provider_id) = LOWER(?)');
    return (stmt.get(providerId) as OtpRequest) || null;
  }

  /**
   * Update OTP request status
   */
  updateStatus(
    id: string,
    status: OtpStatus,
    metadata?: { channel?: string; provider_id?: string; error_message?: string }
  ): void {
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const values: (string | number)[] = [status, Date.now()];

    if (metadata?.channel) {
      updates.push('channel = ?');
      values.push(metadata.channel);
    }
    if (metadata?.provider_id) {
      updates.push('provider_id = ?');
      values.push(metadata.provider_id);
    }
    if (metadata?.error_message) {
      updates.push('error_message = ?');
      values.push(metadata.error_message);
    }

    values.push(id);

    const stmt = this.db.prepare(`UPDATE otp_requests SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  /**
   * Update authentication status
   */
  updateAuthStatus(id: string, authStatus: 'verified' | 'wrong_code'): void {
    const stmt = this.db.prepare(`
      UPDATE otp_requests
      SET auth_status = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(authStatus, Date.now(), id);
  }

  /**
   * Find recent requests by phone number
   */
  findRecentByPhone(phone: string, windowMinutes: number): OtpRequest[] {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const stmt = this.db.prepare(`
      SELECT * FROM otp_requests
      WHERE phone = ? AND created_at > ?
      ORDER BY created_at DESC
    `);
    return stmt.all(phone, cutoff) as OtpRequest[];
  }

  /**
   * Find recent requests by IP subnet
   */
  findRecentByIpSubnet(ipSubnet: string, windowMinutes: number): OtpRequest[] {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const stmt = this.db.prepare(`
      SELECT * FROM otp_requests
      WHERE ip_subnet = ? AND created_at > ?
      ORDER BY created_at DESC
    `);
    return stmt.all(ipSubnet, cutoff) as OtpRequest[];
  }

  /**
   * Count requests by IP subnet in time window
   */
  countByIpSubnet(ipSubnet: string, windowMinutes: number): number {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM otp_requests
      WHERE ip_subnet = ? AND created_at > ?
    `);
    const result = stmt.get(ipSubnet, cutoff) as { count: number };
    return result.count;
  }

  /**
   * Count requests by phone in time window
   */
  countByPhone(phone: string, windowMinutes: number): number {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM otp_requests
      WHERE phone = ? AND created_at > ?
    `);
    const result = stmt.get(phone, cutoff) as { count: number };
    return result.count;
  }

  /**
   * Cleanup old records
   */
  cleanup(olderThanHours: number): number {
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    const stmt = this.db.prepare('DELETE FROM otp_requests WHERE created_at < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  }

  /**
   * Filter options for paginated queries
   */
  buildWhereClause(filters: {
    status?: string;
    channel?: string;
    phone?: string;
    ip_address?: string;
    country_code?: string;
    shadow_banned?: boolean;
    fraud_score_min?: number;
    fraud_score_max?: number;
    date_from?: number;
    date_to?: number;
  }): { where: string; params: (string | number)[] } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters.channel) {
      conditions.push('channel = ?');
      params.push(filters.channel);
    }
    if (filters.phone) {
      conditions.push('phone LIKE ?');
      params.push(`%${filters.phone}%`);
    }
    if (filters.ip_address) {
      conditions.push('(ip_address LIKE ? OR ip_subnet LIKE ?)');
      params.push(`%${filters.ip_address}%`, `%${filters.ip_address}%`);
    }
    if (filters.country_code) {
      conditions.push('country_code = ?');
      params.push(filters.country_code);
    }
    if (filters.shadow_banned !== undefined) {
      conditions.push('shadow_banned = ?');
      params.push(filters.shadow_banned ? 1 : 0);
    }
    if (filters.fraud_score_min !== undefined) {
      conditions.push('fraud_score >= ?');
      params.push(filters.fraud_score_min);
    }
    if (filters.fraud_score_max !== undefined) {
      conditions.push('fraud_score <= ?');
      params.push(filters.fraud_score_max);
    }
    if (filters.date_from !== undefined) {
      conditions.push('created_at >= ?');
      params.push(filters.date_from);
    }
    if (filters.date_to !== undefined) {
      conditions.push('created_at <= ?');
      params.push(filters.date_to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { where, params };
  }

  /**
   * Find all OTP requests with pagination and filters
   */
  findAllPaginated(
    filters: {
      status?: string;
      channel?: string;
      phone?: string;
      ip_address?: string;
      country_code?: string;
      shadow_banned?: boolean;
      fraud_score_min?: number;
      fraud_score_max?: number;
      date_from?: number;
      date_to?: number;
    },
    limit: number = 25,
    offset: number = 0,
    sortBy: string = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc'
  ): OtpRequest[] {
    const { where, params } = this.buildWhereClause(filters);

    // Whitelist valid sort columns to prevent SQL injection
    const validSortColumns = ['created_at', 'updated_at', 'status', 'phone', 'fraud_score', 'channel'];
    const safeSort = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const sql = `
      SELECT * FROM otp_requests
      ${where}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT ? OFFSET ?
    `;

    const stmt = this.db.prepare(sql);
    return stmt.all(...params, limit, offset) as OtpRequest[];
  }

  /**
   * Count OTP requests with filters
   */
  countFiltered(filters: {
    status?: string;
    channel?: string;
    phone?: string;
    ip_address?: string;
    country_code?: string;
    shadow_banned?: boolean;
    fraud_score_min?: number;
    fraud_score_max?: number;
    date_from?: number;
    date_to?: number;
  }): number {
    const { where, params } = this.buildWhereClause(filters);

    const sql = `SELECT COUNT(*) as count FROM otp_requests ${where}`;
    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * Get distinct values for a column (for filter dropdowns)
   */
  getDistinctValues(column: 'status' | 'channel' | 'country_code'): string[] {
    const validColumns = ['status', 'channel', 'country_code'];
    if (!validColumns.includes(column)) {
      return [];
    }

    const stmt = this.db.prepare(`SELECT DISTINCT ${column} FROM otp_requests WHERE ${column} IS NOT NULL`);
    const results = stmt.all() as Record<string, string>[];
    return results.map((r) => r[column]);
  }

  /**
   * Get hourly traffic data for the last N hours
   */
  getHourlyTraffic(hours: number = 24): { time: string; requests: number; verified: number; failed: number }[] {
    const now = Date.now();
    const cutoff = now - hours * 60 * 60 * 1000;

    // Get all requests in the time window
    const stmt = this.db.prepare(`
      SELECT created_at, status FROM otp_requests
      WHERE created_at >= ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(cutoff) as { created_at: number; status: string }[];

    // Group by hour
    const hourlyData = new Map<number, { requests: number; verified: number; failed: number }>();

    // Initialize all hours with zeros
    for (let i = hours - 1; i >= 0; i--) {
      const hourTimestamp = now - i * 60 * 60 * 1000;
      const hourKey = Math.floor(hourTimestamp / (60 * 60 * 1000));
      hourlyData.set(hourKey, { requests: 0, verified: 0, failed: 0 });
    }

    // Count requests per hour
    for (const row of rows) {
      const hourKey = Math.floor(row.created_at / (60 * 60 * 1000));
      const hourStats = hourlyData.get(hourKey);
      if (hourStats) {
        hourStats.requests++;
        if (row.status === 'verified') {
          hourStats.verified++;
        } else if (row.status === 'failed' || row.status === 'rejected') {
          hourStats.failed++;
        }
      }
    }

    // Convert to array with formatted time
    const result: { time: string; requests: number; verified: number; failed: number }[] = [];
    const sortedHours = Array.from(hourlyData.keys()).sort((a, b) => a - b);

    for (const hourKey of sortedHours) {
      const stats = hourlyData.get(hourKey)!;
      const date = new Date(hourKey * 60 * 60 * 1000);
      result.push({
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        requests: stats.requests,
        verified: stats.verified,
        failed: stats.failed,
      });
    }

    return result;
  }
}
