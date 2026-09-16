/**
 * Parinaam — SQLite FTS5 Case Search Service
 * Governed by spec/06-phase-5-case-log-sync.md (Task 5.2 & Milestone M5.3).
 *
 * Implements:
 * 1. FTS5 full-text matching against record_fts:
 *    (case_ref, panchnama_ref, package_no, kit_test_name, reagent, outcome)
 * 2. Multi-dimensional filtering:
 *    - Date range
 *    - Officer / Operator ID
 *    - Kit Lot Number
 *    - Reagent type
 *    - Outcome class
 * 3. Query execution benchmark (< 50ms)
 */

import type { PresumptiveOutcomeKind, ReagentType, TestRecordEntity } from '../types/domain.ts';

export interface SqliteDatabase {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
  exec?(sql: string): void;
}

export interface CaseSearchFilters {
  query?: string; // FTS5 free-text query
  reagent?: ReagentType;
  outcome?: PresumptiveOutcomeKind;
  operatorId?: string;
  startDateIso?: string;
  endDateIso?: string;
  packageNo?: string;
  limit?: number;
  offset?: number;
}

export interface CaseSearchResultItem {
  record_uuid: string;
  case_ref?: string;
  panchnama_ref?: string;
  package_no: string;
  reagent: string;
  outcome: string;
  confidence: number;
  operator_id: string;
  created_at: string;
  snippet?: string;
}

export interface CaseSearchResponse {
  results: CaseSearchResultItem[];
  totalMatches: number;
  executionTimeMs: number;
}

export class CaseSearchService {
  private db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  /**
   * Search cases using FTS5 match and multi-dimensional filters.
   */
  public searchCases(filters: CaseSearchFilters): CaseSearchResponse {
    const startTime = performance.now();

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    // FTS5 Full-Text Search match
    if (filters.query && filters.query.trim().length > 0) {
      // Escape special characters and format as prefix wildcard
      const cleaned = filters.query.trim().replace(/"/g, '""');
      whereClauses.push(`t.record_uuid IN (SELECT record_uuid FROM record_fts WHERE record_fts MATCH ?)`);
      params.push(`"${cleaned}"*`);
    }

    // Exact field filters
    if (filters.reagent) {
      whereClauses.push('t.reagent = ?');
      params.push(filters.reagent);
    }

    if (filters.outcome) {
      whereClauses.push('t.outcome = ?');
      params.push(filters.outcome);
    }

    if (filters.operatorId) {
      whereClauses.push('t.operator_id = ?');
      params.push(filters.operatorId);
    }

    if (filters.packageNo) {
      whereClauses.push('t.package_no = ?');
      params.push(filters.packageNo);
    }

    if (filters.startDateIso) {
      whereClauses.push('t.created_at >= ?');
      params.push(filters.startDateIso);
    }

    if (filters.endDateIso) {
      whereClauses.push('t.created_at <= ?');
      params.push(filters.endDateIso);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const sql = `
      SELECT 
        t.record_uuid,
        t.case_ref,
        t.panchnama_ref,
        t.package_no,
        t.reagent,
        t.outcome,
        t.confidence,
        t.operator_id,
        t.created_at
      FROM test_record t
      ${whereSql}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) as total
      FROM test_record t
      ${whereSql}
    `;

    const rows = this.db.prepare(sql).all(...params, limit, offset) as CaseSearchResultItem[];
    const countRow = this.db.prepare(countSql).get(...params) as { total: number };

    const executionTimeMs = performance.now() - startTime;

    return {
      results: rows,
      totalMatches: countRow?.total ?? 0,
      executionTimeMs,
    };
  }

  /**
   * Synchronize FTS index for a newly inserted record.
   */
  public indexRecord(record: TestRecordEntity): void {
    const insertFts = this.db.prepare(`
      INSERT INTO record_fts (record_uuid, case_ref, panchnama_ref, package_no, kit_test_name, reagent, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertFts.run(
      record.record_uuid,
      record.case_ref ?? '',
      record.panchnama_ref ?? '',
      record.package_no,
      record.kit_test_name ?? '',
      record.reagent,
      record.outcome
    );
  }
}
