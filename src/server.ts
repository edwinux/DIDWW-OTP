/**
 * HTTP API Server
 *
 * Express server exposing the /send-otp endpoint for voice OTP delivery.
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { getConfig } from './config/index.js';
import { isAriConnected, getAriState, getAriClient } from './ari/client.js';
import { originateOtpCall } from './ari/handlers.js';
import { logger } from './utils/logger.js';

const app = express();

// Middleware
app.use(express.json({ limit: '10kb' }));

/**
 * Request body schema for /send-otp
 */
const sendOtpSchema = z.object({
  phone: z
    .string()
    .regex(/^\+[1-9]\d{9,14}$/, 'Phone must be in E.164 format (e.g., +14155551234)'),
  code: z
    .string()
    .regex(/^\d{4,8}$/, 'Code must be 4-8 numeric digits'),
  secret: z.string().min(1, 'Secret is required'),
});

type SendOtpRequest = z.infer<typeof sendOtpSchema>;

/**
 * Mask phone number for logging
 */
function maskPhone(phone: string): string {
  if (phone.length < 8) return '***';
  return phone.slice(0, 3) + '***' + phone.slice(-4);
}

/**
 * Authentication middleware
 */
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();
  const secret = req.body?.secret || req.headers['x-api-secret'];

  if (!secret || secret !== config.api.secret) {
    logger.warn('Authentication failed', { ip: req.ip });
    res.status(403).json({ error: 'forbidden', message: 'Invalid API secret' });
    return;
  }
  next();
}

/**
 * POST /send-otp - Initiate voice OTP call
 */
app.post('/send-otp', authMiddleware, async (req: Request, res: Response) => {
  // Validate request body
  const validation = sendOtpSchema.safeParse(req.body);
  if (!validation.success) {
    const errors = validation.error.issues.map((i) => i.message).join(', ');
    logger.warn('Invalid request', { errors });
    res.status(400).json({ error: 'invalid_request', message: errors });
    return;
  }

  const { phone, code } = validation.data as SendOtpRequest;
  const callId = crypto.randomUUID();

  logger.info('OTP request received', { callId, phone: maskPhone(phone) });

  // Check ARI connection
  if (!isAriConnected()) {
    logger.error('ARI not connected', { state: getAriState() });
    res.status(503).json({
      error: 'service_unavailable',
      message: 'Voice gateway is not ready',
    });
    return;
  }

  // Initiate call via ARI
  try {
    await originateOtpCall(getAriClient(), phone, code, callId);
    logger.info('Call initiated', { callId, phone: maskPhone(phone) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to originate call', { callId, error: msg });
    res.status(500).json({ error: 'call_failed', message: 'Failed to initiate call' });
    return;
  }

  res.status(202).json({
    status: 'calling',
    call_id: callId,
    phone,
  });
});

/**
 * GET /health - Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  const ariConnected = isAriConnected();
  const status = ariConnected ? 'healthy' : 'degraded';

  res.status(ariConnected ? 200 : 503).json({
    status,
    asterisk: ariConnected ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    version: '0.1.0',
  });
});

/**
 * Start the HTTP server
 */
export function startServer(): void {
  const config = getConfig();
  const port = config.api.port;

  app.listen(port, () => {
    logger.info(`HTTP server listening on port ${port}`);
  });
}

export { app };
