/**
 * Fraud Engine
 *
 * Core fraud detection with shadow-ban support.
 * ALL fraud rejections return fake 200 OK to hide detection.
 */

import { FraudRulesRepository } from '../repositories/FraudRulesRepository.js';
import { OtpRequestRepository } from '../repositories/OtpRequestRepository.js';
import { WhitelistRepository } from '../repositories/WhitelistRepository.js';
import { getCountryFromIp, getCountryFromPhone, getPhonePrefix, resolveAsnFromIp, shouldShadowBanUnresolvedAsn } from '../utils/geoip.js';
import { getIpSubnet } from '../utils/ipv6.js';
import { logger } from '../utils/logger.js';
import { getPhoneNumberService } from './PhoneNumberService.js';

/**
 * Fraud check request
 */
export interface FraudCheckRequest {
  phone: string;
  ip: string;
  sessionId?: string;
}

/**
 * Fraud check result
 */
export interface FraudCheckResult {
  allowed: boolean;
  shadowBan: boolean;
  score: number;
  reasons: string[];
  ipSubnet: string;
  ipCountry: string | null;
  phoneCountry: string | null;
  phonePrefix: string | null;
  asn: number | null;
}

/**
 * Fraud engine configuration
 */
export interface FraudEngineConfig {
  enabled: boolean;
  shadowBanThreshold: number;
  rateLimitPerHour: number;
  rateLimitPerMinute: number;
  circuitBreakerThreshold: number;
  circuitBreakerWindowMinutes: number;
  circuitBreakerCooldownMinutes: number;
  geoMatchPenalty: number;
  allowedCountries?: string[];
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: FraudEngineConfig = {
  enabled: true,
  shadowBanThreshold: 50,
  rateLimitPerHour: 3,
  rateLimitPerMinute: 1,
  circuitBreakerThreshold: 5,
  circuitBreakerWindowMinutes: 60,
  circuitBreakerCooldownMinutes: 30,
  geoMatchPenalty: 30,
};

/**
 * Fraud Engine
 */
export class FraudEngine {
  private fraudRepo: FraudRulesRepository;
  private otpRepo: OtpRequestRepository;
  private whitelistRepo: WhitelistRepository;
  private config: FraudEngineConfig;

