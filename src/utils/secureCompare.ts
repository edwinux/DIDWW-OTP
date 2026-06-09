/**
 * Constant-time string comparison
 *
 * Compares two strings without leaking per-byte timing information, to defend
 * shared-secret checks (API secret, inbound webhook tokens) against timing attacks.
 */

import crypto from 'crypto';

/**
 * Returns true if `a` and `b` are equal, using a constant-time comparison.
 *
 * Note: like the admin credential check, an unequal length short-circuits to false
 * (the length itself is not considered secret here).
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
