/**
 * CIDR matching utility
 *
 * Dependency-free IPv4 + IPv6 CIDR membership testing using exact bit-prefix
 * comparison (BigInt). Used by the inbound-webhook source-IP allowlist.
 *
 * Supports:
 *  - IPv4 ("46.19.208.0/21") and IPv6 ("2a01:ad00::/32") prefixes
 *  - IPv4-mapped IPv6 client addresses ("::ffff:1.2.3.4"), matched as IPv4
 *  - bare addresses with no "/" (treated as /32 or /128 exact match)
 *
 * Any malformed/unparseable input yields `false` (fail-closed for an allowlist).
 */

import { expandIPv6 } from './ipv6.js';

interface ParsedIp {
  version: 4 | 6;
  value: bigint;
}

/** Parse an IPv4 dotted-quad into a 32-bit BigInt, or null if invalid. */
function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

/** Parse an IPv6 string into a 128-bit BigInt, or null if invalid. */
function ipv6ToBigInt(ip: string): bigint | null {
  let expanded: string;
  try {
    expanded = expandIPv6(ip);
  } catch {
    return null;
  }
  const groups = expanded.split(':');
  if (groups.length !== 8) return null;
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

/** Normalize an address string to a comparable {version, value}, or null. */
function parseIp(ip: string): ParsedIp | null {
  // Strip an IPv6 zone id (e.g. "fe80::1%eth0") if present.
  const stripped = ip.trim().split('%')[0];

  // IPv4-mapped IPv6 ("::ffff:1.2.3.4") is matched as IPv4.
  const mapped = stripped.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  const target = mapped ? mapped[1] : stripped;

  if (target.includes('.') && !target.includes(':')) {
    const value = ipv4ToBigInt(target);
    return value === null ? null : { version: 4, value };
  }
  if (stripped.includes(':')) {
    const value = ipv6ToBigInt(stripped);
    return value === null ? null : { version: 6, value };
  }
  return null;
}

/**
 * Return true if `ip` falls within the CIDR `cidr` (or equals it, for a bare IP).
 * IPv4 and IPv6 are only matched against same-family prefixes.
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf('/');
  const netStr = slash === -1 ? cidr : cidr.slice(0, slash);

  const ipParsed = parseIp(ip);
  const netParsed = parseIp(netStr);
  if (!ipParsed || !netParsed) return false;
  if (ipParsed.version !== netParsed.version) return false;

  const totalBits = ipParsed.version === 4 ? 32 : 128;
  let prefixLen = totalBits;
  if (slash !== -1) {
    const raw = cidr.slice(slash + 1);
    if (!/^\d{1,3}$/.test(raw)) return false;
    prefixLen = Number(raw);
    if (prefixLen > totalBits) return false;
  }

  if (prefixLen === 0) return true;
  const shift = BigInt(totalBits - prefixLen);
  return ipParsed.value >> shift === netParsed.value >> shift;
}

/**
 * Return true if `ip` falls within ANY of the given CIDRs / bare IPs.
 * Entries are trimmed; blank entries are ignored. Returns false for empty input.
 */
export function ipInAnyCidr(ip: string | undefined | null, cidrs: string[]): boolean {
  if (!ip) return false;
  for (const entry of cidrs) {
    const trimmed = entry.trim();
    if (trimmed && ipInCidr(ip, trimmed)) return true;
  }
  return false;
}
