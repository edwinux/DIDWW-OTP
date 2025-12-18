/**
 * Caller ID Router Service
 *
 * In-memory cached routing service for prefix-based caller ID selection.
 * Uses longest-prefix-wins algorithm with support for '*' wildcard as default.
 */

import { CallerIdRoutingRepository } from '../repositories/CallerIdRoutingRepository.js';
import type { RoutingChannel } from '../repositories/CallerIdRoutingRepository.js';
import { logger } from '../utils/logger.js';

/**
 * Cached route entry (prefix and caller ID only)
 */
interface CachedRoute {
  prefix: string;
  callerId: string;
}

/**
 * Caller ID Router with in-memory cache
 */
export class CallerIdRouter {
  private repository: CallerIdRoutingRepository;
  private cache: Map<RoutingChannel, CachedRoute[]>;
  private initialized: boolean = false;

  constructor(repository?: CallerIdRoutingRepository) {
    this.repository = repository || new CallerIdRoutingRepository();
    this.cache = new Map();
  }

  /**
   * Initialize the router by loading routes into cache
   */
  initialize(): void {
    if (this.initialized) return;
    this.loadRoutes();
    this.initialized = true;
  }

  /**
   * Load all enabled routes into cache, sorted by prefix length (longest first)
   */
  private loadRoutes(): void {
    const channels: RoutingChannel[] = ['sms', 'voice'];

    for (const channel of channels) {
      const routes = this.repository.findEnabledByChannel(channel);

      // Sort by prefix length descending, with '*' always last
      const sortedRoutes = routes
        .map((r) => ({ prefix: r.prefix, callerId: r.caller_id }))
        .sort((a, b) => {
          // '*' always comes last
          if (a.prefix === '*') return 1;
          if (b.prefix === '*') return -1;
          // Otherwise sort by length descending
          return b.prefix.length - a.prefix.length;
        });

      this.cache.set(channel, sortedRoutes);
      logger.info('Loaded caller ID routes', { channel, count: sortedRoutes.length });
    }
  }

  /**
   * Reload all routes from database (hot-reload)
   */
  reloadRoutes(): void {
    logger.info('Reloading caller ID routes...');
    this.cache.clear();
    this.loadRoutes();
    logger.info('Caller ID routes reloaded');
  }

  /**
   * Get caller ID for a phone number on a specific channel
   *
   * Uses longest-prefix-wins algorithm:
   * 1. Normalize the phone number
   * 2. Try each prefix in order (longest first)
   * 3. Return first match, or null if none
   *
   * @param channel - The channel (sms or voice)
   * @param phone - The destination phone number (with or without +)
   * @returns The caller ID to use, or null if no route matches
   */
  getCallerId(channel: RoutingChannel, phone: string): string | null {
    if (!this.initialized) {
      this.initialize();
    }

    const routes = this.cache.get(channel);
    if (!routes || routes.length === 0) {
      logger.warn('No caller ID routes configured', { channel });
      return null;
    }

    // Normalize phone: remove + prefix
    const normalizedPhone = phone.replace(/^\+/, '');

    // Find first matching route (they're sorted longest-first, with '*' last)
    for (const route of routes) {
      if (route.prefix === '*') {
        // Wildcard matches everything
        logger.debug('Caller ID matched wildcard', { channel, phone: normalizedPhone, callerId: route.callerId });
        return route.callerId;
      }

      if (normalizedPhone.startsWith(route.prefix)) {
        logger.debug('Caller ID matched prefix', {
          channel,
          phone: normalizedPhone,
          prefix: route.prefix,
          callerId: route.callerId,
        });
        return route.callerId;
      }
    }

    logger.warn('No caller ID route matched', { channel, phone: normalizedPhone });
    return null;
  }

  /**
   * Test routing for a phone number without making a call
   * Returns the matched route details for both channels
   */
  testRouting(phone: string): { sms: { prefix: string; callerId: string } | null; voice: { prefix: string; callerId: string } | null } {
    if (!this.initialized) {
      this.initialize();
    }

    const normalizedPhone = phone.replace(/^\+/, '');
    const result: { sms: { prefix: string; callerId: string } | null; voice: { prefix: string; callerId: string } | null } = {
      sms: null,
      voice: null,
    };

    for (const channel of ['sms', 'voice'] as RoutingChannel[]) {
      const routes = this.cache.get(channel);
      if (!routes) continue;

      for (const route of routes) {
        if (route.prefix === '*' || normalizedPhone.startsWith(route.prefix)) {
          result[channel] = { prefix: route.prefix, callerId: route.callerId };
          break;
        }
      }
    }

    return result;
  }

  /**
   * Get cache statistics
   */
  getStats(): { sms: number; voice: number } {
    return {
      sms: this.cache.get('sms')?.length || 0,
      voice: this.cache.get('voice')?.length || 0,
    };
  }

  /**
   * Check if router is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Singleton instance
 */
let instance: CallerIdRouter | null = null;

/**
 * Get the CallerIdRouter singleton
 */
export function getCallerIdRouter(): CallerIdRouter {
  if (!instance) {
    instance = new CallerIdRouter();
  }
  return instance;
}

/**
 * Initialize the CallerIdRouter singleton
 * Call this during application startup after database is ready
 */
export function initializeCallerIdRouter(): void {
  getCallerIdRouter().initialize();
}

/**
 * Reset the singleton (for testing)
 */
export function resetCallerIdRouter(): void {
  instance = null;
}
