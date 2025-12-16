/**
 * OTP Request Repository
 *
 * CRUD operations for OTP dispatch requests.
 */

import type Database from 'better-sqlite3';
import { getDb } from '../database/index.js';

/**
 * OTP request status values
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
}
