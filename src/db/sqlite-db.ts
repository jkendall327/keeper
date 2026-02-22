/** SQLite bind value — replaces the @sqlite.org/sqlite-wasm import */
export type SqlValue = string | number | null | Uint8Array;

/** A row returned by SQLite in object mode */
export type SqlRow = Record<string, SqlValue>;

/**
 * Minimal database adapter matching the three db.exec() call patterns
 * used throughout the codebase. Implementations:
 * - server/sqlite-adapter.ts: wraps better-sqlite3 for production (Node)
 * - src/db/__tests__/test-db.ts: wraps better-sqlite3 in-memory for testing
 */
export interface SqliteDb {
  /** Execute SQL with no result (INSERT, UPDATE, DELETE, DDL) */
  run(sql: string, bind?: SqlValue[]): void;

  /** Execute SQL, return all matching rows as objects */
  query(sql: string, bind?: SqlValue[]): SqlRow[];

  /** Execute raw SQL string (for multi-statement schema init) */
  execRaw(sql: string): void;
}
