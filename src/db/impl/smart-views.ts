import type { KeeperDB, NoteWithTags } from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

export function createSmartViewMethods(ctx: KeeperDBContext): Pick<
  KeeperDB,
  "getUntaggedNotes" | "getLinkedNotes" | "getNotesForTag" | "getArchivedNotes"
> {
  const { db, rowToNote, withTagsBatch } = ctx;

  return {
    getUntaggedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        `SELECT * FROM notes
         WHERE id NOT IN (SELECT note_id FROM note_tags) AND trashed = 0
         ORDER BY archived ASC, pinned DESC, updated_at DESC`,
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    getLinkedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        `SELECT * FROM notes
         WHERE has_links = 1 AND trashed = 0
         ORDER BY archived ASC, pinned DESC, updated_at DESC`,
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    getNotesForTag(tagId: number): Promise<NoteWithTags[]> {
      const rows = db.query(
        `SELECT n.* FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id
         WHERE nt.tag_id = ? AND n.trashed = 0
         ORDER BY n.archived ASC, n.pinned DESC, n.updated_at DESC`,
        [tagId],
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    getArchivedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        "SELECT * FROM notes WHERE archived = 1 AND trashed = 0 ORDER BY pinned DESC, updated_at DESC",
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },
  };
}
