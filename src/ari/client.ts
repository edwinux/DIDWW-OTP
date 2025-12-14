/**
 * ARI Client
 *
 * Manages WebSocket connection to Asterisk REST Interface.
 * Provides auto-reconnect with exponential backoff and connection state tracking.
 */

import Ari from 'ari-client';
import type { Client as AriClient } from 'ari-client';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Connection state for the ARI client
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/**
 * ARI connection configuration
 */
interface AriConnectionConfig {
  url: string;
  username: string;
  password: string;
}

/**
 * Reconnection settings
 */
const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * ARI Client Manager
 * Handles connection lifecycle, reconnection, and state tracking
 */
class AriClientManager {
  private client: AriClient | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isShuttingDown = false;
  private config: AriConnectionConfig | null = null;
  private stasisApps: string[] = [];

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.client !== null;
  }

  /**
   * Get the underlying ARI client (throws if not connected)
   */
  getClient(): AriClient {
    if (!this.client || this.state !== 'connected') {
      throw new Error('ARI client is not connected');
    }
    return this.client;
  }

  /**
   * Initialize and connect to Asterisk ARI
   */
  async connect(stasisApps: string[] = ['otp-stasis']): Promise<AriClient> {
    if (this.state === 'connected' && this.client) {
      logger.warn('ARI client already connected');
      return this.client;
    }

    const config = getConfig();
    this.config = {
      url: 'http://localhost:8088',
      username: 'ariuser',
      password: config.ari.password,
    };
    this.stasisApps = stasisApps;

    return this.doConnect();
  }

  /**
   * Perform the actual connection
   */
  private async doConnect(): Promise<AriClient> {
    if (!this.config) {
      throw new Error('ARI client not configured. Call connect() first.');
    }

    this.setState('connecting');
    logger.info('Connecting to ARI...', { url: this.config.url });

    try {
      this.client = await Ari.connect(
        this.config.url,
        this.config.username,
        this.config.password
      );

      // Set up event handlers
      this.setupEventHandlers();

      // Start Stasis applications
      if (this.stasisApps.length > 0) {
        this.client.start(this.stasisApps);
        logger.info('Started Stasis applications', { apps: this.stasisApps });
      }

      this.setState('connected');
      this.reconnectAttempt = 0;
      logger.info('Connected to ARI successfully');

      return this.client;
    } catch (error) {
      this.setState('disconnected');
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to connect to ARI', { error: message });

      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }

      throw error;
    }
  }

  /**
   * Set up event handlers for the ARI client
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Handle WebSocket close
    this.client.on('WebSocketReconnecting', () => {
      logger.warn('ARI WebSocket reconnecting...');
      this.setState('connecting');
    });

    this.client.on('WebSocketConnected', () => {
      logger.info('ARI WebSocket reconnected');
      this.setState('connected');
      this.reconnectAttempt = 0;
    });

    this.client.on('WebSocketMaxRetries', () => {
      logger.error('ARI WebSocket max retries reached');
      this.setState('disconnected');
      if (!this.isShuttingDown) {
        this.scheduleReconnect();
      }
    });
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimeout) {
      return;
    }

    const delay = Math.min(
      RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.backoffMultiplier, this.reconnectAttempt),
      RECONNECT_CONFIG.maxDelayMs
    );

    this.reconnectAttempt++;
    logger.info(`Scheduling ARI reconnect in ${delay}ms`, { attempt: this.reconnectAttempt });

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      try {
        await this.doConnect();
      } catch {
        // Error already logged in doConnect
      }
    }, delay);
  }

  /**
   * Update connection state
   */
  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      logger.debug('ARI connection state changed', { from: this.state, to: newState });
      this.state = newState;
    }
  }

  /**
   * Gracefully disconnect from ARI
   */
  async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.client) {
      try {
        // Stop Stasis applications
        if (this.stasisApps.length > 0) {
          this.client.stop();
        }
        logger.info('Disconnected from ARI');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('Error during ARI disconnect', { error: message });
      }
      this.client = null;
    }

    this.setState('disconnected');
  }

  /**
   * Reset for testing
   */
  reset(): void {
    this.client = null;
    this.state = 'disconnected';
    this.reconnectAttempt = 0;
    this.isShuttingDown = false;
    this.config = null;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
}

/**
 * Singleton ARI client manager instance
 */
export const ariManager = new AriClientManager();

/**
 * Convenience function to get current connection state
 */
export function getAriState(): ConnectionState {
  return ariManager.getState();
}

/**
 * Convenience function to check if ARI is connected
 */
export function isAriConnected(): boolean {
  return ariManager.isConnected();
}

/**
 * Convenience function to get the ARI client
 */
export function getAriClient(): AriClient {
  return ariManager.getClient();
}

/**
 * Set up graceful shutdown handlers
 */
export function setupShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down ARI client...`);
    await ariManager.disconnect();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
