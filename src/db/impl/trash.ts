import type { KeeperDB, NoteId, NoteWithTags } from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

export function createTrashMethods(ctx: KeeperDBContext): Pick<
  KeeperDB,
  "trashNote" | "trashNotes" | "restoreNote" | "restoreNotes" | "getTrashedNotes"
> {
  const { db, rowToNote, withTagsBatch } = ctx;

  return {
    trashNote(id: NoteId): Promise<void> {
      db.run("UPDATE notes SET trashed = 1 WHERE id = ?", [id]);
      return Promise.resolve();
    },

    trashNotes(ids: NoteId[]): Promise<void> {
      if (ids.length === 0) return Promise.resolve();
      const placeholders = ids.map(() => "?").join(",");
      db.run(
        `UPDATE notes SET trashed = 1 WHERE id IN (${placeholders})`,
        ids,
      );
      return Promise.resolve();
    },

    restoreNote(id: NoteId): Promise<void> {
      db.run("UPDATE notes SET trashed = 0 WHERE id = ?", [id]);
      return Promise.resolve();
    },

    restoreNotes(ids: NoteId[]): Promise<void> {
      if (ids.length === 0) return Promise.resolve();
      const placeholders = ids.map(() => "?").join(",");
      db.run(
        `UPDATE notes SET trashed = 0 WHERE id IN (${placeholders})`,
        ids,
      );
      return Promise.resolve();
    },

    getTrashedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        "SELECT * FROM notes WHERE trashed = 1 ORDER BY updated_at DESC",
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },
  };
}
