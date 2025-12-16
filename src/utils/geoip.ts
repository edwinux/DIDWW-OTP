/**
 * GeoIP Utility
 *
 * Wrapper around geoip-lite for IP geolocation and ASN lookup.
 */

import geoip from 'geoip-lite';

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
 * Uses common country calling codes
 */
export function getCountryFromPhone(phone: string): string | null {
  // Remove any non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Must start with +
  if (!cleaned.startsWith('+')) return null;

  const digits = cleaned.slice(1);

  // Country code mappings (most common, ordered by specificity)
  const countryCodeMap: Array<{ prefix: string; country: string }> = [
    // 4-digit prefixes
    { prefix: '1684', country: 'AS' }, // American Samoa
    { prefix: '1670', country: 'MP' }, // Northern Mariana Islands
    { prefix: '1671', country: 'GU' }, // Guam
    { prefix: '1787', country: 'PR' }, // Puerto Rico
    { prefix: '1939', country: 'PR' }, // Puerto Rico
    { prefix: '1340', country: 'VI' }, // US Virgin Islands

    // 3-digit prefixes
    { prefix: '371', country: 'LV' }, // Latvia (IRSF target)
    { prefix: '372', country: 'EE' }, // Estonia
    { prefix: '373', country: 'MD' }, // Moldova
    { prefix: '374', country: 'AM' }, // Armenia
    { prefix: '375', country: 'BY' }, // Belarus
    { prefix: '376', country: 'AD' }, // Andorra
    { prefix: '377', country: 'MC' }, // Monaco
    { prefix: '378', country: 'SM' }, // San Marino
    { prefix: '380', country: 'UA' }, // Ukraine
    { prefix: '381', country: 'RS' }, // Serbia
    { prefix: '382', country: 'ME' }, // Montenegro
    { prefix: '383', country: 'XK' }, // Kosovo
    { prefix: '385', country: 'HR' }, // Croatia
    { prefix: '386', country: 'SI' }, // Slovenia
    { prefix: '387', country: 'BA' }, // Bosnia
    { prefix: '389', country: 'MK' }, // North Macedonia
    { prefix: '420', country: 'CZ' }, // Czech Republic
    { prefix: '421', country: 'SK' }, // Slovakia
    { prefix: '423', country: 'LI' }, // Liechtenstein
    { prefix: '852', country: 'HK' }, // Hong Kong
    { prefix: '853', country: 'MO' }, // Macau
    { prefix: '855', country: 'KH' }, // Cambodia
    { prefix: '856', country: 'LA' }, // Laos
    { prefix: '880', country: 'BD' }, // Bangladesh
    { prefix: '886', country: 'TW' }, // Taiwan
    { prefix: '960', country: 'MV' }, // Maldives
    { prefix: '961', country: 'LB' }, // Lebanon
    { prefix: '962', country: 'JO' }, // Jordan
    { prefix: '963', country: 'SY' }, // Syria
    { prefix: '964', country: 'IQ' }, // Iraq
    { prefix: '965', country: 'KW' }, // Kuwait
    { prefix: '966', country: 'SA' }, // Saudi Arabia
    { prefix: '967', country: 'YE' }, // Yemen
    { prefix: '968', country: 'OM' }, // Oman
    { prefix: '970', country: 'PS' }, // Palestine
    { prefix: '971', country: 'AE' }, // UAE
    { prefix: '972', country: 'IL' }, // Israel
    { prefix: '973', country: 'BH' }, // Bahrain
    { prefix: '974', country: 'QA' }, // Qatar
    { prefix: '975', country: 'BT' }, // Bhutan
    { prefix: '976', country: 'MN' }, // Mongolia
    { prefix: '977', country: 'NP' }, // Nepal
    { prefix: '992', country: 'TJ' }, // Tajikistan
    { prefix: '993', country: 'TM' }, // Turkmenistan
    { prefix: '994', country: 'AZ' }, // Azerbaijan
    { prefix: '995', country: 'GE' }, // Georgia
    { prefix: '996', country: 'KG' }, // Kyrgyzstan
    { prefix: '998', country: 'UZ' }, // Uzbekistan

    // 2-digit prefixes
    { prefix: '20', country: 'EG' }, // Egypt
    { prefix: '27', country: 'ZA' }, // South Africa
    { prefix: '30', country: 'GR' }, // Greece
    { prefix: '31', country: 'NL' }, // Netherlands
    { prefix: '32', country: 'BE' }, // Belgium
    { prefix: '33', country: 'FR' }, // France
    { prefix: '34', country: 'ES' }, // Spain
    { prefix: '36', country: 'HU' }, // Hungary
    { prefix: '39', country: 'IT' }, // Italy
    { prefix: '40', country: 'RO' }, // Romania
    { prefix: '41', country: 'CH' }, // Switzerland
    { prefix: '43', country: 'AT' }, // Austria
    { prefix: '44', country: 'GB' }, // UK
    { prefix: '45', country: 'DK' }, // Denmark
    { prefix: '46', country: 'SE' }, // Sweden
    { prefix: '47', country: 'NO' }, // Norway
    { prefix: '48', country: 'PL' }, // Poland
    { prefix: '49', country: 'DE' }, // Germany
    { prefix: '51', country: 'PE' }, // Peru
    { prefix: '52', country: 'MX' }, // Mexico
    { prefix: '53', country: 'CU' }, // Cuba
    { prefix: '54', country: 'AR' }, // Argentina
    { prefix: '55', country: 'BR' }, // Brazil
    { prefix: '56', country: 'CL' }, // Chile
    { prefix: '57', country: 'CO' }, // Colombia
    { prefix: '58', country: 'VE' }, // Venezuela
    { prefix: '60', country: 'MY' }, // Malaysia
    { prefix: '61', country: 'AU' }, // Australia
    { prefix: '62', country: 'ID' }, // Indonesia
    { prefix: '63', country: 'PH' }, // Philippines
    { prefix: '64', country: 'NZ' }, // New Zealand
    { prefix: '65', country: 'SG' }, // Singapore
    { prefix: '66', country: 'TH' }, // Thailand
    { prefix: '81', country: 'JP' }, // Japan
    { prefix: '82', country: 'KR' }, // South Korea
    { prefix: '84', country: 'VN' }, // Vietnam
    { prefix: '86', country: 'CN' }, // China
    { prefix: '90', country: 'TR' }, // Turkey
    { prefix: '91', country: 'IN' }, // India
    { prefix: '92', country: 'PK' }, // Pakistan
    { prefix: '93', country: 'AF' }, // Afghanistan
    { prefix: '94', country: 'LK' }, // Sri Lanka
    { prefix: '95', country: 'MM' }, // Myanmar
    { prefix: '98', country: 'IR' }, // Iran

    // 1-digit prefix (must be last)
    { prefix: '1', country: 'US' }, // NANP (US/Canada) - default to US
    { prefix: '7', country: 'RU' }, // Russia/Kazakhstan
  ];

  // Find matching prefix (longer prefixes checked first due to ordering)
  for (const { prefix, country } of countryCodeMap) {
    if (digits.startsWith(prefix)) {
      return country;
    }
  }

  return null;
}

/**
 * Get phone prefix (country code + first few digits)
 */
export function getPhonePrefix(phone: string, length: number = 4): string | null {
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) return null;

  const digits = cleaned.slice(1);
  if (digits.length < length) return digits;

  return digits.slice(0, length);
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
