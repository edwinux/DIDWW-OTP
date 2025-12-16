/**
 * IPv6 Utility
 *
 * Functions for IPv6 /64 subnet aggregation and IP normalization.
 */

/**
 * Check if an IP address is IPv6
 */
export function isIPv6(ip: string): boolean {
  return ip.includes(':');
}

/**
 * Check if an IP address is IPv4
 */
export function isIPv4(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

/**
 * Expand IPv6 address to full form
 */
export function expandIPv6(ip: string): string {
  // Handle IPv4-mapped IPv6 (::ffff:192.0.2.1)
  if (ip.toLowerCase().startsWith('::ffff:') && ip.includes('.')) {
    return ip.toLowerCase();
  }

  // Split into groups
  let groups = ip.split(':');

  // Handle :: expansion
  const emptyIndex = groups.indexOf('');
  if (emptyIndex !== -1) {
    // Count how many groups we need to add
    const nonEmptyGroups = groups.filter((g) => g !== '').length;
    const missingGroups = 8 - nonEmptyGroups;

    // Build expanded array
    const expanded: string[] = [];
    for (const group of groups) {
      if (group === '') {
        // First empty string triggers expansion
        if (expanded.length === 0 || expanded[expanded.length - 1] !== '0000') {
          for (let i = 0; i < missingGroups; i++) {
            expanded.push('0000');
          }
        }
      } else {
        expanded.push(group.padStart(4, '0'));
      }
    }
    groups = expanded;
  } else {
    groups = groups.map((g) => g.padStart(4, '0'));
  }

  return groups.join(':').toLowerCase();
}

/**
 * Get /64 subnet for IPv6 address
 * Returns first 4 groups (64 bits) with zeros for the rest
 */
export function getIPv6Subnet64(ip: string): string {
  const expanded = expandIPv6(ip);

  // Handle IPv4-mapped IPv6
  if (expanded.startsWith('::ffff:') || expanded.startsWith('0000:0000:0000:0000:0000:ffff:')) {
    // Extract IPv4 and return /24
    const ipv4Match = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
    if (ipv4Match) {
      return `${ipv4Match[1]}.0/24`;
    }
  }

  const groups = expanded.split(':');
  // Take first 4 groups (64 bits), zero out the rest
  const subnet = [...groups.slice(0, 4), '0000', '0000', '0000', '0000'].join(':');

  return `${subnet}/64`;
}

/**
 * Get /24 subnet for IPv4 address
 */
export function getIPv4Subnet24(ip: string): string {
  const parts = ip.split('.');
  if (parts.length !== 4) return ip;

  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

/**
 * Get subnet for any IP address
 * Returns /64 for IPv6, /24 for IPv4
 */
export function getIpSubnet(ip: string): string {
  if (isIPv6(ip)) {
    return getIPv6Subnet64(ip);
  }
  if (isIPv4(ip)) {
    return getIPv4Subnet24(ip);
  }
  // Unknown format, return as-is
  return ip;
}

/**
 * Normalize IP address for consistent storage
 * - Expands IPv6 shorthand
 * - Lowercases IPv6
 * - Trims whitespace
 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();

  if (isIPv6(trimmed)) {
    return expandIPv6(trimmed);
  }

  return trimmed;
}

/**
 * Check if two IPs are in the same subnet
 */
export function isSameSubnet(ip1: string, ip2: string): boolean {
  return getIpSubnet(ip1) === getIpSubnet(ip2);
}

/**
 * Extract client IP from request headers
 * Handles X-Forwarded-For, X-Real-IP, and direct connection
 */
export function extractClientIp(
  headers: Record<string, string | string[] | undefined>,
  remoteAddress?: string
): string {
  // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2, ...
  const xff = headers['x-forwarded-for'];
  if (xff) {
    const ips = Array.isArray(xff) ? xff[0] : xff;
    const firstIp = ips.split(',')[0].trim();
    if (firstIp) return normalizeIp(firstIp);
  }

  // X-Real-IP is typically set by nginx
  const xri = headers['x-real-ip'];
  if (xri) {
    const ip = Array.isArray(xri) ? xri[0] : xri;
    return normalizeIp(ip);
  }

  // Fall back to remote address
  if (remoteAddress) {
    // Remove IPv6 prefix if present (::ffff:192.168.1.1)
    const cleaned = remoteAddress.replace(/^::ffff:/, '');
    return normalizeIp(cleaned);
  }

  return '0.0.0.0';
}
