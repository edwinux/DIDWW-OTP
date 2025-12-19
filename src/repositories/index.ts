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

export { CallerIdRoutingRepository, normalizePrefix, validateVoiceCallerId } from './CallerIdRoutingRepository.js';
export type {
  CallerIdRoute,
  RoutingChannel,
  CreateCallerIdRouteInput,
  UpdateCallerIdRouteInput,
} from './CallerIdRoutingRepository.js';

export { WhitelistRepository, validateIp, validatePhone, normalizePhone, normalizeIp } from './WhitelistRepository.js';
export type {
  WhitelistType,
  WhitelistEntry,
  CreateWhitelistInput,
} from './WhitelistRepository.js';

export { CdrRepository } from './CdrRepository.js';
export type { CdrRecord, CreateCdrInput } from './CdrRepository.js';

export { CarrierRatesRepository } from './CarrierRatesRepository.js';
export type { CarrierRate, UpsertRateInput } from './CarrierRatesRepository.js';

export { FraudSavingsRepository } from './FraudSavingsRepository.js';
export type { FraudSaving } from './FraudSavingsRepository.js';
