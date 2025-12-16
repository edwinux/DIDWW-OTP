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
const SCHEMA_VERSION = 1;

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

  // Run schema creation
  logger.info('Applying schema...', { from: currentVersion, to: SCHEMA_VERSION });
  db.exec(SCHEMA_SQL);

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
