/**
 * Admin UI Server
 *
 * Separate Express server for admin panel on configurable port.
 * Provides session-based auth, API endpoints, and WebSocket streaming.
 */

import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createHttpServer } from 'http';
import type { DispatchService } from '../services/DispatchService.js';
import { getConfig } from '../config/index.js';
import { registerAdminRoutes } from './routes.js';
import { initializeWebSocket } from './websocket.js';
import { logger } from '../utils/logger.js';

/**
 * Create and configure admin Express server
 */
export function createAdminServer(dispatchService: DispatchService) {
  const config = getConfig();
  const app = express();

  // Trust proxy for accurate IP detection
  app.set('trust proxy', true);

  // Cookie parser
  app.use(cookieParser());

  // Session middleware
  const sessionSecret = config.admin.sessionSecret || 'admin-session-secret-change-me';
  app.use(
    session({
      secret: sessionSecret,
      name: 'admin.sid',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // Set to true if using HTTPS
        httpOnly: true,
        maxAge: config.admin.sessionTtlMinutes * 60 * 1000,
        sameSite: 'lax',
      },
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // CORS headers for development
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Register admin API routes
  registerAdminRoutes(app, dispatchService);

  // Serve static files from admin UI build (production)
  const staticPath = path.join(process.cwd(), 'admin', 'dist');
  app.use(express.static(staticPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/admin/')) {
      res.status(404).json({ error: 'not_found', message: 'Endpoint not found' });
      return;
    }
    res.sendFile(path.join(staticPath, 'index.html'), (err) => {
      if (err) {
        res.status(404).json({ error: 'not_found', message: 'Admin UI not built' });
      }
    });
  });

  // Create HTTP server
  const httpServer = createHttpServer(app);

  // Initialize WebSocket server
  const wsServer = initializeWebSocket(httpServer);

  logger.info('Admin server configured', {
    port: config.admin.port,
    staticPath,
  });

  return { app, httpServer, wsServer };
}

/**
 * Start the admin server
 */
export function startAdminServer(dispatchService: DispatchService): void {
  const config = getConfig();

  if (!config.admin.enabled) {
    logger.info('Admin UI is disabled');
    return;
  }

  if (!config.admin.password) {
    logger.warn('Admin UI enabled but ADMIN_PASSWORD not set - admin login will fail');
  }

  const { httpServer } = createAdminServer(dispatchService);

  httpServer.listen(config.admin.port, () => {
    logger.info(`Admin UI server listening on port ${config.admin.port}`);
  });
}
