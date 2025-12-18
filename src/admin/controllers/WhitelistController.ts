/**
 * Whitelist Controller
 *
 * Admin API endpoints for managing fraud whitelist entries.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  WhitelistRepository,
  validateIp,
  validatePhone,
} from '../../repositories/WhitelistRepository.js';
import type { WhitelistType } from '../../repositories/WhitelistRepository.js';
import { logger } from '../../utils/logger.js';

/**
 * Validation schemas
 */
const createWhitelistSchema = z.object({
  type: z.enum(['ip', 'phone']),
  value: z.string().min(1, 'Value is required'),
  description: z.string().optional(),
});

/**
 * Whitelist Controller
 */
export class WhitelistController {
  private repository: WhitelistRepository;

  constructor() {
    this.repository = new WhitelistRepository();
  }

  /**
   * GET /admin/whitelist
   * List all whitelist entries, optionally filtered by type
   */
  async getEntries(req: Request, res: Response): Promise<void> {
    try {
      const type = req.query.type as WhitelistType | undefined;

      let entries;
      if (type && (type === 'ip' || type === 'phone')) {
        entries = this.repository.findByType(type);
      } else {
        entries = this.repository.findAll();
      }

      res.json({
        data: entries,
        meta: {
          total: entries.length,
          ip: this.repository.countByType('ip'),
          phone: this.repository.countByType('phone'),
        },
      });
    } catch (error) {
      logger.error('Failed to get whitelist entries', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to retrieve whitelist entries',
      });
    }
  }

  /**
   * POST /admin/whitelist
   * Create a new whitelist entry
   */
  async createEntry(req: Request, res: Response): Promise<void> {
    try {
      const validation = createWhitelistSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'validation_error',
          message: validation.error.issues.map((i) => i.message).join(', '),
        });
        return;
      }

      const { type, value, description } = validation.data;

      // Validate format based on type
      if (type === 'ip' && !validateIp(value)) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Invalid IP address format. Use IPv4 format (e.g., 192.168.1.1)',
        });
        return;
      }

      if (type === 'phone' && !validatePhone(value)) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Invalid phone number format. Use E.164 format (e.g., +14155551234)',
        });
        return;
      }

      // Check for duplicate
      if (this.repository.exists(type, value)) {
        res.status(409).json({
          error: 'duplicate_entry',
          message: `This ${type} is already whitelisted`,
        });
        return;
      }

      const entry = this.repository.create({ type, value, description });

      logger.info('Created whitelist entry', { id: entry.id, type, value: type === 'phone' ? value.slice(0, 5) + '***' : value });

      res.status(201).json({ data: entry });
    } catch (error) {
      logger.error('Failed to create whitelist entry', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to create whitelist entry',
      });
    }
  }

  /**
   * DELETE /admin/whitelist/:id
   * Delete a whitelist entry
   */
  async deleteEntry(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'invalid_id', message: 'Invalid entry ID' });
        return;
      }

      const entry = this.repository.findById(id);
      if (!entry) {
        res.status(404).json({ error: 'not_found', message: 'Entry not found' });
        return;
      }

      const deleted = this.repository.delete(id);
      if (!deleted) {
        res.status(404).json({ error: 'not_found', message: 'Entry not found' });
        return;
      }

      logger.info('Deleted whitelist entry', { id, type: entry.type, value: entry.type === 'phone' ? entry.value.slice(0, 5) + '***' : entry.value });

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete whitelist entry', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to delete whitelist entry',
      });
    }
  }
}
