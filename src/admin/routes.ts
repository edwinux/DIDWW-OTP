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
import { CallerIdRoutingController } from './controllers/CallerIdRoutingController.js';
import { WhitelistController } from './controllers/WhitelistController.js';
import { BillingController } from './controllers/BillingController.js';
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
  const callerIdRoutingController = new CallerIdRoutingController();
  const whitelistController = new WhitelistController();
  const billingController = new BillingController();

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
  // Caller ID Routing Routes (Settings)
  // ============================================================================

  app.get('/admin/caller-id-routes', requireAdminAuth, (req: Request, res: Response) => {
    callerIdRoutingController.getRoutes(req, res);
  });

  app.get('/admin/caller-id-routes/stats', requireAdminAuth, (req: Request, res: Response) => {
    callerIdRoutingController.getStats(req, res);
  });

  app.post('/admin/caller-id-routes/reload', requireAdminAuth, (req: Request, res: Response) => {
    callerIdRoutingController.reloadRoutes(req, res);
  });

  app.post('/admin/caller-id-routes/test', requireAdminAuth, (req: Request, res: Response) => {
    callerIdRoutingController.testRouting(req, res);
  });

  app.get('/admin/caller-id-routes/:id', requireAdminAuth, (req: Request, res: Response) => {
    callerIdRoutingController.getRoute(req, res);
  });

  app.post('/admin/caller-id-routes', requireAdminAuth, (req: Request, res: Response) => {
    callerIdRoutingController.createRoute(req, res);
  });

  app.put('/admin/caller-id-routes/:id', requireAdminAuth, (req: Request, res: Response) => {
    callerIdRoutingController.updateRoute(req, res);
  });

  app.delete('/admin/caller-id-routes/:id', requireAdminAuth, (req: Request, res: Response) => {
    callerIdRoutingController.deleteRoute(req, res);
  });

  app.post('/admin/caller-id-routes/:id/toggle', requireAdminAuth, (req: Request, res: Response) => {
    callerIdRoutingController.toggleRoute(req, res);
  });

  // ============================================================================
  // Whitelist Routes (System Settings)
  // ============================================================================

  app.get('/admin/whitelist', requireAdminAuth, (req: Request, res: Response) => {
    whitelistController.getEntries(req, res);
  });

  app.post('/admin/whitelist', requireAdminAuth, (req: Request, res: Response) => {
    whitelistController.createEntry(req, res);
  });

  app.delete('/admin/whitelist/:id', requireAdminAuth, (req: Request, res: Response) => {
    whitelistController.deleteEntry(req, res);
  });

  // ============================================================================
  // Billing Routes (Rates & Fraud Savings)
  // ============================================================================

  app.get('/admin/billing/rates', requireAdminAuth, (req: Request, res: Response) => {
    billingController.getRates(req, res);
  });

  app.get('/admin/billing/rates/stats', requireAdminAuth, (req: Request, res: Response) => {
    billingController.getRateStats(req, res);
  });

  app.get('/admin/billing/savings', requireAdminAuth, (req: Request, res: Response) => {
    billingController.getSavings(req, res);
  });

  app.get('/admin/billing/savings/recent', requireAdminAuth, (req: Request, res: Response) => {
    billingController.getRecentSavings(req, res);
  });

  app.get('/admin/billing/cdrs', requireAdminAuth, (req: Request, res: Response) => {
    billingController.getCdrs(req, res);
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
