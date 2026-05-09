import Database from "better-sqlite3";
import { copyFile, unlink } from "node:fs/promises";
import type { SqliteDb, SqlRow, SqlValue } from "../src/db/sqlite-db.ts";

export interface ServerSqliteAdapter extends SqliteDb {
  backup(destinationPath: string): Promise<void>;
  replaceDatabase(sourcePath: string): Promise<void>;
  close(): void;
}

export function createSqliteAdapter(filePath: string): ServerSqliteAdapter {
  let db = openDatabase(filePath);

  function reopen() {
    db = openDatabase(filePath);
  }

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

    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },

    async backup(destinationPath: string) {
      await db.backup(destinationPath);
    },

    async replaceDatabase(sourcePath: string) {
      db.close();
      await removeSqliteSidecars(filePath);
      await copyFile(sourcePath, filePath);
      await removeSqliteSidecars(filePath);
      reopen();
    },

    close() {
      db.close();
    },
  };
}

async function removeSqliteSidecars(filePath: string): Promise<void> {
  await Promise.all([
    removeIfPresent(`${filePath}-wal`),
    removeIfPresent(`${filePath}-shm`),
  ]);
}

async function removeIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function openDatabase(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
