/**
 * DIDWW Intelligent OTP Gateway
 *
 * Main entry point - initializes database, services, ARI client, and HTTP server.
 */

import { getConfig } from './config/index.js';
import { dbManager, runMigrations, seedAsnBlocklist, seedCallerIdRoutes } from './database/index.js';
import { ariManager } from './ari/client.js';
import { registerStasisHandlers } from './ari/handlers.js';
import { getAmiClient } from './ami/client.js';
import { registerAmiHandlers } from './ami/handlers.js';
import { OtpRequestRepository, FraudRulesRepository, WebhookLogRepository, WhitelistRepository } from './repositories/index.js';
import { SmsChannelProvider, VoiceChannelProvider } from './channels/index.js';
import { FraudEngine, WebhookService, DispatchService } from './services/index.js';
import { initializeCallerIdRouter } from './services/CallerIdRouter.js';
import { initAsnDatabase, getAsnDatabase } from './services/AsnDatabase.js';
import { createServer } from './server.js';
import { startAdminServer } from './admin/index.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  logger.info('DIDWW Intelligent OTP Gateway starting...');

  try {
    // Load and validate configuration
    const config = getConfig();
    logger.info('Configuration loaded', {
      sipHost: config.didww.sipHost,
      smsEnabled: config.sms.enabled,
      fraudEnabled: config.fraud.enabled,
    });

    // Initialize database
    logger.info('Initializing database...', { path: config.database.path });
    dbManager.connect(config.database.path);
    runMigrations();
    seedAsnBlocklist();
    seedCallerIdRoutes();

    // Initialize caller ID router (loads routes from database)
    initializeCallerIdRouter();
    logger.info('Caller ID router initialized');

    // Initialize ASN database for fraud detection
    logger.info('Initializing ASN database...', { enabled: config.asn.enabled });
    await initAsnDatabase({
      enabled: config.asn.enabled,
      dataPath: config.asn.dataPath,
      updateIntervalHours: config.asn.updateIntervalHours,
      updateRateLimitHours: config.asn.updateRateLimitHours,
      unresolvedThreshold: config.asn.unresolvedThreshold,
      cdnUrl: config.asn.cdnUrl,
      shadowBanUnresolved: config.asn.shadowBanUnresolved,
    });

    // Initialize repositories
    const otpRepo = new OtpRequestRepository();
    const fraudRepo = new FraudRulesRepository();
    const webhookLogRepo = new WebhookLogRepository();
    const whitelistRepo = new WhitelistRepository();

    // Initialize channel providers
    const channelProviders = [];

    // SMS channel (if enabled and credentials configured)
    if (config.sms.enabled && config.sms.username && config.sms.password) {
      const smsProvider = new SmsChannelProvider({
        apiEndpoint: config.sms.apiEndpoint,
        username: config.sms.username,
        password: config.sms.password,
        messageTemplate: config.sms.messageTemplate,
        callbackUrl: config.sms.callbackUrl,
      });
      channelProviders.push(smsProvider);
      logger.info('SMS channel enabled');
    } else if (config.sms.enabled) {
      logger.warn('SMS enabled but credentials not configured (SMS_USERNAME/SMS_PASSWORD)');
    }

    // Voice channel (always available if ARI connects)
    const voiceProvider = new VoiceChannelProvider({
      messageTemplate: config.voice.messageTemplate,
      speed: config.voice.speed,
      timeout: 30,
    });
    channelProviders.push(voiceProvider);

    // Initialize services
    const fraudEngine = new FraudEngine(fraudRepo, otpRepo, whitelistRepo, {
      enabled: config.fraud.enabled,
      shadowBanThreshold: config.fraud.shadowBanThreshold,
      rateLimitPerHour: config.fraud.rateLimitPerHour,
      rateLimitPerMinute: config.fraud.rateLimitPerMinute,
      circuitBreakerThreshold: config.fraud.circuitBreakerThreshold,
      circuitBreakerWindowMinutes: config.fraud.circuitBreakerWindowMinutes,
      circuitBreakerCooldownMinutes: config.fraud.circuitBreakerCooldownMinutes,
      geoMatchPenalty: config.fraud.geoMatchPenalty,
      allowedCountries: config.fraud.allowedCountries?.split(',').map((c) => c.trim()),
    });

    const webhookService = new WebhookService(webhookLogRepo, {
      timeout: config.webhooks.timeout,
      maxRetries: config.webhooks.maxRetries,
    });

    const dispatchService = new DispatchService(
      channelProviders,
      fraudEngine,
      webhookService,
      otpRepo,
      {
        defaultChannels: config.channels.default.split(',').map((c) => c.trim()) as ('sms' | 'voice')[],
        enableFailover: config.channels.enableFailover,
      }
    );

    // Set up graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down...`);
      await ariManager.disconnect();
      getAsnDatabase().stopPeriodicUpdates();
      dbManager.close();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Connect to Asterisk ARI
    const client = await ariManager.connect(['otp-stasis']);

    // Register Stasis event handlers
    registerStasisHandlers(client);

    // Connect to AMI for SIP failure detection (optional)
    if (config.ami.enabled && config.ami.secret) {
      try {
        const amiClient = getAmiClient();
        await amiClient.connect({
          host: config.ami.host,
          port: config.ami.port,
          username: config.ami.username,
          secret: config.ami.secret,
        });
        registerAmiHandlers();
        logger.info('AMI connected for SIP failure detection');
      } catch (amiError) {
        // AMI is optional - log warning but don't fail startup
        const msg = amiError instanceof Error ? amiError.message : String(amiError);
        logger.warn('AMI connection failed (SIP failure detection disabled)', { error: msg });
      }
    }

    // Create and start HTTP server
    const app = createServer(dispatchService);
    const port = config.api.port;

    app.listen(port, () => {
      logger.info(`HTTP server listening on port ${port}`);
    });

    // Start admin server if enabled
    startAdminServer(dispatchService);

    logger.info('Gateway ready', {
      channels: channelProviders.map((p) => p.channelType),
      fraudEnabled: config.fraud.enabled,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to start gateway', { error: msg });
    process.exit(1);
  }
}

main();
