/**
 * Admin UI Server
 *
 * Separate Express server for admin panel on configurable port.
 * Provides session-based auth, API endpoints, and WebSocket streaming.
 */

import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import path from 'path';
import { createServer as createHttpServer } from 'http';
import type { DispatchService } from '../services/DispatchService.js';
import { getConfig, getTrustProxySetting } from '../config/index.js';
import { registerAdminRoutes } from './routes.js';
import { initializeWebSocket } from './websocket.js';
import { logger } from '../utils/logger.js';

/**
 * Create and configure admin Express server
 */
export function createAdminServer(dispatchService: DispatchService) {
  const config = getConfig();
  const app = express();

  // Trust proxy for accurate IP detection (number of known proxy hops, default 1).
  // Required so the admin IP whitelist sees the real client IP and not a spoofed
  // X-Forwarded-For, and so `secure: 'auto'` cookies work behind the TLS proxy.
  app.set('trust proxy', getTrustProxySetting());

  // Cookie parser
  app.use(cookieParser());

  // Session middleware
  // Never sign sessions with a hardcoded, source-visible constant. Require an
  // explicit ADMIN_SESSION_SECRET; if absent, fall back to a random per-process
  // secret (sessions won't survive a restart, but cannot be forged offline).
  let sessionSecret = config.admin.sessionSecret;
  if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    logger.warn(
      'ADMIN_SESSION_SECRET not set - using a random per-process secret. ' +
        'Set ADMIN_SESSION_SECRET to keep admin sessions valid across restarts.'
    );
  }

  // 'auto' sets the Secure flag only when the request is HTTPS (honoured behind the
  // TLS-terminating proxy via trust proxy + X-Forwarded-Proto), so the admin.sid
  // cookie is never sent over plaintext in production.
  const cookieSecure: boolean | 'auto' =
    config.admin.cookieSecure === 'true'
      ? true
      : config.admin.cookieSecure === 'false'
        ? false
        : 'auto';

  const sessionMiddleware = session({
    secret: sessionSecret,
    name: 'admin.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: cookieSecure,
      httpOnly: true,
      maxAge: config.admin.sessionTtlMinutes * 60 * 1000,
      sameSite: 'lax',
    },
  });
  app.use(sessionMiddleware);

  // Body parsing
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // CORS headers - only reflect explicitly allow-listed origins.
  // Reflecting an arbitrary Origin together with Allow-Credentials lets any site make
  // authenticated cross-origin requests against the admin API. The admin UI is served
  // same-origin in production, so the allow-list is empty by default; configure
  // ADMIN_CORS_ORIGINS (comma-separated) for local development against the dev server.
  const allowedOrigins = new Set(
    (config.admin.corsOrigins || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  );
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    // CSRF defense-in-depth for state-changing requests. The admin SPA is served
    // same-origin (Origin === Host); a malicious site's cross-origin fetch carries
    // its own Origin and is rejected here even though it would ride the session
    // cookie. Requests without an Origin header (non-browser clients) are not a CSRF
    // vector and pass. Complements the cookie's sameSite=lax.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = null;
      }
      const sameOrigin = originHost !== null && originHost === req.headers.host;
      if (!sameOrigin && !allowedOrigins.has(origin)) {
        logger.warn('Admin request blocked: cross-origin state change', {
          origin,
          host: req.headers.host,
          method: req.method,
          path: req.path,
        });
        res.status(403).json({ error: 'forbidden', message: 'Cross-origin request blocked' });
        return;
      }
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

  // Initialize WebSocket server.
  // The session middleware is passed through so the WS handshake can validate the
  // admin session cookie (otherwise any client reaching /admin/ws could subscribe to
  // the live OTP event stream without authentication).
  const wsServer = initializeWebSocket(httpServer, sessionMiddleware);

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
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    // Admin is optional - log loudly but don't take down the main gateway.
    logger.error('Admin UI server failed to start', {
      port: config.admin.port,
      code: err.code,
      error: err.message,
    });
  });
}
