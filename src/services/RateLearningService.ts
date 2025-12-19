/**
 * Rate Learning Service
 *
 * Background service that processes CDRs and learns carrier rates.
 * Runs periodically to update the carrier_rates table.
 */

import { CdrRepository } from '../repositories/CdrRepository.js';
import { CarrierRatesRepository } from '../repositories/CarrierRatesRepository.js';
import { logger } from '../utils/logger.js';

/**
 * Rate Learning Service
 */
export class RateLearningService {
  private cdrRepo: CdrRepository;
  private ratesRepo: CarrierRatesRepository;
  private intervalId: NodeJS.Timeout | null = null;
  private batchSize: number;

  constructor(cdrRepo: CdrRepository, ratesRepo: CarrierRatesRepository, batchSize = 1000) {
    this.cdrRepo = cdrRepo;
    this.ratesRepo = ratesRepo;
    this.batchSize = batchSize;
  }

  /**
   * Run a single learning cycle
   */
  runLearningCycle(): { processed: number; updated: number } {
    const cdrs = this.cdrRepo.findUnprocessedForRates(this.batchSize);

    if (cdrs.length === 0) {
      return { processed: 0, updated: 0 };
    }

    let updated = 0;
    const processedIds: string[] = [];

    for (const cdr of cdrs) {
      // Only learn from successful calls with valid pricing
      if (cdr.success && cdr.price > 0 && cdr.billing_duration > 0) {
        // Convert price to 1/10000 dollars (rate per minute for voice)
        const ratePerMinute = (cdr.price / cdr.billing_duration) * 60;
        const rateUnits = Math.round(ratePerMinute * 10000);

        this.ratesRepo.upsertRate({
          channel: 'voice',
          dstPrefix: cdr.dst_prefix,
          srcPrefix: cdr.src_prefix,
          rateUnits,
          billingIncrement: cdr.next_billing_interval || cdr.initial_billing_interval || 60,
        });
        updated++;
      }
      processedIds.push(cdr.id);
    }

    // Mark all as processed
    this.cdrRepo.markAsProcessed(processedIds);

    logger.info('Rate learning cycle complete', { processed: cdrs.length, updated });
    return { processed: cdrs.length, updated };
  }

  /**
   * Start periodic learning
   */
  startPeriodicLearning(intervalMinutes: number): void {
    if (this.intervalId) {
      this.stopPeriodicLearning();
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    this.intervalId = setInterval(() => {
      try {
        this.runLearningCycle();
      } catch (error) {
        logger.error('Rate learning cycle failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, intervalMs);

    // Don't block process exit
    this.intervalId.unref();

    logger.info('Rate learning started', { intervalMinutes });

    // Run immediately on start
    try {
      this.runLearningCycle();
    } catch (error) {
      logger.error('Initial rate learning cycle failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Stop periodic learning
   */
  stopPeriodicLearning(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Rate learning stopped');
    }
  }
}
