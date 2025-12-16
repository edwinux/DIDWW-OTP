/**
 * Configuration module
 *
 * Parses and validates environment variables using Zod.
 * Provides type-safe access to all configuration values.
 */

import { z } from 'zod';

/**
 * Voice speed options for TTS
 */
const voiceSpeedSchema = z.enum(['slow', 'medium', 'fast']).default('medium');

/**
 * Log level options
 */
const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']).default('info');

/**
 * Configuration schema with all environment variables
 */
const configSchema = z.object({
  // Required - DIDWW SIP Trunk
  didww: z.object({
    sipHost: z.string().min(1, 'DIDWW_SIP_HOST is required'),
    username: z.string().min(1, 'DIDWW_USERNAME is required'),
    password: z.string().min(1, 'DIDWW_PASSWORD is required'),
    callerId: z.string().regex(/^\d{10,15}$/, 'DIDWW_CALLER_ID must be 10-15 digits in E.164 format without +'),
    callerIdUsCanada: z.string().optional(),
  }),

  // Required - Network
  network: z.object({
    publicIp: z
      .string()
      .min(1, 'PUBLIC_IP is required')
      .regex(/^[\d.]+$|^[\da-fA-F:]+$/, 'PUBLIC_IP must be a valid IP address'),
  }),

  // Required - API Security
  api: z.object({
    secret: z.string().min(8, 'API_SECRET must be at least 8 characters'),
    port: z.coerce.number().int().min(1).max(65535).default(8080),
  }),

  // Optional - Voice Customization
  voice: z.object({
    messageTemplate: z
      .string()
      .default('Your verification code is {code}. Repeating. {code}.'),
    speed: voiceSpeedSchema,
    digitPauseMs: z.coerce.number().int().min(0).max(5000).default(500),
  }),

  // Optional - SIP/RTP Ports
  sip: z.object({
    port: z.coerce.number().int().min(1).max(65535).default(5060),
    rtpPortStart: z.coerce.number().int().min(1024).max(65535).default(10000),
    rtpPortEnd: z.coerce.number().int().min(1024).max(65535).default(10020),
  }),

  // Optional - ARI (internal Asterisk communication)
  ari: z.object({
    password: z.string().default('internal-ari-secret'),
  }),

  // Optional - Logging
  logging: z.object({
    level: logLevelSchema,
  }),

  // Database configuration
  database: z.object({
    path: z.string().default('/data/otp.db'),
  }),

  // SMS configuration (DIDWW REST API)
  sms: z.object({
    enabled: z.coerce.boolean().default(true),
    apiEndpoint: z.string().default('https://us.sms-out.didww.com/outbound_messages'),
    messageTemplate: z.string().default('Your verification code is: {code}'),
    callbackUrl: z.string().optional(),
  }),

  // Fraud detection configuration
  fraud: z.object({
    enabled: z.coerce.boolean().default(true),
    shadowBanThreshold: z.coerce.number().int().min(0).max(100).default(50),
    rateLimitPerHour: z.coerce.number().int().min(1).max(100).default(3),
    rateLimitPerMinute: z.coerce.number().int().min(1).max(10).default(1),
    circuitBreakerThreshold: z.coerce.number().int().min(1).max(20).default(5),
    circuitBreakerWindowMinutes: z.coerce.number().int().min(1).max(1440).default(60),
    circuitBreakerCooldownMinutes: z.coerce.number().int().min(1).max(1440).default(30),
    geoMatchPenalty: z.coerce.number().int().min(0).max(100).default(30),
    allowedCountries: z.string().optional(),
  }),

  // Channel configuration
  channels: z.object({
    default: z.string().default('sms,voice'),
    enableFailover: z.coerce.boolean().default(true),
  }),

  // Webhook configuration
  webhooks: z.object({
    timeout: z.coerce.number().int().min(1000).max(30000).default(5000),
    maxRetries: z.coerce.number().int().min(1).max(5).default(3),
  }),
});

/**
 * Inferred TypeScript type from the schema
 */
export type Config = z.infer<typeof configSchema>;

/**
 * Parse environment variables into config object
 */
