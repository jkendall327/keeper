import { containsUrl } from "../url-detect.ts";
import { toNoteId } from "../types.ts";
import type {
  CreateNoteInput,
  KeeperDB,
  NoteId,
  NoteWithTags,
  UpdateNoteInput,
} from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

export function createNoteMethods(ctx: KeeperDBContext): Pick<
  KeeperDB,
  | "createNote"
  | "getNote"
  | "getAllNotes"
  | "updateNote"
  | "deleteNote"
  | "deleteNotes"
  | "archiveNotes"
  | "togglePinNote"
  | "toggleArchiveNote"
> {
  const { db, generateId, now, rowToNote, syncNoteLinks, withTags, withTagsBatch } = ctx;

  function getNote(id: NoteId): Promise<NoteWithTags | null> {
    const rows = db.query("SELECT * FROM notes WHERE id = ?", [id]);
    const row = rows[0];
    if (row === undefined) return Promise.resolve(null);
    return Promise.resolve(withTags(rowToNote(row)));
  }

  return {
    createNote(input: CreateNoteInput): Promise<NoteWithTags> {
      const id = toNoteId(generateId());
      const title = input.title ?? "";
      const body = input.body;
      const hasLinks = containsUrl(body) ? 1 : 0;
      const timestamp = now();
      const initialTagNames = Array.from(
        new Set((input.initialTagNames ?? []).map((name) => name.trim()).filter((name) => name !== "")),
      );

      const insertNote = () => {
        db.run(
          `INSERT INTO notes (id, title, body, has_links, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, title, body, hasLinks, timestamp, timestamp],
        );

        for (const tagName of initialTagNames) {
          const tagId = ctx.ensureTag(tagName);
          db.run(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
            [id, tagId],
          );
        }
        syncNoteLinks(id, body);
      };

      db.transaction(insertNote);

      return Promise.resolve(withTags({
        id,
        title,
        body,
        has_links: hasLinks === 1,
        pinned: false,
        archived: false,
        trashed: false,
        created_at: timestamp,
        updated_at: timestamp,
      }));
    },

    getNote,

    getAllNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        "SELECT * FROM notes WHERE archived = 0 AND trashed = 0 ORDER BY pinned DESC, updated_at DESC",
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    async updateNote(input: UpdateNoteInput): Promise<NoteWithTags> {
      const existing = await getNote(input.id);
      if (existing === null) throw new Error(`Note not found: ${String(input.id)}`);

      const title = input.title ?? existing.title;
      const body = input.body ?? existing.body;
      const hasLinks = containsUrl(body) ? 1 : 0;
      const timestamp = now();

      db.transaction(() => {
        db.run(
          `UPDATE notes SET title = ?, body = ?, has_links = ?, updated_at = ?
           WHERE id = ?`,
          [title, body, hasLinks, timestamp, input.id],
        );
        syncNoteLinks(input.id, body);
      });

      return withTags({
        ...existing,
        title,
        body,
        has_links: hasLinks === 1,
        updated_at: timestamp,
      });
    },

    deleteNote(id: NoteId): Promise<void> {
      db.run("DELETE FROM notes WHERE id = ?", [id]);
      return Promise.resolve();
    },

    deleteNotes(ids: NoteId[]): Promise<void> {
      if (ids.length === 0) return Promise.resolve();
      const placeholders = ids.map(() => "?").join(",");
      db.run(`DELETE FROM notes WHERE id IN (${placeholders})`, ids);
      return Promise.resolve();
    },

    archiveNotes(ids: NoteId[]): Promise<void> {
      if (ids.length === 0) return Promise.resolve();
      const placeholders = ids.map(() => "?").join(",");
      db.run(
        `UPDATE notes SET archived = 1 WHERE id IN (${placeholders})`,
        ids,
      );
      return Promise.resolve();
    },

    async togglePinNote(id: NoteId): Promise<NoteWithTags> {
      const existing = await getNote(id);
      if (existing === null) throw new Error(`Note not found: ${String(id)}`);

      const newPinned = existing.pinned ? 0 : 1;
      db.run("UPDATE notes SET pinned = ? WHERE id = ?", [newPinned, id]);

      return { ...existing, pinned: !existing.pinned };
    },

    async toggleArchiveNote(id: NoteId): Promise<NoteWithTags> {
      const existing = await getNote(id);
      if (existing === null) throw new Error(`Note not found: ${String(id)}`);

      const newArchived = existing.archived ? 0 : 1;
      db.run("UPDATE notes SET archived = ? WHERE id = ?", [newArchived, id]);

      return { ...existing, archived: !existing.archived };
    },
  };
}
