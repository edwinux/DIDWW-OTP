/**
 * Database Schema
 *
 * Table definitions and migration runner for SQLite.
 */

import { dbManager } from './connection.js';
import { logger } from '../utils/logger.js';

/**
 * Schema version for migration tracking
 */
const SCHEMA_VERSION = 8;

/**
 * SQL schema definitions
 */
const SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- OTP dispatch requests
CREATE TABLE IF NOT EXISTS otp_requests (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  phone TEXT NOT NULL,
  phone_prefix TEXT,
  code_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  channel TEXT,
  channels_requested TEXT,
  ip_address TEXT,
  ip_subnet TEXT,
  asn INTEGER,
  country_code TEXT,
  phone_country TEXT,
  fraud_score INTEGER DEFAULT 0,
  fraud_reasons TEXT,
  shadow_banned INTEGER DEFAULT 0,
  webhook_url TEXT,
  provider_id TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_otp_requests_phone ON otp_requests(phone);
CREATE INDEX IF NOT EXISTS idx_otp_requests_ip_subnet ON otp_requests(ip_subnet);
CREATE INDEX IF NOT EXISTS idx_otp_requests_status ON otp_requests(status);
CREATE INDEX IF NOT EXISTS idx_otp_requests_created_at ON otp_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_otp_requests_session_id ON otp_requests(session_id);

-- IP reputation tracking
CREATE TABLE IF NOT EXISTS ip_reputation (
  ip_subnet TEXT PRIMARY KEY,
  total_requests INTEGER DEFAULT 0,
  verified_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  trust_score REAL DEFAULT 0.5,
  is_banned INTEGER DEFAULT 0,
  ban_reason TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

-- Phone prefix reputation (for IRSF detection)
CREATE TABLE IF NOT EXISTS prefix_reputation (
  prefix TEXT PRIMARY KEY,
  hourly_attempts INTEGER DEFAULT 0,
  hourly_verifications INTEGER DEFAULT 0,
  daily_attempts INTEGER DEFAULT 0,
  daily_verifications INTEGER DEFAULT 0,
  circuit_breaker_tripped INTEGER DEFAULT 0,
  block_expires_at INTEGER,
  last_reset INTEGER NOT NULL
);

-- ASN blocklist (pre-populated with cloud/VPN providers)
CREATE TABLE IF NOT EXISTS asn_blocklist (
  asn INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  category TEXT,
  reason TEXT,
  added_at INTEGER NOT NULL
);

-- Circuit breaker state
CREATE TABLE IF NOT EXISTS circuit_breaker (
  key TEXT PRIMARY KEY,
  failures INTEGER DEFAULT 0,
  successes INTEGER DEFAULT 0,
  last_failure INTEGER,
  last_success INTEGER,
  state TEXT DEFAULT 'closed',
  opened_at INTEGER,
  half_open_at INTEGER
);

-- Honeypot IPs (shadow-banned)
CREATE TABLE IF NOT EXISTS honeypot_ips (
  ip_subnet TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  detected_at INTEGER NOT NULL,
  expires_at INTEGER
);

-- Auth feedback for closed-loop learning
CREATE TABLE IF NOT EXISTS auth_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  success INTEGER NOT NULL,
  feedback_at INTEGER NOT NULL,
  FOREIGN KEY (request_id) REFERENCES otp_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_auth_feedback_request_id ON auth_feedback(request_id);

-- Webhook delivery logs
CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  status_code INTEGER,
  attempt INTEGER DEFAULT 1,
  error_message TEXT,
  sent_at INTEGER NOT NULL,
  FOREIGN KEY (request_id) REFERENCES otp_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_request_id ON webhook_logs(request_id);

-- OTP event log for channel-specific status tracking (V2)
CREATE TABLE IF NOT EXISTS otp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (request_id) REFERENCES otp_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_otp_events_request_id ON otp_events(request_id);
CREATE INDEX IF NOT EXISTS idx_otp_events_created_at ON otp_events(created_at);
`;

/**
 * V2 Migration: Add channel_status column and otp_events table
 */
const V2_MIGRATION_SQL = `
-- Add channel_status column for detailed channel-specific status
ALTER TABLE otp_requests ADD COLUMN channel_status TEXT;
`;

/**
 * V3 Migration: Add auth_status column for verification tracking
 */
const V3_MIGRATION_SQL = `
-- Add auth_status column for authentication verification status
-- Values: NULL (not verified), 'verified', 'wrong_code'
ALTER TABLE otp_requests ADD COLUMN auth_status TEXT;
`;

/**
 * V4 Migration: Add caller_id_routes table for prefix-based caller ID routing
 */
const V4_MIGRATION_SQL = `
-- Caller ID routing rules by destination prefix
CREATE TABLE IF NOT EXISTS caller_id_routes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL CHECK(channel IN ('sms', 'voice')),
  prefix TEXT NOT NULL,
  caller_id TEXT NOT NULL,
  description TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(channel, prefix)
);

CREATE INDEX IF NOT EXISTS idx_caller_id_routes_channel ON caller_id_routes(channel);
CREATE INDEX IF NOT EXISTS idx_caller_id_routes_enabled ON caller_id_routes(enabled);
`;

/**
 * V5 Migration: Add call timing columns for voice duration tracking
 */
const V5_MIGRATION_SQL = `
-- Add call timing columns for voice channel duration tracking
ALTER TABLE otp_requests ADD COLUMN start_time INTEGER;
ALTER TABLE otp_requests ADD COLUMN answer_time INTEGER;
ALTER TABLE otp_requests ADD COLUMN end_time INTEGER;
`;

/**
 * V6 Migration: Add SMS cost tracking column
 * Stored as INTEGER in 1/10000 dollars (0.01 cents) for precision
 */
const V6_MIGRATION_SQL = `
-- Add SMS cost column for tracking total SMS cost from DIDWW DLR callbacks
-- Stored as INTEGER in 1/10000 dollars to preserve sub-cent precision
ALTER TABLE otp_requests ADD COLUMN sms_cost_units INTEGER;
`;

/**
 * V7 Migration: Add fraud whitelist table for IP and phone number whitelisting
 */
const V7_MIGRATION_SQL = `
-- Fraud whitelist for bypassing fraud detection
CREATE TABLE IF NOT EXISTS fraud_whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('ip', 'phone')),
  value TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(type, value)
);

