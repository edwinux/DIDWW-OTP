/**
 * GeoIP Utility
 *
 * Wrapper around geoip-lite for IP geolocation and ASN lookup.
 * ASN lookups use the AsnDatabase service with maxmind MMDB format.
 * Phone country detection uses PhoneNumberService (libphonenumber-js).
 */

import geoip from 'geoip-lite';
import { getAsnDatabase } from '../services/AsnDatabase.js';
import { getPhoneNumberService } from '../services/PhoneNumberService.js';

/**
 * Get country code from IP address
 */
export function getCountryFromIp(ip: string): string | null {
  const result = geoip.lookup(ip);
  return result?.country || null;
}

/**
 * Get country code from phone number (E.164 format)
 * Uses libphonenumber-js for accurate parsing
 */
export function getCountryFromPhone(phone: string): string | null {
  const phoneService = getPhoneNumberService();
  return phoneService.getCountry(phone);
}

/**
 * Get phone prefix (country code + first few digits)
 * Uses libphonenumber-js for accurate prefix extraction
 */
export function getPhonePrefix(phone: string, length: number = 4): string | null {
  const phoneService = getPhoneNumberService();
  return phoneService.extractPrefix(phone, length);
}

/**
 * Resolve ASN with update attempt
 * Returns resolution status and ASN data
 */
export async function resolveAsnFromIp(ip: string): Promise<{
  resolved: boolean;
  asn: number | null;
  organization: string | null;
}> {
  const asnDb = getAsnDatabase();
  return asnDb.resolveAsn(ip);
}

/**
 * Check if shadow-ban should be applied for unresolved ASN
 */
export function shouldShadowBanUnresolvedAsn(): boolean {
  const asnDb = getAsnDatabase();
  return asnDb.shouldShadowBanUnresolved();
}
