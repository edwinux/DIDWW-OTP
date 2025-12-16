/**
 * Admin Database Controller
 *
 * Provides read-only access to all database tables.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { getDb } from '../../database/index.js';
import { logger } from '../../utils/logger.js';

// Whitelist of tables that can be queried
const ALLOWED_TABLES = [
  'otp_requests',
  'ip_reputation',
  'prefix_reputation',
  'asn_blocklist',
  'circuit_breaker',
  'honeypot_ips',
  'auth_feedback',
  'webhook_logs',
];

interface TableInfo {
  name: string;
  rowCount: number;
  columns: { name: string; type: string; notNull: boolean; pk: boolean }[];
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export class DatabaseController {
  /**
   * GET /admin/db/tables
   * Get list of all tables with metadata
   */
  async getTables(_req: Request, res: Response): Promise<void> {
    try {
      const db = getDb();
      const tables: TableInfo[] = [];

      for (const tableName of ALLOWED_TABLES) {
        // Get row count
        const countStmt = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
        const countResult = countStmt.get() as { count: number };

        // Get column info
        const columnsStmt = db.prepare(`PRAGMA table_info(${tableName})`);
        const columnsResult = columnsStmt.all() as ColumnInfo[];

        tables.push({
          name: tableName,
          rowCount: countResult.count,
          columns: columnsResult.map((col) => ({
            name: col.name,
            type: col.type,
            notNull: col.notnull === 1,
            pk: col.pk === 1,
          })),
        });
      }

      res.json({ tables });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch tables', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch table list',
      });
    }
  }

  /**
   * GET /admin/db/tables/:tableName
   * Get table schema
   */
  async getTableSchema(req: Request, res: Response): Promise<void> {
    try {
      const { tableName } = req.params;

      if (!ALLOWED_TABLES.includes(tableName)) {
        res.status(404).json({
          error: 'not_found',
          message: `Table '${tableName}' not found or not accessible`,
        });
        return;
      }

      const db = getDb();

      // Get column info
      const columnsStmt = db.prepare(`PRAGMA table_info(${tableName})`);
      const columns = columnsStmt.all() as ColumnInfo[];

      // Get row count
      const countStmt = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
      const countResult = countStmt.get() as { count: number };

      res.json({
        name: tableName,
        rowCount: countResult.count,
        columns: columns.map((col) => ({
          name: col.name,
          type: col.type,
          notNull: col.notnull === 1,
          pk: col.pk === 1,
          defaultValue: col.dflt_value,
        })),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to fetch table schema', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch table schema',
      });
    }
  }

  /**
   * GET /admin/db/query/:tableName
   * Query table with pagination
   */
  async queryTable(req: Request, res: Response): Promise<void> {
    try {
      const { tableName } = req.params;

      if (!ALLOWED_TABLES.includes(tableName)) {
        res.status(404).json({
          error: 'not_found',
          message: `Table '${tableName}' not found or not accessible`,
        });
        return;
      }

      const querySchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(25).max(500).default(25),
        sort_by: z.string().optional(),
        sort_order: z.enum(['asc', 'desc']).default('desc'),
      });

      const validation = querySchema.safeParse(req.query);

      if (!validation.success) {
        res.status(400).json({
          error: 'validation_error',
          message: validation.error.issues.map((i) => `${i.path}: ${i.message}`).join(', '),
        });
        return;
      }

      const { page, limit, sort_by, sort_order } = validation.data;
      const offset = (page - 1) * limit;

      const db = getDb();

      // Get column names to validate sort_by
      const columnsStmt = db.prepare(`PRAGMA table_info(${tableName})`);
      const columns = columnsStmt.all() as ColumnInfo[];
      const columnNames = columns.map((c) => c.name);

      // Determine sort column (default to first column or primary key)
      let sortColumn = columnNames[0];
      if (sort_by && columnNames.includes(sort_by)) {
        sortColumn = sort_by;
      } else if (columnNames.includes('created_at')) {
        sortColumn = 'created_at';
      } else if (columnNames.includes('id')) {
        sortColumn = 'id';
      }

      const safeOrder = sort_order === 'asc' ? 'ASC' : 'DESC';

      // Query data
      const dataStmt = db.prepare(`
        SELECT * FROM ${tableName}
        ORDER BY ${sortColumn} ${safeOrder}
        LIMIT ? OFFSET ?
      `);
      const data = dataStmt.all(limit, offset);

      // Get total count
      const countStmt = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`);
      const countResult = countStmt.get() as { count: number };
      const total = countResult.count;
      const totalPages = Math.ceil(total / limit);

      res.json({
        columns: columnNames,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to query table', { error: errorMessage });
      res.status(500).json({
        error: 'internal_error',
        message: 'Failed to query table',
      });
    }
  }
}
