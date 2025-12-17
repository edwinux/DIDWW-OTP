/**
 * Admin Routes Registration
 *
 * Registers all admin API routes with the Express app.
 */

import type { Express, Request, Response } from 'express';
import type { DispatchService } from '../services/DispatchService.js';
import { requireAdminAuth, checkIpWhitelist } from './middleware/auth.js';
import { AuthController } from './controllers/AuthController.js';
import { LogsController } from './controllers/LogsController.js';
import { DatabaseController } from './controllers/DatabaseController.js';
import { TesterController } from './controllers/TesterController.js';
import { logger } from '../utils/logger.js';

/**
 * Register all admin routes
 */
export function registerAdminRoutes(app: Express, dispatchService: DispatchService): void {
  // Initialize controllers
  const authController = new AuthController();
  const logsController = new LogsController();
  const databaseController = new DatabaseController();
  const testerController = new TesterController(dispatchService);

  // ============================================================================
  // Authentication Routes (IP whitelist only, no session required)
  // ============================================================================

  app.post('/admin/auth/login', checkIpWhitelist, (req: Request, res: Response) => {
    authController.login(req, res);
  });

  // ============================================================================
  // Protected Routes (require session + IP whitelist)
  // ============================================================================

  app.post('/admin/auth/logout', requireAdminAuth, (req: Request, res: Response) => {
    authController.logout(req, res);
  });

  app.get('/admin/auth/session', requireAdminAuth, (req: Request, res: Response) => {
    authController.checkSession(req, res);
  });

  // ============================================================================
  // Logs Routes
  // ============================================================================

  app.get('/admin/logs/otp-requests', requireAdminAuth, (req: Request, res: Response) => {
    logsController.getOtpRequests(req, res);
  });

  app.get('/admin/logs/otp-requests/:id', requireAdminAuth, (req: Request, res: Response) => {
    logsController.getOtpRequestById(req, res);
  });

  app.get('/admin/logs/webhook-logs', requireAdminAuth, (req: Request, res: Response) => {
    logsController.getWebhookLogs(req, res);
  });

  app.get('/admin/logs/filters', requireAdminAuth, (req: Request, res: Response) => {
    logsController.getFilterOptions(req, res);
  });

  app.get('/admin/logs/stats', requireAdminAuth, (req: Request, res: Response) => {
    logsController.getStats(req, res);
  });

  app.get('/admin/logs/hourly-traffic', requireAdminAuth, (req: Request, res: Response) => {
    logsController.getHourlyTraffic(req, res);
  });

  // ============================================================================
  // Database Browser Routes
  // ============================================================================

  app.get('/admin/db/tables', requireAdminAuth, (req: Request, res: Response) => {
    databaseController.getTables(req, res);
  });

  app.get('/admin/db/tables/:tableName', requireAdminAuth, (req: Request, res: Response) => {
    databaseController.getTableSchema(req, res);
  });

  app.get('/admin/db/query/:tableName', requireAdminAuth, (req: Request, res: Response) => {
    databaseController.queryTable(req, res);
  });

  // ============================================================================
  // Tester Routes
  // ============================================================================

  app.post('/admin/test/send-otp', requireAdminAuth, (req: Request, res: Response) => {
    testerController.sendTestOtp(req, res);
  });

  app.get('/admin/test/status/:testId', requireAdminAuth, (req: Request, res: Response) => {
    testerController.getTestStatus(req, res);
  });

  app.get('/admin/test/history', requireAdminAuth, (req: Request, res: Response) => {
    testerController.getTestHistory(req, res);
  });

  app.post('/admin/test/verify/:testId', requireAdminAuth, (req: Request, res: Response) => {
    testerController.verifyTestOtp(req, res);
  });

  // ============================================================================
  // Admin Health Check
  // ============================================================================

  app.get('/admin/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'admin-api',
      timestamp: Date.now(),
    });
  });

  // ============================================================================
  // Version Info (public, no auth required)
  // ============================================================================

  app.get('/admin/version', (_req: Request, res: Response) => {
    res.json({
      commit: process.env.BUILD_COMMIT || 'dev',
      buildTime: process.env.BUILD_TIME || null,
    });
  });

  logger.info('Admin routes registered');
}
