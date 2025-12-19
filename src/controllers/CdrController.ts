/**
 * CDR Controller
 *
 * HTTP handler for DIDWW CDR streaming webhook.
 * Receives gzip-compressed batches of CDR records.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { CdrRepository, type CreateCdrInput } from '../repositories/CdrRepository.js';
import { getPhoneNumberService } from '../services/PhoneNumberService.js';
import { logger } from '../utils/logger.js';

/**
 * DIDWW CDR record schema
 * Based on https://doc.didww.com/call-events/termination-cdr.html
 */
const didwwCdrSchema = z.object({
  id: z.string(),
  call_id: z.string().nullable().optional(),
  type: z.string(),
  time_start: z.string(),
  time_connect: z.string().nullable().optional(),
  time_end: z.string(),
  duration: z.number(),
  billing_duration: z.number(),
  rate: z.number(),
  price: z.number(),
  initial_billing_interval: z.number().nullable().optional(),
  next_billing_interval: z.number().nullable().optional(),
  success: z.boolean(),
  disconnect_code: z.number().nullable().optional(),
  disconnect_reason: z.string().nullable().optional(),
  source_ip: z.string().nullable().optional(),
  source_port: z.number().nullable().optional(),
  source_protocol: z.string().nullable().optional(),
  trunk_name: z.string().nullable().optional(),
  pop: z.string().nullable().optional(),
  original_src_number: z.string().nullable().optional(),
  src_number: z.string(),
  dst_number: z.string(),
  call_type: z.string().nullable().optional(),
  user_agent: z.string().nullable().optional(),
  p_charge_info: z.string().nullable().optional(),
  customer_vat: z.number().nullable().optional(),
});

type DidwwCdr = z.infer<typeof didwwCdrSchema>;

/**
 * Parse ISO 8601 timestamp to milliseconds
 */
function parseTimestamp(isoString: string | null | undefined): number | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  return isNaN(date.getTime()) ? null : date.getTime();
}

/**
 * CDR Controller
 */
export class CdrController {
  private cdrRepo: CdrRepository;
  private targetTrunkId: string;

  constructor(cdrRepo: CdrRepository, targetTrunkId: string) {
    this.cdrRepo = cdrRepo;
    this.targetTrunkId = targetTrunkId;
  }

