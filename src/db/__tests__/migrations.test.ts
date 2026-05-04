import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-db.ts";
import { createKeeperDB } from "../db-impl.ts";
import { CURRENT_SCHEMA_VERSION, migrate } from "../migrations.ts";
import { toNoteId } from "../types.ts";

function scalarNumber(value: unknown): number {
  if (typeof value !== "number") {
    throw new Error("Expected numeric SQLite value");
  }
  return value;
}

describe("database migrations", () => {
  it("bootstraps a fresh database to the current schema version", () => {
    const db = createTestDb();

    migrate(db);

    const columns = db.query("PRAGMA table_info(notes)").map((row) => row["name"]);
    expect(columns).toContain("pinned");
    expect(columns).toContain("archived");
    expect(columns).toContain("trashed");

    const tagColumns = db.query("PRAGMA table_info(tags)").map((row) => row["name"]);
    expect(tagColumns).toContain("icon");

    const userVersion = scalarNumber(
      db.query("PRAGMA user_version")[0]?.["user_version"],
    );
    expect(userVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("marks an already-migrated database without rerunning the baseline", () => {
    const db = createTestDb();
    migrate(db);

    db.execRaw(`
INSERT INTO notes (id, title, body, has_links, pinned, archived, trashed, created_at, updated_at)
VALUES ('note-1', 'Stable', 'Already migrated', 0, 0, 0, 0, '2025-01-01', '2025-01-01');
`);

    migrate(db);

    const rows = db.query("SELECT id, title FROM notes");
    expect(rows).toEqual([{ id: "note-1", title: "Stable" }]);
  });

  it("upgrades the unversioned legacy schema while preserving data", async () => {
    const db = createTestDb();
    db.execRaw(`
CREATE TABLE notes (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL DEFAULT '',
  body       TEXT NOT NULL DEFAULT '',
  has_links  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

INSERT INTO notes (id, title, body, has_links, created_at, updated_at)
VALUES ('legacy-note', 'Legacy note', 'This should stay searchable', 0, '2025-01-01', '2025-01-01');
INSERT INTO tags (name) VALUES ('keep');
INSERT INTO note_tags (note_id, tag_id) VALUES ('legacy-note', 1);
`);

    const api = createKeeperDB({
      db,
      generateId: () => "new-id",
      now: () => "2025-01-15 12:00:00",
    });

    const note = await api.getNote(toNoteId("legacy-note"));
    expect(note).toMatchObject({
      id: "legacy-note",
      title: "Legacy note",
      body: "This should stay searchable",
      pinned: false,
      archived: false,
      trashed: false,
    });
    expect(note?.tags).toEqual([{ id: 1, name: "keep", icon: null }]);

    const searchResults = await api.search("searchable");
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0]?.id).toBe("legacy-note");

    const userVersion = scalarNumber(
      db.query("PRAGMA user_version")[0]?.["user_version"],
    );
    expect(userVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("rejects databases from a newer schema version", () => {
    const db = createTestDb();
    db.execRaw(`PRAGMA user_version = ${String(CURRENT_SCHEMA_VERSION + 1)}`);

    expect(() => {
      migrate(db);
    }).toThrow(/newer than supported/);
  });
});
