/**
 * Routes Registration
 *
 * Registers all HTTP routes with Express app.
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { DispatchController } from '../controllers/DispatchController.js';
import { WebhookController } from '../controllers/WebhookController.js';
import { CdrController } from '../controllers/CdrController.js';
import type { DispatchService } from '../services/DispatchService.js';
import { isDbConnected } from '../database/index.js';
import { isAriConnected } from '../ari/client.js';
import { getConfig } from '../config/index.js';
import { safeCompare } from '../utils/secureCompare.js';
import { logger } from '../utils/logger.js';

/**
 * Auth middleware for API endpoints
 */
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();
  const rawSecret = req.body?.secret ?? req.headers['x-api-secret'];
  const provided = Array.isArray(rawSecret) ? rawSecret[0] : rawSecret;

  // Constant-time comparison to avoid leaking the secret via response timing.
  if (typeof provided !== 'string' || !safeCompare(provided, config.api.secret)) {
    logger.warn('Authentication failed', { ip: req.ip });
    res.status(403).json({ error: 'forbidden', message: 'Invalid API secret' });
    return;
  }

  // Remove secret from body to avoid logging
  if (req.body?.secret) {
    delete req.body.secret;
  }

  next();
}

/**
 * Auth middleware for INBOUND provider callbacks (DIDWW DLR / CDR).
 *
 * When WEBHOOK_INBOUND_SECRET is configured, requires a matching token supplied
 * via the X-Webhook-Token header or `?token=` query string (constant-time compare).
 * When it is not configured, callbacks are accepted but a warning is logged so the
 * operator knows the endpoints are unauthenticated.
 */
function inboundWebhookAuth(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();
  const expected = config.webhooks.inboundSecret;

  if (!expected) {
    logger.warn(
      'Inbound webhook accepted without authentication (set WEBHOOK_INBOUND_SECRET to require a token)',
      { ip: req.ip, path: req.path }
    );
    next();
    return;
  }

  const headerToken = req.headers['x-webhook-token'];
  const queryToken = req.query?.token;
  const rawToken = headerToken ?? queryToken;
  const provided = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  if (typeof provided !== 'string' || !safeCompare(provided, expected)) {
    logger.warn('Inbound webhook authentication failed', { ip: req.ip, path: req.path });
    res.status(403).json({ error: 'forbidden', message: 'Invalid webhook token' });
    return;
  }

  next();
}

/**
 * Register all routes
 */
export function registerRoutes(
  app: Express,
  dispatchService: DispatchService,
  cdrController?: CdrController
): void {
  const dispatchController = new DispatchController(dispatchService);
  const webhookController = new WebhookController(dispatchService);

  // Health check endpoint (no auth)
  app.get('/health', (_req: Request, res: Response) => {
    const dbConnected = isDbConnected();
    const ariConnected = isAriConnected();
    const healthy = dbConnected && ariConnected;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      database: dbConnected ? 'connected' : 'disconnected',
      asterisk: ariConnected ? 'connected' : 'disconnected',
      uptime: Math.floor(process.uptime()),
      version: '1.0.0',
    });
  });

  // Main dispatch endpoint
  app.post('/dispatch', authMiddleware, (req: Request, res: Response) => {
    dispatchController.handle(req, res);
  });

  // Legacy endpoint (deprecated, redirects to /dispatch)
  app.post('/send-otp', authMiddleware, (req: Request, res: Response) => {
    // Add deprecation warning header
    res.setHeader('X-Deprecated', 'Use /dispatch instead');
    res.setHeader('Warning', '299 - "Deprecated API: Use /dispatch endpoint instead"');

    // Transform request to dispatch format
    req.body.channels = ['voice']; // Legacy endpoint was voice-only
    dispatchController.handle(req, res);
  });

  // Webhook endpoints
  app.post('/webhooks/auth', authMiddleware, (req: Request, res: Response) => {
    webhookController.handleAuthFeedback(req, res);
  });

  app.post('/webhooks/dlr', inboundWebhookAuth, (req: Request, res: Response) => {
    // DLR callbacks come from DIDWW; authenticated via WEBHOOK_INBOUND_SECRET when set
    webhookController.handleDlrCallback(req, res);
  });

  // CDR streaming webhook (if CDR controller is provided)
  if (cdrController) {
    app.post('/webhooks/cdr', inboundWebhookAuth, (req: Request, res: Response) => {
      // CDR callbacks come from DIDWW; authenticated via WEBHOOK_INBOUND_SECRET when set
      cdrController.handleCdrBatch(req, res);
    });
    logger.info('CDR webhook endpoint registered');
  }

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'not_found',
      message: 'Endpoint not found',
    });
  });

  logger.info('Routes registered');
}