CREATE INDEX IF NOT EXISTS idx_fraud_whitelist_type_value ON fraud_whitelist(type, value);
`;

/**
 * V8 Migration: Billing/Rating System
 * - CDR records for voice call audit trail
 * - Carrier rates for learned pricing per prefix
 * - Fraud savings tracking
 * - Phone metadata columns
 */
const V8_MIGRATION_SQL = `
-- Call Detail Records (raw audit trail from DIDWW CDR streaming)
CREATE TABLE IF NOT EXISTS cdr_records (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL,
  trunk_id TEXT NOT NULL,

  -- Timestamps (INTEGER milliseconds)
  time_start INTEGER NOT NULL,
  time_connect INTEGER,
  time_end INTEGER NOT NULL,

  -- Duration and billing
  duration INTEGER NOT NULL,
  billing_duration INTEGER NOT NULL,
  initial_billing_interval INTEGER,
  next_billing_interval INTEGER,

  -- Pricing (stored as REAL for DIDWW precision)
  rate REAL NOT NULL,
  price REAL NOT NULL,

  -- Call status
  success INTEGER NOT NULL,
  disconnect_code INTEGER,
  disconnect_reason TEXT,

  -- Network info
  source_ip TEXT,
  trunk_name TEXT,
  pop TEXT,

  -- Numbers and routing
  src_number TEXT NOT NULL,
  dst_number TEXT NOT NULL,
  dst_prefix TEXT NOT NULL,
  src_prefix TEXT,
  call_type TEXT,

  -- Ingestion metadata
  ingested_at INTEGER NOT NULL,
  processed_for_rates INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cdr_records_trunk_id ON cdr_records(trunk_id);
CREATE INDEX IF NOT EXISTS idx_cdr_records_dst_prefix ON cdr_records(dst_prefix);
CREATE INDEX IF NOT EXISTS idx_cdr_records_time_start ON cdr_records(time_start);
CREATE INDEX IF NOT EXISTS idx_cdr_records_processed ON cdr_records(processed_for_rates);

-- Learned carrier rates (aggregated from CDRs and DLRs)
CREATE TABLE IF NOT EXISTS carrier_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL CHECK(channel IN ('sms', 'voice')),
  dst_prefix TEXT NOT NULL,
  src_prefix TEXT,

  -- Rate statistics (stored in 1/10000 dollars like SmsCost)
  rate_avg INTEGER NOT NULL,
  rate_min INTEGER NOT NULL,
  rate_max INTEGER NOT NULL,

  -- Billing metadata
  billing_increment INTEGER DEFAULT 1,

  -- Learning metadata
  sample_count INTEGER DEFAULT 1,
  confidence_score REAL DEFAULT 0.5,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  UNIQUE(channel, dst_prefix, src_prefix)
);

CREATE INDEX IF NOT EXISTS idx_carrier_rates_lookup ON carrier_rates(channel, dst_prefix);
CREATE INDEX IF NOT EXISTS idx_carrier_rates_updated ON carrier_rates(updated_at);