function parseEnvVars(): Record<string, unknown> {
  return {
    didww: {
      sipHost: process.env.DIDWW_SIP_HOST,
      username: process.env.DIDWW_USERNAME,
      password: process.env.DIDWW_PASSWORD,
      callerId: process.env.DIDWW_CALLER_ID,
      callerIdUsCanada: process.env.DIDWW_CALLER_ID_US_CA,
    },
    network: {
      publicIp: process.env.PUBLIC_IP,
    },
    api: {
      secret: process.env.API_SECRET,
      port: process.env.HTTP_PORT,
    },
    voice: {
      messageTemplate: process.env.OTP_MESSAGE_TEMPLATE,
      speed: process.env.OTP_VOICE_SPEED,
      digitPauseMs: process.env.OTP_DIGIT_PAUSE_MS,
    },
    sip: {
      port: process.env.SIP_PORT,
      rtpPortStart: process.env.RTP_PORT_START,
      rtpPortEnd: process.env.RTP_PORT_END,
    },
    ari: {
      password: process.env.ARI_PASSWORD,
    },
    logging: {
      level: process.env.LOG_LEVEL,
    },
    database: {
      path: process.env.DATABASE_PATH,
    },
    sms: {
      enabled: process.env.SMS_ENABLED,
      apiEndpoint: process.env.SMS_API_ENDPOINT,
      messageTemplate: process.env.SMS_MESSAGE_TEMPLATE,
      callbackUrl: process.env.SMS_CALLBACK_URL,
    },
    fraud: {
      enabled: process.env.FRAUD_ENABLED,
      shadowBanThreshold: process.env.FRAUD_SHADOW_BAN_THRESHOLD,
      rateLimitPerHour: process.env.FRAUD_RATE_LIMIT_HOUR,
      rateLimitPerMinute: process.env.FRAUD_RATE_LIMIT_MINUTE,
      circuitBreakerThreshold: process.env.FRAUD_CIRCUIT_BREAKER_THRESHOLD,
      circuitBreakerWindowMinutes: process.env.FRAUD_CIRCUIT_BREAKER_WINDOW,
      circuitBreakerCooldownMinutes: process.env.FRAUD_CIRCUIT_BREAKER_COOLDOWN,
      geoMatchPenalty: process.env.FRAUD_GEO_MATCH_PENALTY,
      allowedCountries: process.env.FRAUD_ALLOWED_COUNTRIES,
    },
    channels: {
      default: process.env.CHANNELS_DEFAULT,
      enableFailover: process.env.CHANNELS_ENABLE_FAILOVER,
    },
    webhooks: {
      timeout: process.env.WEBHOOK_TIMEOUT,
      maxRetries: process.env.WEBHOOK_MAX_RETRIES,
    },
  };
}

/**
 * Validate that RTP port range is valid
 */
function validateRtpPortRange(config: Config): void {
  if (config.sip.rtpPortEnd <= config.sip.rtpPortStart) {
    throw new Error(
      `RTP_PORT_END (${config.sip.rtpPortEnd}) must be greater than RTP_PORT_START (${config.sip.rtpPortStart})`
    );
  }
}

/**
 * Mask sensitive values for logging
 */
function maskSecrets(config: Config): Record<string, unknown> {
  return {
    didww: {
      sipHost: config.didww.sipHost,
      username: config.didww.username,
      password: '***MASKED***',
      callerId: config.didww.callerId,
      callerIdUsCanada: config.didww.callerIdUsCanada,
    },
    network: {
      publicIp: config.network.publicIp,
    },
    api: {
      secret: '***MASKED***',
      port: config.api.port,
    },
    voice: config.voice,
    sip: config.sip,
    ari: {
      password: '***MASKED***',
    },
    logging: config.logging,
    database: config.database,
    sms: config.sms,
    fraud: config.fraud,
    channels: config.channels,
    webhooks: config.webhooks,
  };
}

/**
 * Load and validate configuration from environment variables
 * Throws on validation failure with descriptive error messages
 */
function loadConfig(): Config {
  const rawConfig = parseEnvVars();

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  const config = result.data;

  // Additional validation
  validateRtpPortRange(config);

  // Log loaded configuration (with secrets masked)
  console.log('[CONFIG] Loaded configuration:', JSON.stringify(maskSecrets(config), null, 2));

  return config;
}

/**
 * Singleton config instance
 * Loaded lazily on first access
 */
let configInstance: Config | null = null;

/**
 * Get the configuration singleton
 * Throws if configuration is invalid
 */
export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

/**
 * Reset configuration (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Check if configuration is valid without throwing
 */
export function validateConfig(): { valid: boolean; errors?: string[] } {
  try {
    const rawConfig = parseEnvVars();
    const result = configSchema.safeParse(rawConfig);

    if (!result.success) {
      return {
        valid: false,
        errors: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      };
    }

    validateRtpPortRange(result.data);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

// Export schema for external use (testing, documentation)
export { configSchema };
