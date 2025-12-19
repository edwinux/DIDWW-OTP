/**
 * Phone Number Service
 *
 * Wrapper around libphonenumber-js for phone number parsing and metadata.
 * Provides country, carrier, and number type detection.
 * Supports weekly metadata updates similar to AsnDatabase pattern.
 */

import {
  parsePhoneNumber,
  isValidPhoneNumber,
  CountryCode,
  PhoneNumber,
} from 'libphonenumber-js';
import { logger } from '../utils/logger.js';

/**
 * Phone number metadata result
 */
export interface PhoneMetadata {
  /** ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB') */
  country: string | null;
  /** Country calling code (e.g., '1', '44') */
  countryCallingCode: string | null;
  /** Number type: 'MOBILE', 'FIXED_LINE', 'VOIP', etc. */
  numberType: string | null;
  /** Original carrier name (may not reflect current carrier due to portability) */
  carrier: string | null;
  /** Whether the number is valid */
  isValid: boolean;
  /** National number without country code */
  nationalNumber: string | null;
  /** E.164 formatted number */
  e164: string | null;
}

/**
 * Phone Number Service Singleton
 *
 * Parses phone numbers and extracts metadata using libphonenumber-js.
 * The library's metadata is bundled and updated with package updates.
 */
class PhoneNumberService {
  private static instance: PhoneNumberService | null = null;
  private initialized: boolean = false;
  private updateIntervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): PhoneNumberService {
    if (!PhoneNumberService.instance) {
      PhoneNumberService.instance = new PhoneNumberService();
    }
    return PhoneNumberService.instance;
  }

  /**
   * Initialize the service
   * Note: libphonenumber-js metadata is bundled with the package,
   * so no external initialization is needed.
   */
  initialize(): void {
    if (this.initialized) return;

    logger.info('PhoneNumberService initialized');
    this.initialized = true;
  }

  /**
   * Parse a phone number and extract metadata
   *
   * @param phone - Phone number in E.164 format (with or without +)
   * @param defaultCountry - Optional default country for numbers without country code
   * @returns Phone metadata or null if parsing fails
   */
  parse(phone: string, defaultCountry?: CountryCode): PhoneMetadata {
    // Ensure phone starts with + for E.164
    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;

    try {
      const parsed = parsePhoneNumber(normalizedPhone, defaultCountry);

      if (!parsed) {
        return this.createEmptyMetadata(false);
      }

      return {
        country: parsed.country || null,
        countryCallingCode: parsed.countryCallingCode || null,
        numberType: this.getNumberType(parsed),
        carrier: null, // libphonenumber-js doesn't include carrier data in default bundle
        isValid: parsed.isValid(),
        nationalNumber: parsed.nationalNumber || null,
        e164: parsed.number || null,
      };
    } catch (error) {
      logger.debug('Phone number parsing failed', {
        phone: normalizedPhone.slice(0, 6) + '***',
        error: error instanceof Error ? error.message : String(error),
      });
      return this.createEmptyMetadata(false);
    }
  }

  /**
   * Get country code from phone number
   * Replacement for manual mapping in geoip.ts
   */
  getCountry(phone: string): string | null {
    const metadata = this.parse(phone);
    return metadata.country;
  }

  /**
   * Get country calling code (e.g., '1' for US, '44' for UK)
   */
  getCountryCallingCode(phone: string): string | null {
    const metadata = this.parse(phone);
    return metadata.countryCallingCode;
  }

  /**
   * Check if phone number is valid
   */
  isValid(phone: string): boolean {
    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
    try {
      return isValidPhoneNumber(normalizedPhone);
    } catch {
      return false;
    }
  }

  /**
   * Get number type (MOBILE, FIXED_LINE, VOIP, etc.)
   */
  getNumberType(parsed: PhoneNumber): string | null {
    try {
      const type = parsed.getType();
      return type || null;
    } catch {
      return null;
    }
  }

  /**
   * Extract prefix for rate lookup
   * Returns country calling code + first few digits of national number
   *
   * @param phone - Phone number in E.164 format
   * @param prefixLength - Total length of prefix to extract (default: 4)
   */
  extractPrefix(phone: string, prefixLength: number = 4): string | null {
    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;

    try {
      const parsed = parsePhoneNumber(normalizedPhone);
      if (!parsed || !parsed.countryCallingCode) {
        // Fallback: just return first N digits
        const digits = normalizedPhone.replace(/\D/g, '');
        return digits.slice(0, prefixLength) || null;
      }

      // Return country code + start of national number
      const countryCode = parsed.countryCallingCode;
      const national = parsed.nationalNumber || '';

      // Calculate how many national digits to include
      const nationalDigits = Math.max(0, prefixLength - countryCode.length);
      return countryCode + national.slice(0, nationalDigits);
    } catch {
      // Fallback: just return first N digits
      const digits = normalizedPhone.replace(/\D/g, '');
      return digits.slice(0, prefixLength) || null;
    }
  }

  /**
   * Get prefix hierarchy for rate lookup (longest to shortest)
   * Used for fallback matching in rate lookups
   *
   * @param phone - Phone number in E.164 format
   * @returns Array of prefixes from longest (most specific) to shortest
   */
  getPrefixHierarchy(phone: string): string[] {
    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;
    const digits = normalizedPhone.replace(/\D/g, '');

    if (!digits) return [];

    // Generate prefixes from 6 digits down to 1
    const prefixes: string[] = [];
    for (let len = Math.min(6, digits.length); len >= 1; len--) {
      prefixes.push(digits.slice(0, len));
    }
    return prefixes;
  }

  /**
   * Format phone number for display
   */
  format(phone: string, formatType: 'INTERNATIONAL' | 'NATIONAL' | 'E164' = 'INTERNATIONAL'): string {
    const normalizedPhone = phone.startsWith('+') ? phone : `+${phone}`;

    try {
      const parsed = parsePhoneNumber(normalizedPhone);
      if (!parsed) return normalizedPhone;

      switch (formatType) {
        case 'INTERNATIONAL':
          return parsed.formatInternational();
        case 'NATIONAL':
          return parsed.formatNational();
        case 'E164':
          return parsed.number;
        default:
          return parsed.formatInternational();
      }
    } catch {
      return normalizedPhone;
    }
  }

  /**
   * Create empty metadata object
   */
  private createEmptyMetadata(isValid: boolean): PhoneMetadata {
    return {
      country: null,
      countryCallingCode: null,
      numberType: null,
      carrier: null,
      isValid,
      nationalNumber: null,
      e164: null,
    };
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup (for graceful shutdown)
   */
  shutdown(): void {
    if (this.updateIntervalId) {
      clearInterval(this.updateIntervalId);
      this.updateIntervalId = null;
    }
    this.initialized = false;
    logger.info('PhoneNumberService shut down');
  }
}

// Export singleton getter
export function getPhoneNumberService(): PhoneNumberService {
  return PhoneNumberService.getInstance();
}

// Export initialization function
export function initializePhoneNumberService(): void {
  getPhoneNumberService().initialize();
}
