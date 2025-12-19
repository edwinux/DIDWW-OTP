/**
 * Cost Prediction Service
 *
 * Predicts OTP delivery costs using learned carrier rates.
 * Also learns from actual delivery costs (DLR/CDR callbacks).
 */

import { CarrierRatesRepository } from '../repositories/CarrierRatesRepository.js';
import { getPhoneNumberService } from './PhoneNumberService.js';
import { getConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Cost prediction result
 */
export interface CostPrediction {
  estimatedCostUnits: number; // In 1/10000 dollars
  estimatedCostUsd: number;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchedPrefix: string | null;
  sampleCount: number;
}

/**
 * Cost prediction service options
 */
export interface CostPredictionOptions {
  defaultSmsRateUnits?: number;
  defaultVoiceRateUnits?: number;
}

/**
 * Cost Prediction Service
 */
export class CostPredictionService {
  private ratesRepo: CarrierRatesRepository;
  private phoneService = getPhoneNumberService();

  // Default rates when no learned data (in 1/10000 dollars)
  // Configurable via CDR_DEFAULT_SMS_RATE_UNITS and CDR_DEFAULT_VOICE_RATE_UNITS
  private readonly defaultSmsRate: number;
  private readonly defaultVoiceRate: number;

  constructor(ratesRepo: CarrierRatesRepository, options?: CostPredictionOptions) {
    this.ratesRepo = ratesRepo;
    this.defaultSmsRate = options?.defaultSmsRateUnits ?? 100; // $0.01 per SMS
    this.defaultVoiceRate = options?.defaultVoiceRateUnits ?? 200; // $0.02 per minute
  }

  /**
   * Predict cost for OTP delivery
   */
  predict(channel: 'sms' | 'voice', dstPhone: string, srcPhone?: string): CostPrediction {
    const srcPrefix = srcPhone ? this.phoneService.extractPrefix(srcPhone, 4) : null;
    const rate = this.ratesRepo.findBestMatchingRate(channel, dstPhone, srcPrefix);

    if (!rate) {
      // No learned rate, use configurable default
      const defaultRate = channel === 'sms' ? this.defaultSmsRate : this.defaultVoiceRate;
      return {
        estimatedCostUnits: defaultRate,
        estimatedCostUsd: defaultRate / 10000,
        confidence: 'none',
        matchedPrefix: null,
        sampleCount: 0,
      };
    }

    // Determine confidence level
    let confidence: 'high' | 'medium' | 'low';
    if (rate.confidence_score >= 0.7) {
      confidence = 'high';
    } else if (rate.confidence_score >= 0.3) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return {
      estimatedCostUnits: rate.rate_avg,
      estimatedCostUsd: rate.rate_avg / 10000,
      confidence,
      matchedPrefix: rate.dst_prefix,
      sampleCount: rate.sample_count,
    };
  }

  /**
   * Learn from actual SMS cost (from DLR callback)
   */
  learnSmsRate(dstPhone: string, costUnits: number, fragments: number = 1): void {
    const dstPrefix = this.phoneService.extractPrefix(dstPhone, 4);
    if (!dstPrefix) return;

    // Cost per fragment
    const ratePerFragment = Math.round(costUnits / fragments);

    this.ratesRepo.upsertRate({
      channel: 'sms',
      dstPrefix,
      rateUnits: ratePerFragment,
      billingIncrement: 1, // SMS billed per fragment
    });

    logger.debug('SMS rate learned', { dstPrefix, ratePerFragment, fragments });
  }

  /**
   * Check if predicted cost exceeds maximum
   */
  exceedsMaxCost(channel: 'sms' | 'voice', dstPhone: string, maxCostUnits: number): boolean {
    const prediction = this.predict(channel, dstPhone);
    return prediction.estimatedCostUnits > maxCostUnits;
  }

  /**
   * Get rate statistics
   */
  getStats(): { total: number; sms: number; voice: number; avgConfidence: number } {
    return this.ratesRepo.getStats();
  }
}

// Singleton instance
let instance: CostPredictionService | null = null;

export function getCostPredictionService(): CostPredictionService {
  if (!instance) {
    const config = getConfig();
    instance = new CostPredictionService(new CarrierRatesRepository(), {
      defaultSmsRateUnits: config.cdr.defaultSmsRateUnits,
      defaultVoiceRateUnits: config.cdr.defaultVoiceRateUnits,
    });
  }
  return instance;
}

export function initCostPredictionService(
  ratesRepo: CarrierRatesRepository,
  options?: CostPredictionOptions
): CostPredictionService {
  instance = new CostPredictionService(ratesRepo, options);
  return instance;
}
