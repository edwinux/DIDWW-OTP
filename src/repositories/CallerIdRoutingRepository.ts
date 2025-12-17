/**
 * Caller ID Routing Repository
 *
 * CRUD operations for prefix-based caller ID routing rules.
 */

import type Database from 'better-sqlite3';
import { getDb } from '../database/index.js';

/**
 * Channel types for caller ID routing
 */
export type RoutingChannel = 'sms' | 'voice';

/**
 * Caller ID route record
 */
export interface CallerIdRoute {
  id: number;
  channel: RoutingChannel;
  prefix: string;
  caller_id: string;
  description: string | null;
  enabled: number;
  created_at: number;
  updated_at: number;
}

/**
 * Input for creating a new route
 */
export interface CreateCallerIdRouteInput {
  channel: RoutingChannel;
  prefix: string;
  caller_id: string;
  description?: string;
  enabled?: boolean;
}

/**
 * Input for updating a route
 */
export interface UpdateCallerIdRouteInput {
  prefix?: string;
  caller_id?: string;
  description?: string;
  enabled?: boolean;
}

/**
 * Normalize a phone prefix by removing + and leading zeros
 */
export function normalizePrefix(prefix: string): string {
  if (prefix === '*') return '*';
  // Remove + prefix and any spaces
  return prefix.replace(/^\+/, '').replace(/\s/g, '');
}

/**
 * Validate caller ID format for voice channel (must be numeric)
 */
export function validateVoiceCallerId(callerId: string): boolean {
  return /^\d{10,15}$/.test(callerId);
}

/**
 * Caller ID Routing Repository
 */
export class CallerIdRoutingRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDb();
  }

  /**
   * Create a new caller ID route
   */
  create(input: CreateCallerIdRouteInput): CallerIdRoute {
    const now = Date.now();
    const normalizedPrefix = normalizePrefix(input.prefix);

    // Validate voice caller ID is numeric
    if (input.channel === 'voice' && !validateVoiceCallerId(input.caller_id)) {
      throw new Error('Voice caller ID must be 10-15 digits');
    }

    const stmt = this.db.prepare(`
      INSERT INTO caller_id_routes (channel, prefix, caller_id, description, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.channel,
      normalizedPrefix,
      input.caller_id,
      input.description || null,
      input.enabled !== false ? 1 : 0,
      now,
      now
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  /**
   * Find route by ID
   */
  findById(id: number): CallerIdRoute | null {
    const stmt = this.db.prepare('SELECT * FROM caller_id_routes WHERE id = ?');
    return (stmt.get(id) as CallerIdRoute) || null;
  }

  /**
   * Find all routes for a channel
   */
  findByChannel(channel: RoutingChannel): CallerIdRoute[] {
    const stmt = this.db.prepare('SELECT * FROM caller_id_routes WHERE channel = ? ORDER BY length(prefix) DESC');
    return stmt.all(channel) as CallerIdRoute[];
  }

  /**
   * Find all enabled routes for a channel (for cache loading)
   */
  findEnabledByChannel(channel: RoutingChannel): CallerIdRoute[] {
    const stmt = this.db.prepare(`
      SELECT * FROM caller_id_routes
      WHERE channel = ? AND enabled = 1
      ORDER BY length(prefix) DESC
    `);
    return stmt.all(channel) as CallerIdRoute[];
  }

  /**
   * Find all routes
   */
  findAll(): CallerIdRoute[] {
    const stmt = this.db.prepare('SELECT * FROM caller_id_routes ORDER BY channel, length(prefix) DESC');
    return stmt.all() as CallerIdRoute[];
  }

  /**
   * Find route by channel and prefix
   */
  findByChannelAndPrefix(channel: RoutingChannel, prefix: string): CallerIdRoute | null {
    const normalizedPrefix = normalizePrefix(prefix);
    const stmt = this.db.prepare('SELECT * FROM caller_id_routes WHERE channel = ? AND prefix = ?');
    return (stmt.get(channel, normalizedPrefix) as CallerIdRoute) || null;
  }

  /**
   * Update a route
   */
  update(id: number, input: UpdateCallerIdRouteInput): CallerIdRoute | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.prefix !== undefined) {
      updates.push('prefix = ?');
      values.push(normalizePrefix(input.prefix));
    }

    if (input.caller_id !== undefined) {
      // Validate voice caller ID if updating caller_id on voice route
      if (existing.channel === 'voice' && !validateVoiceCallerId(input.caller_id)) {
        throw new Error('Voice caller ID must be 10-15 digits');
      }
      updates.push('caller_id = ?');
      values.push(input.caller_id);
    }

    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description || null);
    }

    if (input.enabled !== undefined) {
      updates.push('enabled = ?');
      values.push(input.enabled ? 1 : 0);
    }

    if (updates.length === 0) return existing;

    updates.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE caller_id_routes SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * Toggle route enabled status
   */
  toggleEnabled(id: number): CallerIdRoute | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const stmt = this.db.prepare(`
      UPDATE caller_id_routes SET enabled = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(existing.enabled ? 0 : 1, Date.now(), id);

    return this.findById(id);
  }

  /**
   * Delete a route
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM caller_id_routes WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Check if a prefix exists for a channel
   */
  prefixExists(channel: RoutingChannel, prefix: string, excludeId?: number): boolean {
    const normalizedPrefix = normalizePrefix(prefix);
    if (excludeId) {
      const stmt = this.db.prepare('SELECT 1 FROM caller_id_routes WHERE channel = ? AND prefix = ? AND id != ?');
      return stmt.get(channel, normalizedPrefix, excludeId) !== undefined;
    }
    const stmt = this.db.prepare('SELECT 1 FROM caller_id_routes WHERE channel = ? AND prefix = ?');
    return stmt.get(channel, normalizedPrefix) !== undefined;
  }

  /**
   * Get count of routes by channel
   */
  countByChannel(channel: RoutingChannel): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM caller_id_routes WHERE channel = ?');
    const result = stmt.get(channel) as { count: number };
    return result.count;
  }
}
