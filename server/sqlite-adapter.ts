import Database from "better-sqlite3";
import type { SqliteDb, SqlRow, SqlValue } from "../src/db/sqlite-db.ts";

export function createSqliteAdapter(filePath: string): SqliteDb {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return {
    run(sql: string, bind?: SqlValue[]) {
      if (bind !== undefined && bind.length > 0) {
        db.prepare(sql).run(...bind);
      } else {
        db.exec(sql);
      }
    },
    query(sql: string, bind?: SqlValue[]): SqlRow[] {
      const stmt = db.prepare(sql);
      const rows =
        bind !== undefined && bind.length > 0
          ? stmt.all(...bind)
          : stmt.all();
      return rows as SqlRow[];
    },
    execRaw(sql: string) {
      db.exec(sql);
    },
  };
}
