/**
 * DIDWW Voice OTP Gateway
 *
 * Main entry point - initializes configuration, ARI client, and HTTP server.
 */

import { getConfig } from './config/index.js';
import { ariManager, setupShutdownHandlers } from './ari/client.js';
import { registerStasisHandlers } from './ari/handlers.js';
import { startServer } from './server.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  logger.info('DIDWW Voice OTP Gateway starting...');

  try {
    // Load and validate configuration
    const config = getConfig();
    logger.info('Configuration loaded', { sipHost: config.didww.sipHost });

    // Set up graceful shutdown
    setupShutdownHandlers();

    // Connect to Asterisk ARI
    const client = await ariManager.connect(['otp-stasis']);

    // Register Stasis event handlers
    registerStasisHandlers(client);

    // Start HTTP server
    startServer();

    logger.info('Gateway ready');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start gateway', { error: msg });
    process.exit(1);
  }
}

main();
