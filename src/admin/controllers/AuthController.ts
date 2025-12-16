/**
 * Admin Authentication Controller
 *
 * Handles login, logout, and session verification.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { validateCredentials, createAdminSession, destroyAdminSession } from '../middleware/auth.js';
import { getConfig } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export class AuthController {
  /**
   * POST /admin/auth/login
   * Authenticate admin user and create session
   */
  async login(req: Request, res: Response): Promise<void> {
    const validation = loginSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'validation_error',
        message: validation.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    const { username, password } = validation.data;

    if (!validateCredentials(username, password)) {
      logger.warn('Admin login failed: invalid credentials', {
        username,
        ip: req.ip,
      });

      // Delay response to prevent timing attacks
      await new Promise((resolve) => setTimeout(resolve, 1000));

      res.status(401).json({
        error: 'invalid_credentials',
        message: 'Invalid username or password',
      });
      return;
    }

    createAdminSession(req, username);

    logger.info('Admin login successful', {
      username,
      ip: req.ip,
    });

    const config = getConfig();
    const expiresAt = Date.now() + config.admin.sessionTtlMinutes * 60 * 1000;

    res.json({
      success: true,
      username,
      expiresAt,
    });
  }

  /**
   * POST /admin/auth/logout
   * Destroy admin session
   */
  async logout(req: Request, res: Response): Promise<void> {
    const username = req.session?.adminUsername;

    try {
      await destroyAdminSession(req);

      logger.info('Admin logout', {
        username,
        ip: req.ip,
      });

      res.json({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Admin logout failed', { error: errorMessage });
      res.status(500).json({
        error: 'logout_failed',
        message: 'Failed to logout',
      });
    }
  }

  /**
   * GET /admin/auth/session
   * Check if session is valid and return user info
   */
  async checkSession(req: Request, res: Response): Promise<void> {
    if (!req.session?.adminAuthenticated) {
      res.json({
        authenticated: false,
      });
      return;
    }

    const config = getConfig();
    const sessionAge = Date.now() - (req.session.loginTimestamp || 0);
    const maxAge = config.admin.sessionTtlMinutes * 60 * 1000;

    if (sessionAge > maxAge) {
      res.json({
        authenticated: false,
        reason: 'session_expired',
      });
      return;
    }

    const expiresAt = (req.session.loginTimestamp || 0) + maxAge;

    res.json({
      authenticated: true,
      username: req.session.adminUsername,
      expiresAt,
    });
  }
}
