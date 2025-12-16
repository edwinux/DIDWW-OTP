/**
 * OTP Event Repository
 *
 * CRUD operations for OTP channel events.
 */

import type Database from 'better-sqlite3';
import { getDb } from '../database/index.js';

/**
 * Channel-specific event types
 */
export type SmsEventType =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'undelivered';

export type VoiceEventType =
  | 'queued'
  | 'calling'
  | 'ringing'
  | 'answered'
  | 'playing'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'busy'
  | 'hangup';

export type ChannelEventType = SmsEventType | VoiceEventType | string;

/**
 * OTP event record
 */
export interface OtpEvent {
  id: number;
  request_id: string;
  channel: string;
  event_type: ChannelEventType;
  event_data: string | null;
  created_at: number;
}

/**
 * Create OTP event input
 */
export interface CreateOtpEventInput {
  request_id: string;
  channel: string;
  event_type: ChannelEventType;
  event_data?: Record<string, unknown>;
}

/**
 * Map channel events to high-level OTP status
 */
export const EVENT_TO_STATUS_MAP: Record<string, string> = {
  // SMS events
  'sms:queued': 'pending',
  'sms:sending': 'sending',
  'sms:sent': 'sent',
  'sms:delivered': 'delivered',
  'sms:failed': 'failed',
  'sms:undelivered': 'failed',

  // Voice events
  'voice:queued': 'pending',
  'voice:calling': 'sending',
  'voice:ringing': 'sent',
  'voice:answered': 'sent',
  'voice:playing': 'sent',
  'voice:completed': 'delivered',
  'voice:failed': 'failed',
  'voice:no_answer': 'failed',
  'voice:busy': 'failed',
  'voice:hangup': 'failed',
};

/**
 * OTP Event Repository
 */
export class OtpEventRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDb();
  }

  /**
   * Create a new OTP event
   */
  create(input: CreateOtpEventInput): OtpEvent {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO otp_events (request_id, channel, event_type, event_data, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      input.request_id,
      input.channel,
      input.event_type,
      input.event_data ? JSON.stringify(input.event_data) : null,
      now
    );

    return {
      id: result.lastInsertRowid as number,
      request_id: input.request_id,
      channel: input.channel,
      event_type: input.event_type,
      event_data: input.event_data ? JSON.stringify(input.event_data) : null,
      created_at: now,
    };
  }

  /**
   * Find all events for a request
   */
  findByRequestId(requestId: string): OtpEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM otp_events
      WHERE request_id = ?
      ORDER BY created_at ASC
    `);
    return stmt.all(requestId) as OtpEvent[];
  }

  /**
   * Find latest event for a request
   */
  findLatestByRequestId(requestId: string): OtpEvent | null {
    const stmt = this.db.prepare(`
      SELECT * FROM otp_events
      WHERE request_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return (stmt.get(requestId) as OtpEvent) || null;
  }

  /**
   * Get high-level status from channel event
   */
  static getStatusFromEvent(channel: string, eventType: string): string | null {
    const key = `${channel}:${eventType}`;
    return EVENT_TO_STATUS_MAP[key] || null;
  }

  /**
   * Cleanup old events
   */
  cleanup(olderThanHours: number): number {
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
    const stmt = this.db.prepare('DELETE FROM otp_events WHERE created_at < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  }
}
