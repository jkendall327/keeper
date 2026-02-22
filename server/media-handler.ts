import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Media, StoreMediaInput } from "../src/db/types.ts";
import type { SqliteDb } from "../src/db/sqlite-db.ts";

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "video/mp4": "mp4",
    "application/pdf": "pdf",
  };
  return map[mime] ?? "bin";
}

export interface MediaHandler {
  storeMedia(input: StoreMediaInput): Promise<Media>;
  serveMedia(
    id: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null>;
  deleteMedia(id: string): Promise<void>;
  deleteNoteWithMedia(noteId: string): Promise<void>;
}

export async function createMediaHandler(
  mediaDir: string,
  db: SqliteDb,
  baseDeleteNote: (id: string) => Promise<void>,
): Promise<MediaHandler> {
  await mkdir(mediaDir, { recursive: true });

  return {
    async storeMedia(input: StoreMediaInput): Promise<Media> {
      const id = randomUUID();
      const ext = mimeToExt(input.mimeType);
      const filename = `${id}.${ext}`;

      await writeFile(join(mediaDir, filename), Buffer.from(input.data));

      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      db.run(
        `INSERT INTO media (id, note_id, mime_type, filename, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, input.noteId, input.mimeType, filename, now],
      );

      return {
        id,
        note_id: input.noteId,
        mime_type: input.mimeType,
        filename,
        created_at: now,
      };
    },

    async serveMedia(id: string) {
      const rows = db.query(
        "SELECT filename, mime_type FROM media WHERE id = ?",
        [id],
      );
      const row = rows[0];
      if (row === undefined) return null;

      const filename = row["filename"] as string;
      const mimeType = row["mime_type"] as string;

      try {
        const buffer = await readFile(join(mediaDir, filename));
        return { buffer, mimeType };
      } catch {
        return null;
      }
    },

    async deleteMedia(id: string) {
      const rows = db.query("SELECT filename FROM media WHERE id = ?", [id]);
      const row = rows[0];
      if (row !== undefined) {
        try {
          await unlink(join(mediaDir, row["filename"] as string));
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
      }
      db.run("DELETE FROM media WHERE id = ?", [id]);
    },

    async deleteNoteWithMedia(noteId: string) {
      const rows = db.query(
        "SELECT id, mime_type FROM media WHERE note_id = ?",
        [noteId],
      );
      const filenames = rows.map(
        (m) => `${m["id"] as string}.${mimeToExt(m["mime_type"] as string)}`,
      );

      await baseDeleteNote(noteId);

      for (const filename of filenames) {
        try {
          await unlink(join(mediaDir, filename));
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
      }
    },
  };
}
