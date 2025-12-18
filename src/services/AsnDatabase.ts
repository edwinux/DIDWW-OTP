/**
 * ASN Database Service
 *
 * Manages ASN (Autonomous System Number) lookups with automatic database updates.
 * Uses maxmind MMDB format with @ip-location-db/asn-mmdb as the data source.
 *
 * Features:
 * - Synchronous lookups for fast fraud checks
 * - Automatic updates from CDN when IPs are unresolved
 * - Rate-limited update attempts
 * - Hot-reload without service restart
 * - Queue mechanism for requests pending ASN resolution
 */

import { Reader, open } from 'maxmind';
import { createRequire } from 'module';
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);

/**
 * ASN lookup result from MMDB
 */
interface AsnRecord {
  autonomous_system_number: number;
  autonomous_system_organization: string;
}

/**
 * ASN lookup result (simplified)
 */
export interface AsnLookupResult {
  asn: number;
  organization: string;
}

/**
 * ASN Database configuration
 */
export interface AsnDatabaseConfig {
  enabled: boolean;
  dataPath: string; // Path to store downloaded database
  updateIntervalHours: number; // Periodic update interval
  updateRateLimitHours: number; // Min hours between update attempts
  unresolvedThreshold: number; // Trigger update after N unresolved IPs
  cdnUrl: string; // CDN URL for database download
  shadowBanUnresolved: boolean; // Shadow-ban if ASN still unresolved after update
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AsnDatabaseConfig = {
  enabled: true,
  dataPath: '/data/asn.mmdb',
  updateIntervalHours: 168, // Weekly
  updateRateLimitHours: 1, // Max once per hour
  unresolvedThreshold: 100, // Trigger early update after 100 unresolved
  cdnUrl: 'https://cdn.jsdelivr.net/npm/@ip-location-db/asn-mmdb/asn.mmdb',
  shadowBanUnresolved: true, // Shadow-ban unresolved after update attempt
};

/**
 * Pending request waiting for ASN resolution
 */
interface PendingRequest {
  ip: string;
  resolve: (result: AsnLookupResult | null) => void;
  timestamp: number;
  timeoutId?: NodeJS.Timeout;
}

/**
 * ASN Database Service (Singleton)
 */
class AsnDatabaseService {
  private reader: Reader<AsnRecord> | null = null;
  private config: AsnDatabaseConfig;
  private lastUpdateAttempt: number = 0;
  private unresolvedCount: number = 0;
  private unresolvedIps: Set<string> = new Set();
  private updateInProgress: boolean = false;
  private pendingRequests: PendingRequest[] = [];
  private updateTimer: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  constructor(config?: Partial<AsnDatabaseConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the database (async)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.config.enabled) {
      logger.info('ASN Database disabled');
      this.initialized = true;
      return;
    }