  /**
   * Handle POST /webhooks/cdr - DIDWW CDR streaming callback
   *
   * CDRs arrive as gzip-compressed, newline-delimited JSON records.
   * Up to 1000 records per request.
   */
  async handleCdrBatch(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();

    // Log raw request info for debugging
    logger.debug('CDR batch received', {
      contentType: req.headers['content-type'],
      contentEncoding: req.headers['content-encoding'],
      bodyLength: req.body ? JSON.stringify(req.body).length : 0,
    });

    try {
      // Body could be:
      // 1. Array of CDR objects (if middleware parsed JSON array)
      // 2. String with newline-delimited JSON (if raw)
      // 3. Single object (single CDR)
      let records: unknown[] = [];

      if (Array.isArray(req.body)) {
        records = req.body;
      } else if (typeof req.body === 'string') {
        // Parse newline-delimited JSON
        const lines = req.body.split('\n').filter((line) => line.trim());
        for (const line of lines) {
          try {
            records.push(JSON.parse(line));
          } catch {
            logger.warn('Failed to parse CDR line', { line: line.slice(0, 100) });
          }
        }
      } else if (typeof req.body === 'object' && req.body !== null) {
        // Single CDR object
        records = [req.body];
      }

      if (records.length === 0) {
        logger.warn('CDR batch received with no valid records');
        res.status(200).json({ status: 'acknowledged', processed: 0 });
        return;
      }

      // Filter and validate CDRs
      const pendingCdrs: { cdr: DidwwCdr; trunkId: string; timeStart: number; timeEnd: number }[] = [];
      let filtered = 0;
      let invalid = 0;

      for (const record of records) {
        // DIDWW sends JSON:API format with attributes wrapper - unwrap if needed
        let flatRecord = record;
        if (
          typeof record === 'object' &&
          record !== null &&
          'attributes' in record &&
          typeof (record as Record<string, unknown>).attributes === 'object'
        ) {
          const { id, type, attributes } = record as { id?: string; type?: string; attributes: Record<string, unknown> };
          flatRecord = { id, type, ...attributes };
        }

        const validation = didwwCdrSchema.safeParse(flatRecord);

        if (!validation.success) {
          invalid++;
          logger.debug('Invalid CDR record', {
            errors: validation.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
            rawRecord: JSON.stringify(flatRecord).slice(0, 500),
          });
          continue;
        }

        const cdr = validation.data;

        // Extract trunk_id from trunk_name (DIDWW format varies)
        // The trunk_id might be in trunk_name or we need to match by other means
        // For now, we'll store all CDRs but mark them with trunk info
        const trunkId = this.extractTrunkId(cdr);

        // Filter by target trunk if specified
        if (this.targetTrunkId && trunkId !== this.targetTrunkId) {
          filtered++;
          continue;
        }

        // Convert to CreateCdrInput
        const timeStart = parseTimestamp(cdr.time_start);
        const timeEnd = parseTimestamp(cdr.time_end);

        if (!timeStart || !timeEnd) {
          invalid++;
          logger.warn('CDR with invalid timestamps skipped', {
            id: cdr.id,
            time_start: cdr.time_start,
            time_end: cdr.time_end,
          });
          continue;
        }

        pendingCdrs.push({ cdr, trunkId: trunkId || 'unknown', timeStart, timeEnd });
      }

      // Lookup phone metadata in parallel (limited batch size to avoid overwhelming)
      const phoneService = getPhoneNumberService();
      const METADATA_BATCH_SIZE = 50;
      const validCdrs: CreateCdrInput[] = [];

      for (let i = 0; i < pendingCdrs.length; i += METADATA_BATCH_SIZE) {
        const batch = pendingCdrs.slice(i, i + METADATA_BATCH_SIZE);

        // Lookup metadata for all phones in batch in parallel
        const metadataPromises = batch.map(async ({ cdr, trunkId, timeStart, timeEnd }) => {
          // Lookup destination phone metadata
          const dstMeta = await phoneService.parseExtended(cdr.dst_number).catch(() => null);
          // Lookup source phone metadata (less important, may be our own number)
          const srcMeta = await phoneService.parseExtended(cdr.src_number).catch(() => null);

          return {
            id: cdr.id,
            call_id: cdr.call_id,
            trunk_id: trunkId,
            time_start: timeStart,
            time_connect: parseTimestamp(cdr.time_connect) ?? undefined,
            time_end: timeEnd,
            duration: cdr.duration,
            billing_duration: cdr.billing_duration,
            initial_billing_interval: cdr.initial_billing_interval,
            next_billing_interval: cdr.next_billing_interval,
            rate: cdr.rate,
            price: cdr.price,
            success: cdr.success,
            disconnect_code: cdr.disconnect_code,
            disconnect_reason: cdr.disconnect_reason,
            source_ip: cdr.source_ip,
            trunk_name: cdr.trunk_name,
            pop: cdr.pop,
            src_number: cdr.src_number,
            dst_number: cdr.dst_number,
            call_type: cdr.call_type,
            // V8: Phone metadata
            dst_carrier: dstMeta?.carrier ?? undefined,
            dst_geocoding: dstMeta?.geocoding ?? undefined,
            dst_timezone: dstMeta?.timezones?.[0] ?? undefined,
            src_carrier: srcMeta?.carrier ?? undefined,
            src_geocoding: srcMeta?.geocoding ?? undefined,
          } as CreateCdrInput;
        });

        const batchResults = await Promise.all(metadataPromises);
        validCdrs.push(...batchResults);
      }

      // Bulk insert valid CDRs
      let inserted = 0;
      if (validCdrs.length > 0) {
        inserted = this.cdrRepo.bulkCreate(validCdrs);
      }

      const duration = Date.now() - startTime;

      logger.info('CDR batch processed', {
        received: records.length,
        valid: validCdrs.length,
        inserted,
        filtered,
        invalid,
        durationMs: duration,
      });

      res.status(200).json({
        status: 'received',
        processed: inserted,
        filtered,
        invalid,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('CDR batch processing failed', { error: errorMessage });

      // Still return 200 to prevent DIDWW retries flooding us
      res.status(200).json({
        status: 'error',
        message: 'Processing failed, acknowledged',
      });
    }
  }

  /**
   * Extract trunk ID from CDR record
   * DIDWW may provide trunk info in different fields
   */
  private extractTrunkId(cdr: DidwwCdr): string | null {
    // Try trunk_name first (often contains trunk UUID)
    if (cdr.trunk_name) {
      // Check if trunk_name is a UUID
      const uuidMatch = cdr.trunk_name.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch) {
        return uuidMatch[0].toLowerCase();
      }
      return cdr.trunk_name;
    }

    // Could also check p_charge_info or other fields
    return null;
  }
}