-- Fraud savings tracking (estimated cost of blocked requests)
CREATE TABLE IF NOT EXISTS fraud_savings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  estimated_cost_units INTEGER NOT NULL,
  dst_prefix TEXT NOT NULL,
  fraud_score INTEGER NOT NULL,
  fraud_reasons TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (request_id) REFERENCES otp_requests(id)
);

CREATE INDEX IF NOT EXISTS idx_fraud_savings_created_at ON fraud_savings(created_at);
CREATE INDEX IF NOT EXISTS idx_fraud_savings_request_id ON fraud_savings(request_id);
`;

/**
 * V8 Migration Part 2: Add columns to otp_requests
 */
const V8_ALTER_SQL = `
-- Voice cost tracking
ALTER TABLE otp_requests ADD COLUMN voice_cost_units INTEGER;
ALTER TABLE otp_requests ADD COLUMN voice_duration_seconds INTEGER;

-- Phone metadata from libphonenumber
ALTER TABLE otp_requests ADD COLUMN phone_number_type TEXT;
ALTER TABLE otp_requests ADD COLUMN phone_carrier TEXT;
`;

/**
 * Run database migrations
 */
export function runMigrations(): void {
  logger.info('Running database migrations...');

  const db = dbManager.getDb();

  // Check current schema version
  let currentVersion = 0;
  try {
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as
      | { version: number }
      | undefined;
    currentVersion = row?.version || 0;
  } catch {
    // Table doesn't exist yet, that's fine
  }

  if (currentVersion >= SCHEMA_VERSION) {
    logger.info('Database schema is up to date', { version: currentVersion });
    return;
  }

  // Run base schema creation (for fresh installs)
  if (currentVersion === 0) {
    logger.info('Applying base schema...', { version: 1 });
    db.exec(SCHEMA_SQL);
  }

  // Run V2 migration if upgrading from V1
  if (currentVersion < 2) {
    logger.info('Applying V2 migration...', { from: currentVersion, to: 2 });
    try {
      db.exec(V2_MIGRATION_SQL);
    } catch (err) {
      // Column might already exist if schema was created fresh with V2
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('duplicate column')) {
        throw err;
      }
    }
  }

  // Run V3 migration if upgrading from V2 or earlier
  if (currentVersion < 3) {
    logger.info('Applying V3 migration...', { from: currentVersion, to: 3 });
    try {
      db.exec(V3_MIGRATION_SQL);
    } catch (err) {
      // Column might already exist if schema was created fresh with V3
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('duplicate column')) {
        throw err;
      }
    }
  }

  // Run V4 migration if upgrading from V3 or earlier
  if (currentVersion < 4) {
    logger.info('Applying V4 migration...', { from: currentVersion, to: 4 });
    try {
      db.exec(V4_MIGRATION_SQL);
    } catch (err) {
      // Table might already exist if schema was created fresh with V4
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) {
        throw err;
      }
    }
  }

  // Run V5 migration if upgrading from V4 or earlier
  if (currentVersion < 5) {
    logger.info('Applying V5 migration...', { from: currentVersion, to: 5 });
    try {
      db.exec(V5_MIGRATION_SQL);
    } catch (err) {
      // Columns might already exist
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('duplicate column')) {
        throw err;
      }
    }
  }

  // Run V6 migration if upgrading from V5 or earlier
  if (currentVersion < 6) {
    logger.info('Applying V6 migration...', { from: currentVersion, to: 6 });
    try {
      db.exec(V6_MIGRATION_SQL);
    } catch (err) {
      // Column might already exist
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('duplicate column')) {
        throw err;
      }
    }
  }

  // Run V7 migration if upgrading from V6 or earlier
  if (currentVersion < 7) {
    logger.info('Applying V7 migration...', { from: currentVersion, to: 7 });
    try {
      db.exec(V7_MIGRATION_SQL);
    } catch (err) {
      // Table might already exist
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) {
        throw err;
      }
    }
  }

  // Run V8 migration if upgrading from V7 or earlier
  if (currentVersion < 8) {
    logger.info('Applying V8 migration...', { from: currentVersion, to: 8 });
    try {
      // Create new tables
      db.exec(V8_MIGRATION_SQL);
    } catch (err) {
      // Tables might already exist
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('already exists')) {
        throw err;
      }
    }
    // Add columns to otp_requests (run each ALTER separately for better error handling)
    const alterStatements = V8_ALTER_SQL.split(';').filter((s) => s.trim());
    for (const stmt of alterStatements) {
      try {
        db.exec(stmt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('duplicate column')) {
          throw err;
        }
      }
    }
  }

  // Record schema version
  db.prepare('INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)').run(
    SCHEMA_VERSION,
    Date.now()
  );

  logger.info('Database migrations complete', { version: SCHEMA_VERSION });
}

/**
 * Check if database is initialized
 */
export function isDatabaseInitialized(): boolean {
  return dbManager.tableExists('otp_requests');
}