    // Try to load from data path first (downloaded/updated version)
    if (existsSync(this.config.dataPath)) {
      try {
        this.reader = await open<AsnRecord>(this.config.dataPath);
        logger.info('ASN Database loaded from data path', { path: this.config.dataPath });
        this.initialized = true;
        this.startPeriodicUpdates();
        return;
      } catch (error) {
        logger.warn('Failed to load ASN database from data path', {
          path: this.config.dataPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fall back to bundled database
    try {
      const bundledPath = require.resolve('@ip-location-db/asn-mmdb/asn.mmdb');
      this.reader = await open<AsnRecord>(bundledPath);
      logger.info('ASN Database loaded from bundled package', { path: bundledPath });
      this.initialized = true;
      this.startPeriodicUpdates();
    } catch (error) {
      logger.error('Failed to load ASN database', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue without ASN - will shadow-ban all if configured
      this.initialized = true;
    }
  }

  /**
   * Synchronous lookup - returns immediately
   * Use this for quick checks where you don't need to wait for updates
   */
  lookup(ip: string): AsnLookupResult | null {
    if (!this.reader) return null;

    try {
      const result = this.reader.get(ip);
      if (result && result.autonomous_system_number) {
        return {
          asn: result.autonomous_system_number,
          organization: result.autonomous_system_organization || 'Unknown',
        };
      }
      return null;
    } catch (error) {
      logger.debug('ASN lookup error', { ip, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Async lookup with automatic update on miss
   * Use this for fraud checks where you want the most accurate ASN
   *
   * Flow:
   * 1. Try sync lookup
   * 2. If null, check if update needed/allowed
   * 3. If update in progress, queue request and wait
   * 4. If update needed, trigger update and retry
   * 5. Return result (may still be null)
   */
  async lookupWithUpdate(ip: string): Promise<AsnLookupResult | null> {
    // First try sync lookup
    const result = this.lookup(ip);
    if (result) return result;

    // Track unresolved IP
    this.trackUnresolved(ip);

    // If update already in progress, wait for it
    if (this.updateInProgress) {
      return this.waitForUpdate(ip);
    }

    // Check if we should trigger an update
    if (this.shouldTriggerUpdate()) {
      // Trigger update and wait for result
      await this.updateFromCdn();

      // Retry lookup after update
      return this.lookup(ip);
    }

    // No update triggered, return null
    return null;
  }

  /**
   * Check if ASN is resolved after potential update
   * Returns { resolved: boolean, asn: number | null }
   */
  async resolveAsn(ip: string): Promise<{ resolved: boolean; asn: number | null; organization: string | null }> {
    const result = await this.lookupWithUpdate(ip);

    if (result) {
      return { resolved: true, asn: result.asn, organization: result.organization };
    }

    // Still unresolved - this is suspicious
    return { resolved: false, asn: null, organization: null };
  }

  /**
   * Track an unresolved IP for update triggering
   */
  private trackUnresolved(ip: string): void {
    if (!this.unresolvedIps.has(ip)) {
      this.unresolvedIps.add(ip);
      this.unresolvedCount++;

      logger.debug('Unresolved IP tracked', {
        ip: ip.slice(0, -3) + 'xxx', // Partially mask
        count: this.unresolvedCount,
        threshold: this.config.unresolvedThreshold,
      });
    }
  }

  /**
   * Check if we should trigger an update
   */
  private shouldTriggerUpdate(): boolean {
    const now = Date.now();
    const hoursSinceLastAttempt = (now - this.lastUpdateAttempt) / (1000 * 60 * 60);

    // Rate limit check
    if (hoursSinceLastAttempt < this.config.updateRateLimitHours) {
      return false;
    }

    // Threshold check
    if (this.unresolvedCount >= this.config.unresolvedThreshold) {
      logger.info('Triggering ASN update due to unresolved threshold', {
        unresolvedCount: this.unresolvedCount,
        threshold: this.config.unresolvedThreshold,
      });
      return true;
    }

    return false;
  }

  /**
   * Wait for ongoing update to complete, then retry lookup
   */
  private waitForUpdate(ip: string): Promise<AsnLookupResult | null> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        const index = this.pendingRequests.findIndex((r) => r.ip === ip);
        if (index !== -1) {
          this.pendingRequests.splice(index, 1);
          resolve(this.lookup(ip));
        }
      }, 10000);

      this.pendingRequests.push({
        ip,
        resolve,
        timestamp: Date.now(),
        timeoutId,
      });
    });
  }

  /**
   * Process pending requests after update
   */
  private processPendingRequests(): void {
    const pending = [...this.pendingRequests];
    this.pendingRequests = [];

    for (const request of pending) {
      if (request.timeoutId) clearTimeout(request.timeoutId);
      const result = this.lookup(request.ip);
      request.resolve(result);
    }

    logger.debug('Processed pending ASN requests', { count: pending.length });
  }

  /**
   * Update database from CDN
   */
  async updateFromCdn(): Promise<boolean> {
    if (this.updateInProgress) {
      logger.debug('Update already in progress');
      return false;
    }

    this.updateInProgress = true;
    this.lastUpdateAttempt = Date.now();

    logger.info('Starting ASN database update from CDN', { url: this.config.cdnUrl });

    try {
      // Download to temp file
      const tempPath = this.config.dataPath + '.tmp';
      const response = await fetch(this.config.cdnUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const data = Buffer.from(buffer);

      // Ensure directory exists
      const dir = dirname(this.config.dataPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Write temp file
      writeFileSync(tempPath, data);

      // Validate by opening
      const newReader = await open<AsnRecord>(tempPath);

      // Test lookup
      const testResult = newReader.get('8.8.8.8');
      if (!testResult?.autonomous_system_number) {
        throw new Error('Database validation failed - test lookup returned no ASN');
      }

      // Atomic rename
      if (existsSync(this.config.dataPath)) {
        unlinkSync(this.config.dataPath);
      }
      renameSync(tempPath, this.config.dataPath);

      // Hot-swap reader
      this.reader = newReader;

      // Reset counters
      this.unresolvedCount = 0;
      this.unresolvedIps.clear();

      logger.info('ASN database updated successfully', {
        size: data.length,
        testAsn: testResult.autonomous_system_number,
      });

      // Process any pending requests
      this.processPendingRequests();

      return true;
    } catch (error) {
      logger.error('Failed to update ASN database', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Clean up temp file if exists
      const tempPath = this.config.dataPath + '.tmp';
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          // Ignore cleanup errors
        }
      }

      // Process pending requests with current (possibly stale) data
      this.processPendingRequests();

      return false;
    } finally {
      this.updateInProgress = false;
    }
  }

  /**
   * Start periodic update timer
   */
  private startPeriodicUpdates(): void {
    if (this.updateTimer) return;

    const intervalMs = this.config.updateIntervalHours * 60 * 60 * 1000;

    this.updateTimer = setInterval(() => {
      logger.info('Periodic ASN database update check');
      this.updateFromCdn().catch((error) => {
        logger.error('Periodic update failed', { error: error instanceof Error ? error.message : String(error) });
      });
    }, intervalMs);

    // Don't prevent process exit
    this.updateTimer.unref();

    logger.debug('Periodic ASN updates scheduled', { intervalHours: this.config.updateIntervalHours });
  }

  /**
   * Stop periodic updates
   */
  stopPeriodicUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    initialized: boolean;
    hasReader: boolean;
    unresolvedCount: number;
    lastUpdateAttempt: number;
    updateInProgress: boolean;
    pendingRequests: number;
  } {
    return {
      initialized: this.initialized,
      hasReader: this.reader !== null,
      unresolvedCount: this.unresolvedCount,
      lastUpdateAttempt: this.lastUpdateAttempt,
      updateInProgress: this.updateInProgress,
      pendingRequests: this.pendingRequests.length,
    };
  }

  /**
   * Check if shadow-ban should be applied for unresolved ASN
   */
  shouldShadowBanUnresolved(): boolean {
    return this.config.shadowBanUnresolved;
  }

  /**
   * Force update (for admin/testing)
   */
  async forceUpdate(): Promise<boolean> {
    this.lastUpdateAttempt = 0; // Reset rate limit
    return this.updateFromCdn();
  }
}

// Singleton instance
let instance: AsnDatabaseService | null = null;

/**
 * Get ASN Database singleton
 */
export function getAsnDatabase(): AsnDatabaseService {
  if (!instance) {
    instance = new AsnDatabaseService();
  }
  return instance;
}

/**
 * Initialize ASN Database with config
 */
export async function initAsnDatabase(config?: Partial<AsnDatabaseConfig>): Promise<AsnDatabaseService> {
  if (instance) {
    instance.stopPeriodicUpdates();
  }
  instance = new AsnDatabaseService(config);
  await instance.initialize();
  return instance;
}

/**
 * Reset singleton (for testing)
 */
export function resetAsnDatabase(): void {
  if (instance) {
    instance.stopPeriodicUpdates();
  }
  instance = null;
}

export { AsnDatabaseService };
