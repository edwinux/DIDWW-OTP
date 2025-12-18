/**
 * Shadow Ban Simulator
 *
 * Generates realistic fake event sequences for shadow-banned requests.
 * Events are stored in the database, broadcast via WebSocket, and sent via webhooks
 * to maintain the illusion of successful delivery.
 */

import type { ChannelType } from '../channels/IChannelProvider.js';
import { emitOtpEvent } from './OtpEventService.js';
import { logger } from '../utils/logger.js';

/**
 * Event sequence definition
 */
interface SimulatedEvent {
  eventType: string;
  delayMs: number;
}

/**
 * SMS event sequence for shadow-banned requests
 * Simulates: sending → sent → delivered
 */
const SMS_EVENT_SEQUENCE: SimulatedEvent[] = [
  { eventType: 'sending', delayMs: 300 },
  { eventType: 'sent', delayMs: 800 },
  { eventType: 'delivered', delayMs: 2500 + Math.random() * 2000 },
];

/**
 * Voice event sequence for shadow-banned requests
 * Simulates: calling → ringing → answered → playing → completed
 */
const VOICE_EVENT_SEQUENCE: SimulatedEvent[] = [
  { eventType: 'calling', delayMs: 300 },
  { eventType: 'ringing', delayMs: 1200 },
  { eventType: 'answered', delayMs: 3000 + Math.random() * 2000 },
  { eventType: 'playing', delayMs: 4500 + Math.random() * 1000 },
  { eventType: 'completed', delayMs: 12000 + Math.random() * 3000 },
];

/**
 * Shadow Ban Simulator
 */
export class ShadowBanSimulator {
  /**
   * Simulate OTP delivery for a shadow-banned request
   * Emits realistic fake events with appropriate timing delays
   */
  async simulate(requestId: string, channel: ChannelType): Promise<void> {
    const sequence = this.getEventSequence(channel);

    logger.info('ShadowBanSimulator: Starting simulation', {
      requestId,
      channel,
      eventCount: sequence.length,
    });

    // Schedule all events with their delays
    for (const event of sequence) {
      this.scheduleEvent(requestId, channel, event);
    }
  }

  /**
   * Get the event sequence for a channel
   */
  private getEventSequence(channel: ChannelType): SimulatedEvent[] {
    if (channel === 'sms') {
      // Add some randomness to delays
      return SMS_EVENT_SEQUENCE.map((e) => ({
        eventType: e.eventType,
        delayMs: e.delayMs + Math.random() * 500,
      }));
    } else if (channel === 'voice') {
      return VOICE_EVENT_SEQUENCE.map((e) => ({
        eventType: e.eventType,
        delayMs: e.delayMs + Math.random() * 500,
      }));
    }

    // Default to SMS sequence for unknown channels
    return SMS_EVENT_SEQUENCE;
  }

  /**
   * Schedule a single event emission
   */
  private scheduleEvent(
    requestId: string,
    channel: ChannelType,
    event: SimulatedEvent
  ): void {
    setTimeout(() => {
      try {
        // Emit the fake event through the normal event system
        // This stores it in the database, broadcasts via WebSocket,
        // and sends HTTP webhooks if configured
        emitOtpEvent(requestId, channel, event.eventType as any, {
          simulated: true, // Internal marker, not exposed to clients
        });

        logger.debug('ShadowBanSimulator: Event emitted', {
          requestId,
          channel,
          eventType: event.eventType,
        });
      } catch (error) {
        // Log but don't throw - shadow ban must not leak errors
        logger.error('ShadowBanSimulator: Failed to emit event', {
          requestId,
          channel,
          eventType: event.eventType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, event.delayMs);
  }

  /**
   * Get estimated total simulation time for a channel (for testing/debugging)
   */
  getEstimatedDuration(channel: ChannelType): number {
    const sequence = channel === 'sms' ? SMS_EVENT_SEQUENCE : VOICE_EVENT_SEQUENCE;
    return Math.max(...sequence.map((e) => e.delayMs)) + 1000;
  }
}

/**
 * Singleton instance
 */
let instance: ShadowBanSimulator | null = null;

/**
 * Get singleton instance
 */
export function getShadowBanSimulator(): ShadowBanSimulator {
  if (!instance) {
    instance = new ShadowBanSimulator();
  }
  return instance;
}
