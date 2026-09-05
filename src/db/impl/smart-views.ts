import type { KeeperDB, NoteWithTags } from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

export function createSmartViewMethods(ctx: KeeperDBContext): Pick<
  KeeperDB,
  "getUntaggedNotes" | "getLinkedNotes" | "getDuplicateNotes" | "deduplicateNotes" | "getNotesForTag" | "getArchivedNotes"
> {
  const { db, rowToNote, withTagsBatch } = ctx;

  return {
    getUntaggedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        `SELECT * FROM notes
         WHERE id NOT IN (SELECT note_id FROM note_tags) AND trashed = 0
         ORDER BY archived ASC, pinned DESC, updated_at DESC, rowid DESC`,
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    getLinkedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        `SELECT * FROM notes
         WHERE has_links = 1 AND trashed = 0
         ORDER BY archived ASC, pinned DESC, updated_at DESC, rowid DESC`,
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    deduplicateNotes(): Promise<{ removedNoteCount: number }> {
      const removedNoteCount = db.transaction(() => {
        // Rank entire groups once, so groups of three or more keep one survivor.
        const rows = db.query(
          `SELECT id, FIRST_VALUE(id) OVER (
             PARTITION BY body ORDER BY created_at ASC, RANDOM()
           ) AS canonical_id
           FROM notes WHERE trashed = 0`,
        );
        let removed = 0;
        for (const row of rows) {
          const id = ctx.rowString(row, "id");
          const canonicalId = ctx.rowString(row, "canonical_id");
          if (id === canonicalId) continue;
          db.run(
            `INSERT OR IGNORE INTO note_tags (note_id, tag_id)
             SELECT ?, tag_id FROM note_tags WHERE note_id = ?`,
            [canonicalId, id],
          );
          db.run("UPDATE notes SET trashed = 1 WHERE id = ?", [id]);
          removed++;
        }
        return removed;
      });
      return Promise.resolve({ removedNoteCount });
    },

    getDuplicateNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        `WITH duplicate_bodies AS (
           SELECT body, MAX(updated_at) AS group_updated_at
           FROM notes
           WHERE trashed = 0
           GROUP BY body
           HAVING COUNT(*) > 1
         )
         SELECT n.*
         FROM notes n
         JOIN duplicate_bodies duplicate ON duplicate.body = n.body
         WHERE n.trashed = 0
         ORDER BY duplicate.group_updated_at DESC, n.body ASC, n.archived ASC, n.pinned DESC, n.updated_at DESC, n.rowid DESC`,
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    getNotesForTag(tagId: number): Promise<NoteWithTags[]> {
      const rows = db.query(
        `SELECT n.* FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id
         WHERE nt.tag_id = ? AND n.trashed = 0
         ORDER BY n.archived ASC, n.pinned DESC, n.updated_at DESC, n.rowid DESC`,
        [tagId],
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    getArchivedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        "SELECT * FROM notes WHERE archived = 1 AND trashed = 0 ORDER BY pinned DESC, updated_at DESC, rowid DESC",
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },
  };
}
