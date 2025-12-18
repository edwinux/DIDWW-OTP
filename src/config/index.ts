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
    // Caller IDs now managed via database (Admin UI -> Settings -> Caller ID Routes)
    // These env vars are deprecated and ignored
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

  // SMS configuration (DIDWW REST API - separate credentials from SIP)
  sms: z.object({
    enabled: z.coerce.boolean().default(true),
    apiEndpoint: z.string().default('https://us.sms-out.didww.com/outbound_messages'),
    username: z.string().optional(),
    password: z.string().optional(),
    // Caller IDs now managed via database (Admin UI -> Settings -> Caller ID Routes)
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

  // Admin UI configuration
  admin: z.object({
    enabled: z.coerce.boolean().default(false),
    username: z.string().min(1).default('admin'),
    password: z.string().min(8).optional(),
    sessionSecret: z.string().min(16).optional(),
    ipWhitelist: z.string().optional(), // Comma-separated IPs or CIDR ranges
    sessionTtlMinutes: z.coerce.number().int().min(5).max(10080).default(480), // 8 hours default
    port: z.coerce.number().int().min(1).max(65535).default(80),
  }),

  // AMI (Asterisk Manager Interface) configuration for SIP failure detection
  ami: z.object({
    enabled: z.coerce.boolean().default(false),
    host: z.string().default('localhost'),
    port: z.coerce.number().int().min(1).max(65535).default(5038),
    username: z.string().default('admin'),
    secret: z.string().optional(),
  }),

  // ASN Database configuration for fraud detection
  asn: z.object({
    enabled: z.coerce.boolean().default(true),
    dataPath: z.string().default('/data/asn.mmdb').refine(
      (path) => path.startsWith('/data/') || path.startsWith('./data/'),
      { message: 'ASN_DATA_PATH must be within /data/ directory for security' }
    ),
    updateIntervalHours: z.coerce.number().int().min(1).max(8760).default(168), // Weekly
    updateRateLimitHours: z.coerce.number().int().min(0).max(24).default(1), // Max once per hour
    unresolvedThreshold: z.coerce.number().int().min(1).max(10000).default(100),
    cdnUrl: z.string().default('https://cdn.jsdelivr.net/npm/@ip-location-db/asn-mmdb/asn.mmdb'),
    shadowBanUnresolved: z.coerce.boolean().default(true), // Shadow-ban if ASN unresolved after update
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
      // Caller IDs now managed via database
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
      username: process.env.SMS_USERNAME,
      password: process.env.SMS_PASSWORD,
      // Caller IDs now managed via database
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
    admin: {
      enabled: process.env.ADMIN_ENABLED,
      username: process.env.ADMIN_USERNAME,
      password: process.env.ADMIN_PASSWORD,
      sessionSecret: process.env.ADMIN_SESSION_SECRET,
      ipWhitelist: process.env.ADMIN_IP_WHITELIST,
      sessionTtlMinutes: process.env.ADMIN_SESSION_TTL,
      port: process.env.ADMIN_PORT,
    },
    ami: {
      enabled: process.env.AMI_ENABLED,
      host: process.env.AMI_HOST,
      port: process.env.AMI_PORT,
      username: process.env.AMI_USERNAME,
      secret: process.env.AMI_SECRET,
    },
    asn: {
      enabled: process.env.ASN_ENABLED,
      dataPath: process.env.ASN_DATA_PATH,
      updateIntervalHours: process.env.ASN_UPDATE_INTERVAL_HOURS,
      updateRateLimitHours: process.env.ASN_UPDATE_RATE_LIMIT_HOURS,
      unresolvedThreshold: process.env.ASN_UNRESOLVED_THRESHOLD,
      cdnUrl: process.env.ASN_CDN_URL,
      shadowBanUnresolved: process.env.ASN_SHADOW_BAN_UNRESOLVED,
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
    sms: {
      ...config.sms,
      password: config.sms.password ? '***MASKED***' : undefined,
    },
    fraud: config.fraud,
    channels: config.channels,
    webhooks: config.webhooks,
    admin: {
      ...config.admin,
      password: config.admin.password ? '***MASKED***' : undefined,
      sessionSecret: config.admin.sessionSecret ? '***MASKED***' : undefined,
    },
    asn: config.asn,
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
