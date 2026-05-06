import { toNoteId } from "../types.ts";
import type { KeeperDB, Media, NoteId, StoreMediaInput } from "../types.ts";
import type { KeeperDBContext } from "./context.ts";

export function createMediaMethods(ctx: KeeperDBContext): Pick<
  KeeperDB,
  "storeMedia" | "getMedia" | "deleteMedia" | "getMediaForNote"
> {
  const { db, rowString } = ctx;

  return {
    async storeMedia(_input: StoreMediaInput): Promise<Media> {
      return Promise.reject(
        new Error("storeMedia: must be implemented by worker with OPFS access"),
      );
    },

    async getMedia(_id: string): Promise<ArrayBuffer | null> {
      return Promise.reject(
        new Error("getMedia: must be implemented by worker with OPFS access"),
      );
    },

    async deleteMedia(_id: string): Promise<void> {
      return Promise.reject(
        new Error(
          "deleteMedia: must be implemented by worker with OPFS access",
        ),
      );
    },

    getMediaForNote(noteId: NoteId): Promise<Media[]> {
      const rows = db.query(
        "SELECT * FROM media WHERE note_id = ? ORDER BY created_at",
        [noteId],
      );
      return Promise.resolve(rows.map((r) => ({
        id: r["id"] as string,
        note_id: toNoteId(rowString(r, "note_id")),
        mime_type: rowString(r, "mime_type"),
        filename: rowString(r, "filename"),
        created_at: rowString(r, "created_at"),
      })));
    },
  };
}
