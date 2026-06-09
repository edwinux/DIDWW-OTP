/**
 * SSRF protection for outbound webhook delivery
 *
 * Client-configured webhook URLs are attacker-controlled. Before the server makes
 * an outbound request to one, we must ensure it does not resolve to a private,
 * loopback, link-local, or otherwise non-public address (which would let a caller
 * reach internal services such as the cloud metadata endpoint, the local Asterisk
 * ARI, or the admin panel itself).
 */

import net from 'net';
import { lookup } from 'dns/promises';

/**
 * Check whether an IPv4 address string is non-public (private/reserved/loopback/etc).
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    // Not a parseable IPv4 - treat as unsafe (cannot prove it is public)
    return true;
  }
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 IETF
  if (a === 192 && b === 0 && parts[2] === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255.255.255.255

  return false;
}

/**
 * Check whether an IPv6 address string is non-public.
 */
function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase();

  // IPv4-mapped / IPv4-compatible (::ffff:1.2.3.4) - validate the embedded IPv4
  const mapped = addr.match(/(?:::ffff:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) {
    return isPrivateIPv4(mapped[1]);
  }

  if (addr === '::1') return true; // loopback
  if (addr === '::') return true; // unspecified
  if (addr.startsWith('fe80') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // fc00::/7 unique local
  if (addr.startsWith('ff')) return true; // ff00::/8 multicast

  return false;
}

/**
 * Returns true if the address (IPv4 or IPv6 literal) is non-public.
 */
function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  // Not a recognisable IP literal - cannot prove it is public
  return true;
}

/**
 * Validate a client-supplied webhook URL, throwing if it is unsafe to fetch.
 *
 * Enforces http(s) only, and resolves the hostname (or inspects an IP literal)
 * to ensure every resolved address is publicly routable. Resolving here, right
 * before the request, also narrows the DNS-rebinding window.
 */
export async function assertPublicWebhookUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid webhook URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported webhook URL protocol: ${url.protocol}`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  let addresses: string[];
  if (net.isIP(hostname)) {
    addresses = [hostname];
  } else {
    const resolved = await lookup(hostname, { all: true });
    addresses = resolved.map((r) => r.address);
    if (addresses.length === 0) {
      throw new Error(`Webhook host did not resolve: ${hostname}`);
    }
  }

  for (const addr of addresses) {
    if (isPrivateAddress(addr)) {
      throw new Error(`Webhook URL resolves to a non-public address (${addr})`);
    }
  }
}
