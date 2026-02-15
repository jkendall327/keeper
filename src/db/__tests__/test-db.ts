import Database from 'better-sqlite3';
import type { SqliteDb, SqlRow } from '../sqlite-db.ts';
import type { SqlValue } from '@sqlite.org/sqlite-wasm';

export function createTestDb(): SqliteDb {
  const db = new Database(':memory:');
  // Enable WAL and foreign keys like the real schema does
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return {
    run(sql: string, bind?: SqlValue[]) {
      if (bind && bind.length > 0) {
        db.prepare(sql).run(...bind);
      } else {
        db.exec(sql);
      }
    },
    query(sql: string, bind?: SqlValue[]): SqlRow[] {
      const stmt = db.prepare(sql);
      const rows = bind && bind.length > 0 ? stmt.all(...bind) : stmt.all();
      return rows as SqlRow[];
    },
    execRaw(sql: string) {
      db.exec(sql);
    },
  };
}
