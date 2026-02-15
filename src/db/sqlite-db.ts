'use no memo';

import type { SqlValue } from '@sqlite.org/sqlite-wasm';

/** A row returned by SQLite in object mode */
export type SqlRow = Record<string, SqlValue>;

/**
 * Minimal database adapter matching the three db.exec() call patterns
 * used throughout db.worker.ts. Implementations:
 * - OpfsSqliteDb: wraps OpfsDatabase for production (browser)
 * - MemorySqliteDb: wraps better-sqlite3 for testing (Node)
 */
export interface SqliteDb {
  /** Execute SQL with no result (INSERT, UPDATE, DELETE, DDL) */
  run(sql: string, bind?: SqlValue[]): void;

  /** Execute SQL, return all matching rows as objects */
  query(sql: string, bind?: SqlValue[]): SqlRow[];

  /** Execute raw SQL string (for multi-statement schema init) */
  execRaw(sql: string): void;
}
