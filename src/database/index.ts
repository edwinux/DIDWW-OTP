/**
 * Database Module
 *
 * Exports all database functionality.
 */

export { dbManager, getDb, getDbState, isDbConnected } from './connection.js';
export type { DatabaseState } from './connection.js';
export { runMigrations, isDatabaseInitialized } from './schema.js';
export { seedAsnBlocklist, getAsnBlocklistCount, seedCallerIdRoutes, getCallerIdRoutesCount } from './seed.js';
