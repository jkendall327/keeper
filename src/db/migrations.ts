import type { SqliteDb, SqlRow } from "./sqlite-db.ts";
import { SCHEMA_SQL } from "./schema.ts";
import { extractUrls } from "./url-detect.ts";

const BASELINE_SCHEMA_VERSION = 1;

interface Migration {
  version: number;
  name: string;
  up: (db: SqliteDb) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 2,
    name: "link metadata subsystem",
    up: (db) => {
      db.execRaw(SCHEMA_SQL);

      const noteRows = db.query("SELECT id, body FROM notes");
      for (const noteRow of noteRows) {
        const noteId = noteRow["id"];
        const body = noteRow["body"];
        if (typeof noteId !== "string" || typeof body !== "string") continue;
        const urls = Array.from(new Set(extractUrls(body)));
        urls.forEach((url, index) => {
          db.run(
            "INSERT OR IGNORE INTO note_links (note_id, url, position) VALUES (?, ?, ?)",
            [noteId, url, index],
          );
        });
      }

      if (hasTable(db, "link_previews")) {
        db.execRaw(`
INSERT OR IGNORE INTO link_metadata (
  url, image_url, status, fetched_at, updated_at
)
SELECT url, image_url, status, fetched_at, updated_at
FROM link_previews;
`);
      }
    },
  },
];

export const CURRENT_SCHEMA_VERSION =
  MIGRATIONS.at(-1)?.version ?? BASELINE_SCHEMA_VERSION;

function rowNumber(row: SqlRow | undefined, key: string): number {
  const value = row?.[key];
  if (typeof value !== "number") {
    throw new Error(`Expected ${key} to be a number`);
  }
  return value;
}

function getUserVersion(db: SqliteDb): number {
  return rowNumber(db.query("PRAGMA user_version")[0], "user_version");
}

function setUserVersion(db: SqliteDb, version: number): void {
  db.execRaw(`PRAGMA user_version = ${String(version)}`);
}

function hasTable(db: SqliteDb, tableName: string): boolean {
  return db.query(
    "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName],
  ).length > 0;
}

function hasColumn(db: SqliteDb, tableName: string, columnName: string): boolean {
  return db
    .query(`PRAGMA table_info(${tableName})`)
    .some((column) => column["name"] === columnName);
}

function addColumnIfMissing(
  db: SqliteDb,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): void {
  if (!hasTable(db, tableName) || hasColumn(db, tableName, columnName)) return;
  db.execRaw(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
}

function applyBaseline(db: SqliteDb): void {
  addColumnIfMissing(
    db,
    "notes",
    "pinned",
    "pinned INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "notes",
    "archived",
    "archived INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "notes",
    "trashed",
    "trashed INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(db, "tags", "icon", "icon TEXT DEFAULT NULL");

  db.execRaw(SCHEMA_SQL);

  db.execRaw(`
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned);
CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes(archived);
CREATE INDEX IF NOT EXISTS idx_notes_trashed ON notes(trashed);
`);

  db.execRaw("INSERT INTO notes_fts(notes_fts) VALUES ('rebuild')");
}

export function migrate(db: SqliteDb): void {
  db.execRaw(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
`);

  let currentVersion = getUserVersion(db);
  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${String(currentVersion)} is newer than supported version ${String(CURRENT_SCHEMA_VERSION)}`,
    );
  }

  if (currentVersion === CURRENT_SCHEMA_VERSION) return;

  db.execRaw("BEGIN");
  try {
    if (currentVersion === 0) {
      applyBaseline(db);
      setUserVersion(db, BASELINE_SCHEMA_VERSION);
      currentVersion = BASELINE_SCHEMA_VERSION;
    }

    for (const migration of MIGRATIONS) {
      if (migration.version <= currentVersion) continue;
      if (migration.version !== currentVersion + 1) {
        throw new Error(
          `Migration ${migration.name} has version ${String(migration.version)}, expected ${String(currentVersion + 1)}`,
        );
      }
      migration.up(db);
      setUserVersion(db, migration.version);
      currentVersion = migration.version;
    }

    db.execRaw("COMMIT");
  } catch (error) {
    db.execRaw("ROLLBACK");
    throw error;
  }
}
