/**
 * Fraud Rules Repository
 *
 * Manages ASN blocklist, circuit breakers, honeypot IPs, and IP reputation.
 */

import type Database from 'better-sqlite3';
import { getDb } from '../database/index.js';

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

/**
 * Circuit breaker record
 */
export interface CircuitBreaker {
  key: string;
  failures: number;
  successes: number;
  last_failure: number | null;
  last_success: number | null;
  state: CircuitBreakerState;
  opened_at: number | null;
  half_open_at: number | null;
}

/**
 * IP reputation record
 */
export interface IpReputation {
  ip_subnet: string;
  total_requests: number;
  verified_requests: number;
  failed_requests: number;
  trust_score: number;
  is_banned: number;
  ban_reason: string | null;
  first_seen: number;
  last_seen: number;
}

/**
 * ASN blocklist entry
 */
export interface AsnBlocklistEntry {
  asn: number;
  provider: string;
  category: string | null;
  reason: string | null;
  added_at: number;
}

/**
 * Fraud Rules Repository
 */
export class FraudRulesRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDb();
  }

  // ==================== ASN Blocklist ====================

  /**
   * Check if an ASN is blocked
   */
  isAsnBlocked(asn: number): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM asn_blocklist WHERE asn = ?');
    return stmt.get(asn) !== undefined;
  }

  /**
   * Get ASN blocklist entry
   */
  getAsnEntry(asn: number): AsnBlocklistEntry | null {
    const stmt = this.db.prepare('SELECT * FROM asn_blocklist WHERE asn = ?');
    return (stmt.get(asn) as AsnBlocklistEntry) || null;
  }

  /**
   * Add ASN to blocklist
   */
  addAsnToBlocklist(asn: number, provider: string, category?: string, reason?: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO asn_blocklist (asn, provider, category, reason, added_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(asn, provider, category || null, reason || null, Date.now());
  }

  /**
   * Remove ASN from blocklist
   */
  removeAsnFromBlocklist(asn: number): boolean {
    const stmt = this.db.prepare('DELETE FROM asn_blocklist WHERE asn = ?');
    const result = stmt.run(asn);
    return result.changes > 0;
  }

  // ==================== Circuit Breaker ====================

  /**
   * Get circuit breaker state for a key
   */
  getCircuitBreaker(key: string): CircuitBreaker | null {
    const stmt = this.db.prepare('SELECT * FROM circuit_breaker WHERE key = ?');
    return (stmt.get(key) as CircuitBreaker) || null;
  }

  /**
   * Increment failures for circuit breaker
   */
  incrementFailures(key: string): CircuitBreaker {
    const now = Date.now();
    const existing = this.getCircuitBreaker(key);

    if (!existing) {
      const stmt = this.db.prepare(`
        INSERT INTO circuit_breaker (key, failures, last_failure, state)
        VALUES (?, 1, ?, 'closed')
      `);
      stmt.run(key, now);
    } else {
      const stmt = this.db.prepare(`
        UPDATE circuit_breaker
        SET failures = failures + 1, last_failure = ?
        WHERE key = ?
      `);
      stmt.run(now, key);
    }

    return this.getCircuitBreaker(key)!;
  }

  /**
   * Record success for circuit breaker
   */
  recordSuccess(key: string): void {
    const now = Date.now();
    const existing = this.getCircuitBreaker(key);

    if (!existing) {
      const stmt = this.db.prepare(`
        INSERT INTO circuit_breaker (key, successes, last_success, state)
        VALUES (?, 1, ?, 'closed')
      `);
      stmt.run(key, now);
    } else {
      const stmt = this.db.prepare(`
        UPDATE circuit_breaker
        SET successes = successes + 1, last_success = ?
        WHERE key = ?
      `);
      stmt.run(now, key);
    }
  }

  /**
   * Open circuit breaker
   */
  openCircuitBreaker(key: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE circuit_breaker
      SET state = 'open', opened_at = ?
      WHERE key = ?
    `);
    stmt.run(now, key);
  }

  /**
   * Set circuit breaker to half-open
   */
  halfOpenCircuitBreaker(key: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      UPDATE circuit_breaker
      SET state = 'half_open', half_open_at = ?
      WHERE key = ?
    `);
    stmt.run(now, key);
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(key: string): void {
    const stmt = this.db.prepare(`
      UPDATE circuit_breaker
      SET failures = 0, state = 'closed', opened_at = NULL, half_open_at = NULL
      WHERE key = ?
    `);
    stmt.run(key);
  }

  // ==================== Honeypot IPs ====================

  /**
   * Check if IP subnet is in honeypot
   */
  isHoneypot(ipSubnet: string): boolean {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT 1 FROM honeypot_ips
      WHERE ip_subnet = ? AND (expires_at IS NULL OR expires_at > ?)
    `);
    return stmt.get(ipSubnet, now) !== undefined;
  }

  /**
   * Add IP subnet to honeypot
   */
  addToHoneypot(ipSubnet: string, reason: string, expiresInHours?: number): void {
    const now = Date.now();
    const expiresAt = expiresInHours ? now + expiresInHours * 60 * 60 * 1000 : null;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO honeypot_ips (ip_subnet, reason, detected_at, expires_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(ipSubnet, reason, now, expiresAt);
  }

  /**
   * Remove IP subnet from honeypot
   */
  removeFromHoneypot(ipSubnet: string): boolean {
    const stmt = this.db.prepare('DELETE FROM honeypot_ips WHERE ip_subnet = ?');
    const result = stmt.run(ipSubnet);
    return result.changes > 0;
  }

  // ==================== IP Reputation ====================

  /**
   * Get or create IP reputation
   */
  getOrCreateIpReputation(ipSubnet: string): IpReputation {
    let reputation = this.getIpReputation(ipSubnet);

    if (!reputation) {
      const now = Date.now();
      const stmt = this.db.prepare(`
        INSERT INTO ip_reputation (ip_subnet, first_seen, last_seen)
        VALUES (?, ?, ?)
      `);
      stmt.run(ipSubnet, now, now);
      reputation = this.getIpReputation(ipSubnet)!;
    }

    return reputation;
  }

  /**
   * Get IP reputation
   */
  getIpReputation(ipSubnet: string): IpReputation | null {
    const stmt = this.db.prepare('SELECT * FROM ip_reputation WHERE ip_subnet = ?');
    return (stmt.get(ipSubnet) as IpReputation) || null;
  }

  /**
   * Increment request count for IP
   */
  incrementIpRequests(ipSubnet: string): void {
    this.getOrCreateIpReputation(ipSubnet);
    const stmt = this.db.prepare(`
      UPDATE ip_reputation
      SET total_requests = total_requests + 1, last_seen = ?
      WHERE ip_subnet = ?
    `);
    stmt.run(Date.now(), ipSubnet);
  }

  /**
   * Record verified request for IP
   */
  recordVerifiedRequest(ipSubnet: string): void {
    this.getOrCreateIpReputation(ipSubnet);
    const stmt = this.db.prepare(`
      UPDATE ip_reputation
      SET verified_requests = verified_requests + 1,
          trust_score = CAST(verified_requests + 1 AS REAL) / CAST(total_requests AS REAL),
          last_seen = ?
      WHERE ip_subnet = ?
    `);
    stmt.run(Date.now(), ipSubnet);
  }

  /**
   * Record failed request for IP
   */
  recordFailedRequest(ipSubnet: string): void {
    this.getOrCreateIpReputation(ipSubnet);
    const stmt = this.db.prepare(`
      UPDATE ip_reputation
      SET failed_requests = failed_requests + 1,
          trust_score = CAST(verified_requests AS REAL) / CAST(total_requests AS REAL),
          last_seen = ?
      WHERE ip_subnet = ?
    `);
    stmt.run(Date.now(), ipSubnet);
  }

  /**
   * Ban an IP subnet
   */
  banIpSubnet(ipSubnet: string, reason: string): void {
    this.getOrCreateIpReputation(ipSubnet);
    const stmt = this.db.prepare(`
      UPDATE ip_reputation
      SET is_banned = 1, ban_reason = ?
      WHERE ip_subnet = ?
    `);
    stmt.run(reason, ipSubnet);
  }

  /**
   * Check if IP subnet is banned
   */
  isIpBanned(ipSubnet: string): boolean {
    const reputation = this.getIpReputation(ipSubnet);
    return reputation?.is_banned === 1;
  }

  // ==================== Auth Feedback ====================

  /**
   * Record auth feedback
   */
  recordAuthFeedback(requestId: string, success: boolean): void {
    const stmt = this.db.prepare(`
      INSERT INTO auth_feedback (request_id, success, feedback_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(requestId, success ? 1 : 0, Date.now());
  }

  /**
   * Get verification rate for phone prefix in time window
   */
  getPrefixVerificationRate(prefix: string, windowHours: number): { attempts: number; verified: number } {
    const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as attempts,
        SUM(CASE WHEN af.success = 1 THEN 1 ELSE 0 END) as verified
      FROM otp_requests r
      LEFT JOIN auth_feedback af ON r.id = af.request_id
      WHERE r.phone_prefix = ? AND r.created_at > ?
    `);
    const result = stmt.get(prefix, cutoff) as { attempts: number; verified: number | null };
    return {
      attempts: result.attempts,
      verified: result.verified || 0,
    };
  }
}
