/**
 * HTTP API Server
 *
 * Express server with routes for OTP dispatch and webhooks.
 */

import express from 'express';
import type { Express } from 'express';
import type { DispatchService } from './services/DispatchService.js';
import { registerRoutes } from './routes/index.js';
import { logger } from './utils/logger.js';

/**
 * Create and configure Express application
 */
export function createServer(dispatchService: DispatchService): Express {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10kb' }));

  // Trust proxy for accurate IP extraction
  app.set('trust proxy', true);

  // Register all routes
  registerRoutes(app, dispatchService);

  logger.info('HTTP server configured');

  return app;
}

// Legacy export for backwards compatibility
export { createServer as startServer };
