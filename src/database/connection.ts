/**
 * Database Connection Manager
 *
 * SQLite connection with WAL mode for concurrent access.
 * Singleton pattern matching existing managers (ariManager, config).
 */

import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

/**
 * Database connection state
 */
export type DatabaseState = 'disconnected' | 'connected';

/**
 * Database Manager
 * Handles SQLite connection lifecycle
 */
class DatabaseManager {
  private db: Database.Database | null = null;
  private state: DatabaseState = 'disconnected';

  /**
   * Get current connection state
   */
  getState(): DatabaseState {
    return this.state;
  }

  /**
   * Check if database is connected
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.db !== null;
  }

  /**
   * Get the underlying database instance (throws if not connected)
   */
  getDb(): Database.Database {
    if (!this.db || this.state !== 'connected') {
      throw new Error('Database is not connected');
    }
    return this.db;
  }

  /**
   * Connect to SQLite database
   */
  connect(dbPath: string): Database.Database {
    if (this.state === 'connected' && this.db) {
      logger.warn('Database already connected');
      return this.db;
    }

    logger.info('Connecting to database...', { path: dbPath });

    try {
      this.db = new Database(dbPath);

      // Enable WAL mode for concurrent reads
      this.db.pragma('journal_mode = WAL');
      // Normal synchronous for balance of safety and speed
      this.db.pragma('synchronous = NORMAL');
      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      this.state = 'connected';
      logger.info('Database connected successfully', { path: dbPath });

      return this.db;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to connect to database', { error: message, path: dbPath });
      throw error;
    }
  }

  /**
   * Execute raw SQL (for migrations)
   */
  exec(sql: string): void {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    this.db.exec(sql);
  }

  /**
   * Check if a table exists
   */
  tableExists(tableName: string): boolean {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    const result = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(tableName);
    return result !== undefined;
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      try {
        this.db.close();
        logger.info('Database connection closed');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Error closing database', { error: message });
      }
      this.db = null;
    }
    this.state = 'disconnected';
  }

  /**
   * Reset for testing
   */
  reset(): void {
    this.close();
  }
}

/**
 * Singleton database manager instance
 */
export const dbManager = new DatabaseManager();

/**
 * Convenience function to get current database state
 */
export function getDbState(): DatabaseState {
  return dbManager.getState();
}

/**
 * Convenience function to check if database is connected
 */
export function isDbConnected(): boolean {
  return dbManager.isConnected();
}

/**
 * Convenience function to get the database instance
 */
export function getDb(): Database.Database {
  return dbManager.getDb();
}
