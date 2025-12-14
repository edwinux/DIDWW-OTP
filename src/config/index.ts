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
