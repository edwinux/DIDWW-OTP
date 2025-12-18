/**
 * Whitelist Repository
 *
 * Manages fraud whitelist entries for IPs and phone numbers.
 * Whitelisted entries bypass all fraud detection with score=0.
 */

import type Database from 'better-sqlite3';
import { getDb } from '../database/index.js';

/**
 * Whitelist entry types
 */
export type WhitelistType = 'ip' | 'phone';

/**
 * Whitelist entry record
 */
export interface WhitelistEntry {
  id: number;
  type: WhitelistType;
  value: string;
  description: string | null;
  created_at: number;
}

/**
 * Input for creating a whitelist entry
 */
export interface CreateWhitelistInput {
  type: WhitelistType;
  value: string;
  description?: string;
}

/**
 * Validate IPv4 address format
 */
export function validateIp(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = ip.match(ipv4Regex);
  if (!match) return false;

  // Check each octet is 0-255
  for (let i = 1; i <= 4; i++) {
    const octet = parseInt(match[i], 10);
    if (octet < 0 || octet > 255) return false;
  }
  return true;
}

/**
 * Validate E.164 phone number format
 */
export function validatePhone(phone: string): boolean {
  // E.164: optional +, 7-15 digits
  const e164Regex = /^\+?\d{7,15}$/;
  return e164Regex.test(phone);
}

/**
 * Normalize phone number (remove + prefix, trim)
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/^\+/, '').trim();
}

/**
 * Normalize IP address (trim whitespace)
 */
export function normalizeIp(ip: string): string {
  return ip.trim();
}

/**
 * Whitelist Repository
 */
export class WhitelistRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDb();
  }

  /**
   * Check if a value is whitelisted
   */
  isWhitelisted(type: WhitelistType, value: string): boolean {
    const normalizedValue = type === 'phone' ? normalizePhone(value) : normalizeIp(value);
    const stmt = this.db.prepare(
      'SELECT 1 FROM fraud_whitelist WHERE type = ? AND value = ?'
    );
    return stmt.get(type, normalizedValue) !== undefined;
  }

  /**
   * Get all whitelist entries
   */
  findAll(): WhitelistEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM fraud_whitelist ORDER BY created_at DESC'
    );
    return stmt.all() as WhitelistEntry[];
  }

  /**
   * Get whitelist entries by type
   */
  findByType(type: WhitelistType): WhitelistEntry[] {
    const stmt = this.db.prepare(
      'SELECT * FROM fraud_whitelist WHERE type = ? ORDER BY created_at DESC'
    );
    return stmt.all(type) as WhitelistEntry[];
  }

  /**
   * Get a whitelist entry by ID
   */
  findById(id: number): WhitelistEntry | null {
    const stmt = this.db.prepare('SELECT * FROM fraud_whitelist WHERE id = ?');
    return (stmt.get(id) as WhitelistEntry) || null;
  }

  /**
   * Check if an entry exists (for duplicate prevention)
   */
  exists(type: WhitelistType, value: string): boolean {
    const normalizedValue = type === 'phone' ? normalizePhone(value) : normalizeIp(value);
    const stmt = this.db.prepare(
      'SELECT 1 FROM fraud_whitelist WHERE type = ? AND value = ?'
    );
    return stmt.get(type, normalizedValue) !== undefined;
  }

  /**
   * Create a new whitelist entry
   */
  create(input: CreateWhitelistInput): WhitelistEntry {
    const normalizedValue = input.type === 'phone'
      ? normalizePhone(input.value)
      : normalizeIp(input.value);

    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO fraud_whitelist (type, value, description, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.type,
      normalizedValue,
      input.description || null,
      now
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  /**
   * Delete a whitelist entry
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM fraud_whitelist WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Count entries by type
   */
  countByType(type: WhitelistType): number {
    const stmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM fraud_whitelist WHERE type = ?'
    );
    const result = stmt.get(type) as { count: number };
    return result.count;
  }

  /**
   * Count all entries
   */
  countAll(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM fraud_whitelist');
    const result = stmt.get() as { count: number };
    return result.count;
  }
}
