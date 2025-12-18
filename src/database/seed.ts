/**
 * Database Seed Data
 *
 * Pre-populates ASN blocklist with known cloud providers and VPN services.
 * These are treated as zero-tolerance bots by default.
 */

import { dbManager } from './connection.js';
import { logger } from '../utils/logger.js';

/**
 * ASN blocklist entries
 * Sources: bgp.he.net, ipinfo.io ASN databases
 */
const ASN_BLOCKLIST: Array<{
  asn: number;
  provider: string;
  category: string;
  reason: string;
}> = [
  // Major Cloud Providers
  { asn: 16509, provider: 'Amazon AWS', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 14618, provider: 'Amazon AWS', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 8075, provider: 'Microsoft Azure', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 8068, provider: 'Microsoft Azure', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 15169, provider: 'Google Cloud', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 396982, provider: 'Google Cloud', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 14061, provider: 'DigitalOcean', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 200130, provider: 'DigitalOcean', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 20473, provider: 'Vultr', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 63949, provider: 'Linode/Akamai', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 16276, provider: 'OVH', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 24940, provider: 'Hetzner', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 51167, provider: 'Contabo', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 212238, provider: 'Scaleway', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 13335, provider: 'Cloudflare', category: 'cloud', reason: 'CDN/Proxy provider' },
  { asn: 132203, provider: 'Tencent Cloud', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 45090, provider: 'Tencent Cloud', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 37963, provider: 'Alibaba Cloud', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 45102, provider: 'Alibaba Cloud', category: 'cloud', reason: 'Cloud hosting provider' },
  { asn: 9009, provider: 'M247', category: 'cloud', reason: 'Hosting provider' },
  { asn: 62904, provider: 'Eonix', category: 'cloud', reason: 'Hosting provider' },
  { asn: 40676, provider: 'Psychz Networks', category: 'cloud', reason: 'Hosting provider' },
  { asn: 46664, provider: 'VolumeDrive', category: 'cloud', reason: 'Hosting provider' },
  { asn: 36352, provider: 'ColoCrossing', category: 'cloud', reason: 'Hosting provider' },
  { asn: 55286, provider: 'B2 Net Solutions', category: 'cloud', reason: 'Hosting provider' },

  // VPN Providers
  { asn: 212238, provider: 'Datacamp Limited', category: 'vpn', reason: 'VPN/Proxy provider' },
  { asn: 9009, provider: 'M247 (VPN infra)', category: 'vpn', reason: 'VPN infrastructure' },
  { asn: 60068, provider: 'Datacamp Limited', category: 'vpn', reason: 'VPN provider' },
  { asn: 206092, provider: 'IPXO', category: 'vpn', reason: 'IP leasing for VPNs' },
  { asn: 207137, provider: 'PacketHub', category: 'vpn', reason: 'VPN infrastructure' },
  { asn: 396356, provider: 'Maxihost', category: 'vpn', reason: 'VPN infrastructure' },
  { asn: 398101, provider: 'GoDaddy VPS', category: 'vpn', reason: 'VPS commonly used for VPNs' },
  { asn: 394711, provider: 'Limenet', category: 'vpn', reason: 'VPN provider' },

  // Proxy/Anonymizer Networks
  { asn: 25369, provider: 'Hydra Communications', category: 'proxy', reason: 'Proxy network' },
  { asn: 50613, provider: 'Leaseweb NL', category: 'proxy', reason: 'Proxy hosting' },
  { asn: 60781, provider: 'Leaseweb NL', category: 'proxy', reason: 'Proxy hosting' },
  { asn: 28753, provider: 'Leaseweb DE', category: 'proxy', reason: 'Proxy hosting' },
  { asn: 59253, provider: 'Leaseweb Asia', category: 'proxy', reason: 'Proxy hosting' },

  // Known Bad Actors / Bulletproof Hosting
  { asn: 49981, provider: 'WorldStream', category: 'bulletproof', reason: 'Known abuse source' },
  { asn: 202425, provider: 'IP Volume', category: 'bulletproof', reason: 'Known abuse source' },
  { asn: 44477, provider: 'Stark Industries', category: 'bulletproof', reason: 'Bulletproof hosting' },

  // Residential Proxy Networks (commonly abused)
  { asn: 174, provider: 'Cogent (datacenter ranges)', category: 'datacenter', reason: 'Datacenter IP ranges' },
  { asn: 3356, provider: 'Lumen (datacenter ranges)', category: 'datacenter', reason: 'Datacenter IP ranges' },
];

/**
 * Seed the ASN blocklist
 * Idempotent - only inserts if table is empty
 */
export function seedAsnBlocklist(): void {
  const db = dbManager.getDb();

  // Check if already seeded
  const count = db.prepare('SELECT COUNT(*) as count FROM asn_blocklist').get() as { count: number };

  if (count.count > 0) {
    logger.debug('ASN blocklist already seeded', { count: count.count });
    return;
  }

  logger.info('Seeding ASN blocklist...', { entries: ASN_BLOCKLIST.length });

  const now = Date.now();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO asn_blocklist (asn, provider, category, reason, added_at) VALUES (?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction((entries: typeof ASN_BLOCKLIST) => {
    for (const entry of entries) {
      insert.run(entry.asn, entry.provider, entry.category, entry.reason, now);
    }
  });

  insertMany(ASN_BLOCKLIST);

  logger.info('ASN blocklist seeded successfully', { entries: ASN_BLOCKLIST.length });
}

/**
 * Get count of blocked ASNs
 */
export function getAsnBlocklistCount(): number {
  const db = dbManager.getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM asn_blocklist').get() as { count: number };
  return result.count;
}

/**
 * Default caller ID routes
 * Provides fallback routes for fresh installations
 */
const DEFAULT_CALLER_ID_ROUTES: Array<{
  channel: 'sms' | 'voice';
  prefix: string;
  caller_id: string;
  description: string;
}> = [
  {
    channel: 'sms',
    prefix: '*',
    caller_id: '12345678900',
    description: 'Default SMS caller ID (update in Settings)',
  },
  {
    channel: 'voice',
    prefix: '*',
    caller_id: '12345678900',
    description: 'Default Voice caller ID (update in Settings)',
  },
];

/**
 * Seed default caller ID routes
 * Idempotent - only inserts if table is empty
 */
export function seedCallerIdRoutes(): void {
  const db = dbManager.getDb();

  // Check if already seeded
  const count = db.prepare('SELECT COUNT(*) as count FROM caller_id_routes').get() as { count: number };

  if (count.count > 0) {
    logger.debug('Caller ID routes already seeded', { count: count.count });
    return;
  }

  logger.info('Seeding default caller ID routes...', { entries: DEFAULT_CALLER_ID_ROUTES.length });

  const now = Date.now();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO caller_id_routes (channel, prefix, caller_id, description, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
  );

  const insertMany = db.transaction((entries: typeof DEFAULT_CALLER_ID_ROUTES) => {
    for (const entry of entries) {
      insert.run(entry.channel, entry.prefix, entry.caller_id, entry.description, now, now);
    }
  });

  insertMany(DEFAULT_CALLER_ID_ROUTES);

  logger.info('Default caller ID routes seeded successfully', { entries: DEFAULT_CALLER_ID_ROUTES.length });
}

/**
 * Get count of caller ID routes
 */
export function getCallerIdRoutesCount(): number {
  const db = dbManager.getDb();
  const result = db.prepare('SELECT COUNT(*) as count FROM caller_id_routes').get() as { count: number };
  return result.count;
}
