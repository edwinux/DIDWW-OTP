/**
 * Repositories Module
 *
 * Exports all repository classes.
 */

export { OtpRequestRepository } from './OtpRequestRepository.js';
export type { OtpRequest, OtpStatus, CreateOtpRequestInput } from './OtpRequestRepository.js';

export { FraudRulesRepository } from './FraudRulesRepository.js';
export type {
  CircuitBreaker,
  CircuitBreakerState,
  IpReputation,
  AsnBlocklistEntry,
} from './FraudRulesRepository.js';

export { WebhookLogRepository } from './WebhookLogRepository.js';
export type { WebhookLog } from './WebhookLogRepository.js';
