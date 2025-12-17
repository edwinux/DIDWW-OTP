/**
 * Caller ID Routing Controller
 *
 * Admin API endpoints for managing prefix-based caller ID routes.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  CallerIdRoutingRepository,
  normalizePrefix,
  validateVoiceCallerId,
} from '../../repositories/CallerIdRoutingRepository.js';
import type { RoutingChannel } from '../../repositories/CallerIdRoutingRepository.js';
import { getCallerIdRouter } from '../../services/CallerIdRouter.js';
import { logger } from '../../utils/logger.js';

/**
 * Validation schemas
 */
const createRouteSchema = z.object({
  channel: z.enum(['sms', 'voice']),
  prefix: z.string().min(1, 'Prefix is required'),
  caller_id: z.string().min(1, 'Caller ID is required'),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
});

const updateRouteSchema = z.object({
  prefix: z.string().min(1).optional(),
  caller_id: z.string().min(1).optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
});

const testRoutingSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
});

/**
 * Caller ID Routing Controller
 */
export class CallerIdRoutingController {
  private repository: CallerIdRoutingRepository;

  constructor() {
    this.repository = new CallerIdRoutingRepository();
  }

  /**
   * GET /admin/caller-id-routes
   * List all routes, optionally filtered by channel
   */
  async getRoutes(req: Request, res: Response): Promise<void> {
    try {
      const channel = req.query.channel as RoutingChannel | undefined;

      let routes;
      if (channel && (channel === 'sms' || channel === 'voice')) {
        routes = this.repository.findByChannel(channel);
      } else {
        routes = this.repository.findAll();
      }

      res.json({
        data: routes,
        meta: {
          total: routes.length,
          sms: this.repository.countByChannel('sms'),
          voice: this.repository.countByChannel('voice'),
        },
      });
    } catch (error) {
      logger.error('Failed to get caller ID routes', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to retrieve routes',
      });
    }
  }

  /**
   * GET /admin/caller-id-routes/:id
   * Get a single route by ID
   */
  async getRoute(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'invalid_id', message: 'Invalid route ID' });
        return;
      }

      const route = this.repository.findById(id);
      if (!route) {
        res.status(404).json({ error: 'not_found', message: 'Route not found' });
        return;
      }

      res.json({ data: route });
    } catch (error) {
      logger.error('Failed to get caller ID route', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to retrieve route',
      });
    }
  }

  /**
   * POST /admin/caller-id-routes
   * Create a new route
   */
  async createRoute(req: Request, res: Response): Promise<void> {
    try {
      const validation = createRouteSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'validation_error',
          message: validation.error.issues.map((i) => i.message).join(', '),
        });
        return;
      }

      const { channel, prefix, caller_id, description, enabled } = validation.data;

      // Validate voice caller ID format
      if (channel === 'voice' && !validateVoiceCallerId(caller_id)) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Voice caller ID must be 10-15 digits',
        });
        return;
      }

      // Check for duplicate prefix
      const normalizedPrefix = normalizePrefix(prefix);
      if (this.repository.prefixExists(channel, normalizedPrefix)) {
        res.status(409).json({
          error: 'duplicate_prefix',
          message: `A route for prefix "${normalizedPrefix}" already exists for ${channel} channel`,
        });
        return;
      }

      const route = this.repository.create({
        channel,
        prefix,
        caller_id,
        description,
        enabled,
      });

      logger.info('Created caller ID route', { id: route.id, channel, prefix: normalizedPrefix });

      res.status(201).json({ data: route });
    } catch (error) {
      logger.error('Failed to create caller ID route', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to create route',
      });
    }
  }

  /**
   * PUT /admin/caller-id-routes/:id
   * Update an existing route
   */
  async updateRoute(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'invalid_id', message: 'Invalid route ID' });
        return;
      }

      const existing = this.repository.findById(id);
      if (!existing) {
        res.status(404).json({ error: 'not_found', message: 'Route not found' });
        return;
      }

      const validation = updateRouteSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'validation_error',
          message: validation.error.issues.map((i) => i.message).join(', '),
        });
        return;
      }

      const { prefix, caller_id, description, enabled } = validation.data;

      // Validate voice caller ID format if updating caller_id
      if (caller_id && existing.channel === 'voice' && !validateVoiceCallerId(caller_id)) {
        res.status(400).json({
          error: 'validation_error',
          message: 'Voice caller ID must be 10-15 digits',
        });
        return;
      }

      // Check for duplicate prefix if updating prefix
      if (prefix) {
        const normalizedPrefix = normalizePrefix(prefix);
        if (this.repository.prefixExists(existing.channel, normalizedPrefix, id)) {
          res.status(409).json({
            error: 'duplicate_prefix',
            message: `A route for prefix "${normalizedPrefix}" already exists for ${existing.channel} channel`,
          });
          return;
        }
      }

      const route = this.repository.update(id, { prefix, caller_id, description, enabled });

      logger.info('Updated caller ID route', { id });

      res.json({ data: route });
    } catch (error) {
      logger.error('Failed to update caller ID route', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to update route',
      });
    }
  }

  /**
   * DELETE /admin/caller-id-routes/:id
   * Delete a route
   */
  async deleteRoute(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'invalid_id', message: 'Invalid route ID' });
        return;
      }

      const deleted = this.repository.delete(id);
      if (!deleted) {
        res.status(404).json({ error: 'not_found', message: 'Route not found' });
        return;
      }

      logger.info('Deleted caller ID route', { id });

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to delete caller ID route', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to delete route',
      });
    }
  }

  /**
   * POST /admin/caller-id-routes/:id/toggle
   * Toggle route enabled status
   */
  async toggleRoute(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'invalid_id', message: 'Invalid route ID' });
        return;
      }

      const route = this.repository.toggleEnabled(id);
      if (!route) {
        res.status(404).json({ error: 'not_found', message: 'Route not found' });
        return;
      }

      logger.info('Toggled caller ID route', { id, enabled: route.enabled });

      res.json({ data: route });
    } catch (error) {
      logger.error('Failed to toggle caller ID route', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to toggle route',
      });
    }
  }

  /**
   * POST /admin/caller-id-routes/reload
   * Reload routes cache from database
   */
  async reloadRoutes(_req: Request, res: Response): Promise<void> {
    try {
      const router = getCallerIdRouter();
      router.reloadRoutes();

      const stats = router.getStats();

      logger.info('Reloaded caller ID routes', stats);

      res.json({
        success: true,
        message: 'Routes reloaded successfully',
        stats,
      });
    } catch (error) {
      logger.error('Failed to reload caller ID routes', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to reload routes',
      });
    }
  }

  /**
   * POST /admin/caller-id-routes/test
   * Test routing for a phone number
   */
  async testRouting(req: Request, res: Response): Promise<void> {
    try {
      const validation = testRoutingSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          error: 'validation_error',
          message: validation.error.issues.map((i) => i.message).join(', '),
        });
        return;
      }

      const { phone } = validation.data;
      const router = getCallerIdRouter();
      const result = router.testRouting(phone);

      res.json({
        phone: phone.replace(/^\+/, ''),
        sms: result.sms,
        voice: result.voice,
      });
    } catch (error) {
      logger.error('Failed to test caller ID routing', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to test routing',
      });
    }
  }

  /**
   * GET /admin/caller-id-routes/stats
   * Get routing statistics
   */
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const router = getCallerIdRouter();
      const cacheStats = router.getStats();

      res.json({
        cache: cacheStats,
        database: {
          sms: this.repository.countByChannel('sms'),
          voice: this.repository.countByChannel('voice'),
        },
      });
    } catch (error) {
      logger.error('Failed to get caller ID routing stats', { error });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to get stats',
      });
    }
  }
}
