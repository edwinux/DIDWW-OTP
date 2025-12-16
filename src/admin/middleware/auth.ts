/**
 * Admin Authentication Middleware
 *
 * Session-based authentication with optional IP whitelist.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getConfig } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

declare module 'express-session' {
  interface SessionData {
    adminAuthenticated: boolean;
    adminUsername: string;
    loginTimestamp: number;
  }
}

/**
 * Validate admin credentials using timing-safe comparison
 */
export function validateCredentials(username: string, password: string): boolean {
  const config = getConfig();

  if (!config.admin.password) {
    logger.warn('Admin login attempted but ADMIN_PASSWORD not configured');
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  const usernameBuffer = Buffer.from(username);
  const expectedUsernameBuffer = Buffer.from(config.admin.username);
  const passwordBuffer = Buffer.from(password);
  const expectedPasswordBuffer = Buffer.from(config.admin.password);

  // Length check first (timing-safe comparison requires equal lengths)
  const usernameMatch =
    usernameBuffer.length === expectedUsernameBuffer.length &&
    crypto.timingSafeEqual(usernameBuffer, expectedUsernameBuffer);

  const passwordMatch =
    passwordBuffer.length === expectedPasswordBuffer.length &&
    crypto.timingSafeEqual(passwordBuffer, expectedPasswordBuffer);

  return usernameMatch && passwordMatch;
}

/**
 * Check if IP is in the whitelist
 */
export function isIpWhitelisted(ip: string | undefined): boolean {
  const config = getConfig();

  // No whitelist = allow all IPs
  if (!config.admin.ipWhitelist) {
    return true;
  }

  if (!ip) {
    return false;
  }

  const whitelist = config.admin.ipWhitelist.split(',').map((s) => s.trim());

  // Direct IP match
  if (whitelist.includes(ip)) {
    return true;
  }

  // Handle IPv6-mapped IPv4 addresses (::ffff:x.x.x.x)
  const ipv4Match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match && whitelist.includes(ipv4Match[1])) {
    return true;
  }

  // Simple CIDR check for /24 and /16 ranges
  for (const entry of whitelist) {
    if (entry.includes('/')) {
      const [network, bits] = entry.split('/');
      const maskBits = parseInt(bits, 10);

      // Only support /24 and /16 for simplicity
      if (maskBits === 24 || maskBits === 16) {
        const ipParts = ip.replace(/^::ffff:/, '').split('.');
        const networkParts = network.split('.');

        if (ipParts.length === 4 && networkParts.length === 4) {
          const partsToCheck = maskBits === 24 ? 3 : 2;
          const match = ipParts.slice(0, partsToCheck).join('.') === networkParts.slice(0, partsToCheck).join('.');
          if (match) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Middleware to require admin authentication
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();

  // Check IP whitelist first
  if (!isIpWhitelisted(req.ip)) {
    logger.warn('Admin access denied: IP not whitelisted', { ip: req.ip });
    res.status(403).json({
      error: 'forbidden',
      message: 'IP address not authorized',
    });
    return;
  }

  // Check session
  if (!req.session?.adminAuthenticated) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  // Check session TTL
  const sessionAge = Date.now() - (req.session.loginTimestamp || 0);
  const maxAge = config.admin.sessionTtlMinutes * 60 * 1000;

  if (sessionAge > maxAge) {
    req.session.destroy((err) => {
      if (err) {
        logger.error('Failed to destroy expired session', { error: err.message });
      }
    });
    res.status(401).json({
      error: 'session_expired',
      message: 'Session has expired, please login again',
    });
    return;
  }

  next();
}

/**
 * Middleware to check IP whitelist only (for login endpoint)
 */
export function checkIpWhitelist(req: Request, res: Response, next: NextFunction): void {
  if (!isIpWhitelisted(req.ip)) {
    logger.warn('Admin login denied: IP not whitelisted', { ip: req.ip });
    res.status(403).json({
      error: 'forbidden',
      message: 'IP address not authorized',
    });
    return;
  }
  next();
}

/**
 * Create admin session
 */
export function createAdminSession(req: Request, username: string): void {
  req.session.adminAuthenticated = true;
  req.session.adminUsername = username;
  req.session.loginTimestamp = Date.now();
}

/**
 * Destroy admin session
 */
export function destroyAdminSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
