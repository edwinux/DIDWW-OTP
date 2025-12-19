/**
 * GeoIP Utility
 *
 * Wrapper around geoip-lite for IP geolocation and ASN lookup.
 * ASN lookups use the AsnDatabase service with maxmind MMDB format.
 * Phone country detection uses PhoneNumberService (libphonenumber-js).
 */

import geoip from 'geoip-lite';
import { getAsnDatabase, type AsnLookupResult } from '../services/AsnDatabase.js';
import { getPhoneNumberService } from '../services/PhoneNumberService.js';

/**
 * GeoIP lookup result
 */
export interface GeoIpResult {
  country: string | null;
  region: string | null;
  city: string | null;
  ll: [number, number] | null;
  metro: number | null;
  area: number | null;
  eu: boolean;
  timezone: string | null;
}

/**
 * Get country code from IP address
 */
export function getCountryFromIp(ip: string): string | null {
  const result = geoip.lookup(ip);
  return result?.country || null;
}

/**
 * Get full GeoIP data for an IP address
 */
export function getGeoIpData(ip: string): GeoIpResult | null {
  const result = geoip.lookup(ip);
  if (!result) return null;

  return {
    country: result.country,
    region: result.region,
    city: result.city,
    ll: result.ll,
    metro: result.metro,
    area: result.area,
    eu: result.eu === '1',
    timezone: result.timezone,
  };
}

/**
 * Check if IP is from a specific country
 */
export function isFromCountry(ip: string, countryCode: string): boolean {
  const country = getCountryFromIp(ip);
  return country?.toUpperCase() === countryCode.toUpperCase();
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
 * Check if IP country matches phone country
 */
export function doesGeoMatch(ip: string, phone: string): boolean {
  const ipCountry = getCountryFromIp(ip);
  const phoneCountry = getCountryFromPhone(phone);

  if (!ipCountry || !phoneCountry) return true; // Can't determine, assume match

  return ipCountry.toUpperCase() === phoneCountry.toUpperCase();
}

/**
 * Get ASN (Autonomous System Number) from IP address
 * Synchronous lookup - returns immediately from cached database
 */
export function getAsnFromIp(ip: string): number | null {
  const asnDb = getAsnDatabase();
  const result = asnDb.lookup(ip);
  return result?.asn ?? null;
}

/**
 * Get full ASN data from IP address
 * Synchronous lookup - returns immediately from cached database
 */
export function getAsnDataFromIp(ip: string): AsnLookupResult | null {
  const asnDb = getAsnDatabase();
  return asnDb.lookup(ip);
}

/**
 * Get ASN with automatic database update on miss
 * Async - may trigger database update if IP is unresolved
 *
 * Flow:
 * 1. Try sync lookup
 * 2. If null, queue request and trigger update (rate-limited)
 * 3. Retry lookup after update
 * 4. Return result (may still be null for truly unknown IPs)
 */
export async function getAsnFromIpWithUpdate(ip: string): Promise<number | null> {
  const asnDb = getAsnDatabase();
  const result = await asnDb.lookupWithUpdate(ip);
  return result?.asn ?? null;
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

// Re-export ASN types for convenience
export type { AsnLookupResult };
