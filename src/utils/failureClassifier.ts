/**
 * Failure Classification Utility
 *
 * Classifies SMS and Voice failures as 'carrier' or 'user' based on
 * error codes and causes. Used to exclude carrier failures from
 * rate limiting - users shouldn't be penalized for infrastructure issues.
 */

export type FailureCategory = 'carrier' | 'user' | 'fraud';

/**
 * DIDWW SMS error codes classified as carrier failures
 * (routing, network, balance, config issues - NOT user's fault)
 */
const SMS_CARRIER_ERROR_CODES = new Set([
  1, // No routes found
  2, // No rate found
  3, // No routes found
  4, // Internal error
  5, // SMS trunk is blocked
  6, // Internal error
  7, // Origination account is blocked
  8, // SMS source address is not allowed
  9, // SMS destination address is not allowed (carrier restriction)
  10, // SMS Campaign not found or blocked
  11, // SMS Campaign not found or blocked
  100, // Insufficient balance
  101, // All delivery attempts failed within the TTL
  102, // No encoding available
  103, // Max balance attempts reached
  104, // Message defragmentation failed
  105, // Routing failed
]);

/**
 * Q.850 cause codes classified as user failures
 * (user-initiated or user device issues - user's side)
 */
const Q850_USER_CAUSES = new Set([
  17, // User busy
  18, // No user responding
  19, // No answer from user
  21, // Call rejected
]);

/**
 * Q.850 cause codes classified as carrier failures
 * (network, routing, configuration issues - NOT user's fault)
 */
const Q850_CARRIER_CAUSES = new Set([
  1, // Unallocated number (carrier doesn't have route)
  2, // No route to network
  3, // No route to destination
  22, // Number changed
  27, // Destination out of order
  28, // Invalid number format
  34, // No circuit available
  38, // Network out of order
  41, // Temporary failure
  42, // Switching equipment congestion
  44, // Requested channel not available
  47, // Resource unavailable
  50, // Facility not subscribed
  52, // Outgoing calls barred
  54, // Incoming calls barred
  57, // Bearer capability not authorized
  58, // Bearer capability not available
  63, // Service not available
  65, // Bearer capability not implemented
  69, // Facility not implemented
  79, // Service not implemented
  88, // Incompatible destination
  95, // Invalid message
  96, // Mandatory IE missing
  97, // Message type not implemented
  98, // Message incompatible with state
  99, // IE not implemented
  100, // Invalid IE contents
  101, // Message incompatible with call state
  102, // Recovery on timer expiry
  111, // Protocol error
  127, // Interworking error
]);

/**
 * SIP response codes classified as carrier failures
 */
const SIP_CARRIER_CODES = new Set([
  404, // Not Found (unallocated)
  480, // Temporarily Unavailable
  500, // Server Internal Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Server Timeout
]);

/**
 * SIP response codes classified as user failures
 */
const SIP_USER_CODES = new Set([
  486, // Busy Here
  600, // Busy Everywhere
  603, // Decline
]);

/**
 * Classify SMS failure based on DIDWW error code
 *
 * @param errorCode - DIDWW error code from DLR callback
 * @returns 'carrier' for infrastructure issues, null if unrecognized
 */
export function classifySmsFailure(errorCode: number | undefined): FailureCategory | null {
  if (errorCode === undefined || errorCode === null) {
    return null;
  }

  if (SMS_CARRIER_ERROR_CODES.has(errorCode)) {
    return 'carrier';
  }

  // Unknown error codes - be conservative, don't penalize user
  return 'carrier';
}

/**
 * Classify Voice failure based on Q.850 cause code
 *
 * @param q850Cause - ITU-T Q.850 cause code from hangup event
 * @returns 'carrier' for network issues, 'user' for user-side issues, null if normal clearing
 */
export function classifyVoiceFailure(q850Cause: number | undefined): FailureCategory | null {
  if (q850Cause === undefined || q850Cause === null) {
    return null;
  }

  // Normal call clearing - not a failure
  if (q850Cause === 16 || q850Cause === 31) {
    return null;
  }

  if (Q850_USER_CAUSES.has(q850Cause)) {
    return 'user';
  }

  if (Q850_CARRIER_CAUSES.has(q850Cause)) {
    return 'carrier';
  }

  // Unknown failure causes - be conservative, treat as carrier issue
  return 'carrier';
}

/**
 * Classify Voice failure based on SIP response code
 * SIP codes take precedence over Q.850 when available
 *
 * @param sipCode - SIP response code
 * @returns 'carrier' for server issues, 'user' for user-side issues, null if unrecognized
 */
export function classifySipFailure(sipCode: number | undefined): FailureCategory | null {
  if (sipCode === undefined || sipCode === null) {
    return null;
  }

  if (SIP_USER_CODES.has(sipCode)) {
    return 'user';
  }

  if (SIP_CARRIER_CODES.has(sipCode)) {
    return 'carrier';
  }

  // 4xx client errors (except 486) - could be carrier config
  if (sipCode >= 400 && sipCode < 500) {
    return 'carrier';
  }

  // 5xx server errors - carrier issues
  if (sipCode >= 500 && sipCode < 600) {
    return 'carrier';
  }

  // 6xx global failures
  if (sipCode >= 600) {
    return 'user';
  }

  return null;
}

/**
 * Get failure category for shadow-banned requests
 */
export function classifyShadowBan(): FailureCategory {
  return 'fraud';
}