  constructor(
    fraudRepo: FraudRulesRepository,
    otpRepo: OtpRequestRepository,
    whitelistRepo: WhitelistRepository,
    config?: Partial<FraudEngineConfig>
  ) {
    this.fraudRepo = fraudRepo;
    this.otpRepo = otpRepo;
    this.whitelistRepo = whitelistRepo;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluate fraud risk for a request
   * ALWAYS returns shadowBan=true for detected fraud (never reveal detection)
   *
   * Now async to support ASN database updates when IP is unresolved:
   * 1. Attempt ASN lookup
   * 2. If unresolved, queue request and trigger DB update (rate-limited)
   * 3. Retry lookup after update
   * 4. If still unresolved, shadow-ban (configurable)
   */
  async evaluate(request: FraudCheckRequest): Promise<FraudCheckResult> {
    const { phone, ip } = request;
    const ipSubnet = getIpSubnet(ip);
    const ipCountry = getCountryFromIp(ip);
    const phoneCountry = getCountryFromPhone(phone);
    const phonePrefix = getPhonePrefix(phone);

    // Get ASN with automatic database update on miss
    let asnResult: { resolved: boolean; asn: number | null; organization: string | null };
    try {
      asnResult = await resolveAsnFromIp(ip);
    } catch (error) {
      logger.error('ASN resolution failed', { ip, error: error instanceof Error ? error.message : String(error) });
      asnResult = { resolved: false, asn: null, organization: null };
    }
    const asn = asnResult.asn;

    let score = 0;
    const reasons: string[] = [];

    // If fraud detection is disabled, allow all
    if (!this.config.enabled) {
      return {
        allowed: true,
        shadowBan: false,
        score: 0,
        reasons: [],
        ipSubnet,
        ipCountry,
        phoneCountry,
        phonePrefix,
        asn,
      };
    }

    // Whitelist check: bypass all fraud rules for whitelisted IPs or phones
    if (
      this.whitelistRepo.isWhitelisted('ip', ip) ||
      this.whitelistRepo.isWhitelisted('phone', phone)
    ) {
      logger.info('Fraud: Whitelisted request bypass', {
        ip,
        ipWhitelisted: this.whitelistRepo.isWhitelisted('ip', ip),
        phoneWhitelisted: this.whitelistRepo.isWhitelisted('phone', phone),
        phone: phone.slice(0, 5) + '***',
      });

      return {
        allowed: true,
        shadowBan: false,
        score: 0,
        reasons: ['whitelisted'],
        ipSubnet,
        ipCountry,
        phoneCountry,
        phonePrefix,
        asn,
      };
    }

    // Rule 0: Invalid phone number (instant shadow-ban)
    const phoneService = getPhoneNumberService();
    if (!phoneService.isValid(phone)) {
      score = 100;
      reasons.push('invalid_phone_number');

      logger.warn('FRAUD: Invalid phone number', {
        ip,
        ipSubnet,
        phone: phone.slice(0, 5) + '***',
      });

      // Track invalid attempts for IP fraud scoring
      this.fraudRepo.recordFailedRequest(ipSubnet);
      this.fraudRepo.incrementFailures(`ip:${ipSubnet}`);

      return {
        allowed: false,
        shadowBan: true,
        score,
        reasons,
        ipSubnet,
        ipCountry,
        phoneCountry,
        phonePrefix,
        asn,
      };
    }

    // Rule 1: Unresolved ASN after update attempt (suspicious - potential new VPN/datacenter)
    if (!asnResult.resolved && shouldShadowBanUnresolvedAsn()) {
      score = 100;
      reasons.push('asn_unresolved_after_update');

      logger.warn('FRAUD: ASN unresolved after database update', {
        ip,
        ipSubnet,
        phone: phone.slice(0, 5) + '***',
      });

      return {
        allowed: false,
        shadowBan: true,
        score,
        reasons,
        ipSubnet,
        ipCountry,
        phoneCountry,
        phonePrefix,
        asn,
      };
    }

    // Rule 2: ASN Blocklist (instant shadow-ban, zero tolerance)
    if (asn && this.fraudRepo.isAsnBlocked(asn)) {
      const asnEntry = this.fraudRepo.getAsnEntry(asn);
      score = 100;
      reasons.push(`asn_blocked:${asn}:${asnEntry?.provider || 'unknown'}`);

      logger.warn('FRAUD: ASN blocked', {
        ip,
        ipSubnet,
        asn,
        provider: asnEntry?.provider,
        phone: phone.slice(0, 5) + '***',
      });

      return {
        allowed: false,
        shadowBan: true,
        score,
        reasons,
        ipSubnet,
        ipCountry,
        phoneCountry,
        phonePrefix,
        asn,
      };
    }

    // Rule 3: Honeypot check (previously shadow-banned IP)
    if (this.fraudRepo.isHoneypot(ipSubnet)) {
      score = 100;
      reasons.push('honeypot_ip');

      logger.warn('FRAUD: Honeypot IP', {
        ip,
        ipSubnet,
        phone: phone.slice(0, 5) + '***',
      });

      return {
        allowed: false,
        shadowBan: true,
        score,
        reasons,
        ipSubnet,
        ipCountry,
        phoneCountry,
        phonePrefix,
        asn,
      };
    }

    // Rule 4: IP banned
    if (this.fraudRepo.isIpBanned(ipSubnet)) {
      score = 100;
      reasons.push('ip_banned');

      logger.warn('FRAUD: IP banned', {
        ip,
        ipSubnet,
        phone: phone.slice(0, 5) + '***',
      });

      return {
        allowed: false,
        shadowBan: true,
        score,
        reasons,
        ipSubnet,
        ipCountry,
        phoneCountry,
        phonePrefix,
        asn,
      };
    }

    // Rule 5: Rate limiting by IP subnet (per minute)
    const recentByIpMinute = this.otpRepo.countByIpSubnet(ipSubnet, 1);
    if (recentByIpMinute >= this.config.rateLimitPerMinute) {
      score += 50;
      reasons.push(`rate_limit_minute:${recentByIpMinute}`);

      logger.warn('FRAUD: Rate limit (minute)', {
        ip,
        ipSubnet,
        count: recentByIpMinute,
        limit: this.config.rateLimitPerMinute,
      });
    }

    // Rule 6: Rate limiting by IP subnet (per hour)
    const recentByIpHour = this.otpRepo.countByIpSubnet(ipSubnet, 60);
    if (recentByIpHour >= this.config.rateLimitPerHour) {
      score += 40;
      reasons.push(`rate_limit_hour:${recentByIpHour}`);

      logger.warn('FRAUD: Rate limit (hour)', {
        ip,
        ipSubnet,
        count: recentByIpHour,
        limit: this.config.rateLimitPerHour,
      });
    }

    // Rule 7: Rate limiting by phone number
    const recentByPhone = this.otpRepo.countByPhone(phone, 60);
    if (recentByPhone >= this.config.rateLimitPerHour) {
      score += 30;
      reasons.push(`phone_rate_limit:${recentByPhone}`);

      logger.warn('FRAUD: Phone rate limit', {
        phone: phone.slice(0, 5) + '***',
        count: recentByPhone,
        limit: this.config.rateLimitPerHour,
      });
    }

    // Rule 8: Geo mismatch (IP country != phone country)
    if (ipCountry && phoneCountry && ipCountry !== phoneCountry) {
      score += this.config.geoMatchPenalty;
      reasons.push(`geo_mismatch:${ipCountry}:${phoneCountry}`);

      logger.info('FRAUD: Geo mismatch', {
        ip,
        ipCountry,
        phoneCountry,
        phone: phone.slice(0, 5) + '***',
      });
    }

    // Rule 9: Allowed countries check
    if (this.config.allowedCountries && this.config.allowedCountries.length > 0) {
      if (phoneCountry && !this.config.allowedCountries.includes(phoneCountry)) {
        score += 40;
        reasons.push(`country_not_allowed:${phoneCountry}`);

        logger.warn('FRAUD: Country not allowed', {
          phoneCountry,
          allowedCountries: this.config.allowedCountries,
        });
      }
    }

    // Rule 10: Circuit breaker for phone
    const phoneCircuitBreaker = this.fraudRepo.getCircuitBreaker(`phone:${phone}`);
    if (phoneCircuitBreaker) {
      if (phoneCircuitBreaker.state === 'open') {
        score += 50;
        reasons.push('circuit_breaker_open:phone');

        logger.warn('FRAUD: Phone circuit breaker open', {
          phone: phone.slice(0, 5) + '***',
          failures: phoneCircuitBreaker.failures,
        });
      } else if (
        phoneCircuitBreaker.failures >= this.config.circuitBreakerThreshold
      ) {
        // Trip the circuit breaker
        this.fraudRepo.openCircuitBreaker(`phone:${phone}`);
        score += 50;
        reasons.push('circuit_breaker_tripped:phone');

        logger.warn('FRAUD: Phone circuit breaker tripped', {
          phone: phone.slice(0, 5) + '***',
          failures: phoneCircuitBreaker.failures,
        });
      }
    }

    // Rule 11: Circuit breaker for IP
    const ipCircuitBreaker = this.fraudRepo.getCircuitBreaker(`ip:${ipSubnet}`);
    if (ipCircuitBreaker) {
      if (ipCircuitBreaker.state === 'open') {
        score += 40;
        reasons.push('circuit_breaker_open:ip');

        logger.warn('FRAUD: IP circuit breaker open', {
          ipSubnet,
          failures: ipCircuitBreaker.failures,
        });
      } else if (
        ipCircuitBreaker.failures >= this.config.circuitBreakerThreshold
      ) {
        this.fraudRepo.openCircuitBreaker(`ip:${ipSubnet}`);
        score += 40;
        reasons.push('circuit_breaker_tripped:ip');

        logger.warn('FRAUD: IP circuit breaker tripped', {
          ipSubnet,
          failures: ipCircuitBreaker.failures,
        });
      }
    }

    // Determine if should shadow-ban
    const shouldShadowBan = score >= this.config.shadowBanThreshold;

    if (shouldShadowBan) {
      // Add to honeypot for future requests (24 hour expiry)
      this.fraudRepo.addToHoneypot(ipSubnet, reasons.join(','), 24);

      logger.warn('FRAUD: Shadow-banning request', {
        ip,
        ipSubnet,
        score,
        threshold: this.config.shadowBanThreshold,
        reasons,
        phone: phone.slice(0, 5) + '***',
      });
    }

    return {
      allowed: !shouldShadowBan,
      shadowBan: shouldShadowBan,
      score,
      reasons,
      ipSubnet,
      ipCountry,
      phoneCountry,
      phonePrefix,
      asn,
    };
  }

  /**
   * Record successful verification (improves trust)
   */
  recordSuccess(phone: string, ipSubnet: string): void {
    // Reset circuit breakers
    this.fraudRepo.resetCircuitBreaker(`phone:${phone}`);
    this.fraudRepo.resetCircuitBreaker(`ip:${ipSubnet}`);

    // Improve IP reputation
    this.fraudRepo.recordVerifiedRequest(ipSubnet);

    // Record success in circuit breaker
    this.fraudRepo.recordSuccess(`phone:${phone}`);
    this.fraudRepo.recordSuccess(`ip:${ipSubnet}`);

    logger.info('Fraud: Recorded success', {
      phone: phone.slice(0, 5) + '***',
      ipSubnet,
    });
  }

  /**
   * Record failed verification (degrades trust)
   */
  recordFailure(phone: string, ipSubnet: string): void {
    // Increment failures
    this.fraudRepo.incrementFailures(`phone:${phone}`);
    this.fraudRepo.incrementFailures(`ip:${ipSubnet}`);

    // Record failed request
    this.fraudRepo.recordFailedRequest(ipSubnet);

    logger.info('Fraud: Recorded failure', {
      phone: phone.slice(0, 5) + '***',
      ipSubnet,
    });
  }

}
