import type { KeeperDB, NoteId, NoteWithTags, Tag } from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

export function createTagMethods(
  ctx: KeeperDBContext,
  getNote: (id: NoteId) => Promise<NoteWithTags | null>,
): Pick<
  KeeperDB,
  | "addTag"
  | "removeTag"
  | "addTagToNotes"
  | "removeTagFromNotes"
  | "renameTag"
  | "updateTagIcon"
  | "deleteTag"
  | "getAllTags"
> {
  const { db, ensureTag, getTagsForNote, rowToTag } = ctx;

  return {
    async addTag(noteId: NoteId, tagName: string): Promise<NoteWithTags> {
      const existing = await getNote(noteId);
      if (existing === null) throw new Error(`Note not found: ${String(noteId)}`);

      const tagId = ensureTag(tagName);

      db.run(
        "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
        [noteId, tagId],
      );

      return { ...existing, tags: getTagsForNote(noteId) };
    },

    async removeTag(noteId: NoteId, tagName: string): Promise<NoteWithTags> {
      const existing = await getNote(noteId);
      if (existing === null) throw new Error(`Note not found: ${String(noteId)}`);

      db.run(
        `DELETE FROM note_tags WHERE note_id = ? AND tag_id = (
           SELECT id FROM tags WHERE name = ?
         )`,
        [noteId, tagName],
      );

      return { ...existing, tags: getTagsForNote(noteId) };
    },

    addTagToNotes(noteIds: NoteId[], tagName: string): Promise<void> {
      if (noteIds.length === 0) return Promise.resolve();

      const tagId = ensureTag(tagName);

      for (const noteId of noteIds) {
        db.run(
          "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
          [noteId, tagId],
        );
      }
      return Promise.resolve();
    },

    removeTagFromNotes(noteIds: NoteId[], tagName: string): Promise<void> {
      if (noteIds.length === 0) return Promise.resolve();
      const placeholders = noteIds.map(() => "?").join(",");
      db.run(
        `DELETE FROM note_tags WHERE tag_id = (SELECT id FROM tags WHERE name = ?) AND note_id IN (${placeholders})`,
        [tagName, ...noteIds],
      );
      return Promise.resolve();
    },

    renameTag(oldName: string, newName: string): Promise<void> {
      if (oldName === newName) return Promise.resolve();

      const existingRows = db.query("SELECT id FROM tags WHERE name = ?", [
        newName,
      ]);
      if (existingRows.length > 0) {
        const oldRows = db.query("SELECT id FROM tags WHERE name = ?", [
          oldName,
        ]);
        const oldRow = oldRows[0];
        if (oldRow === undefined) throw new Error(`Tag not found: ${oldName}`);
        const oldTagId = oldRow["id"] as number;
        const existingRow = existingRows[0];
        if (existingRow === undefined)
          throw new Error("Unreachable: checked length > 0");
        const newTagId = existingRow["id"] as number;

        db.run("UPDATE OR IGNORE note_tags SET tag_id = ? WHERE tag_id = ?", [
          newTagId,
          oldTagId,
        ]);
        db.run("DELETE FROM note_tags WHERE tag_id = ?", [oldTagId]);
        db.run("DELETE FROM tags WHERE id = ?", [oldTagId]);
      } else {
        db.run("UPDATE tags SET name = ? WHERE name = ?", [newName, oldName]);
      }
      return Promise.resolve();
    },

    updateTagIcon(tagId: number, icon: string | null): Promise<void> {
      db.run("UPDATE tags SET icon = ? WHERE id = ?", [icon, tagId]);
      return Promise.resolve();
    },

    deleteTag(tagId: number): Promise<void> {
      db.run("DELETE FROM tags WHERE id = ?", [tagId]);
      return Promise.resolve();
    },

    getAllTags(): Promise<Tag[]> {
      const rows = db.query("SELECT id, name, icon FROM tags ORDER BY name");
      return Promise.resolve(rows.map(rowToTag));
    },
  };
}
