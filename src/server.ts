/**
 * HTTP API Server
 *
 * Express server with routes for OTP dispatch and webhooks.
 */

import express from 'express';
import type { Express } from 'express';
import type { DispatchService } from './services/DispatchService.js';
import type { CdrController } from './controllers/CdrController.js';
import { registerRoutes } from './routes/index.js';
import { logger } from './utils/logger.js';

/**
 * Server options
 */
export interface ServerOptions {
  cdrController?: CdrController;
}

/**
 * Create and configure Express application
 */
export function createServer(dispatchService: DispatchService, options?: ServerOptions): Express {
  const app = express();

  // Middleware - support JSON, JSON:API, and URL-encoded (for DIDWW DLR/CDR callbacks)
  // Increased limit for CDR batches (up to 1000 records)
  app.use(express.json({ limit: '1mb', type: ['application/json', 'application/vnd.api+json'] }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
  // Support raw text for newline-delimited JSON (CDR streaming format)
  app.use(express.text({ limit: '1mb', type: 'text/plain' }));

  // Trust proxy for accurate IP extraction
  app.set('trust proxy', true);

  // Register all routes
  registerRoutes(app, dispatchService, options?.cdrController);

  logger.info('HTTP server configured');

  return app;
}

// Legacy export for backwards compatibility
export { createServer as startServer };
