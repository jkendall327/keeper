import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import { registerRoutes } from "../routes.ts";
import { createKeeperDB } from "../../src/db/db-impl.ts";
import { createTestDb } from "../../src/db/__tests__/test-db.ts";
import type { KeeperDB, Media, NoteId, StoreMediaInput } from "../../src/db/types.ts";
import type { SqliteDb } from "../../src/db/sqlite-db.ts";
import type { MediaHandler } from "../media-handler.ts";
import type { FastifyInstance } from "fastify";

export interface TestApp {
  app: FastifyInstance;
  db: KeeperDB;
  sqlDb: SqliteDb;
  media: MediaHandler;
}

export async function createTestApp(): Promise<TestApp> {
  const app = Fastify();
  await app.register(fastifyMultipart);

  let idCounter = 0;
  let mediaCounter = 0;
  let timeCounter = 0;
  const buffers = new Map<string, { buffer: Buffer; mimeType: string }>();
  const sqlDb = createTestDb();
  const db = createKeeperDB({
    db: sqlDb,
    generateId: () => `test-id-${String(++idCounter)}`,
    now: () => `2025-01-15 12:00:${String(timeCounter++).padStart(2, "0")}`,
  });

  const media: MediaHandler = {
    storeMedia(input: StoreMediaInput): Promise<Media> {
      const id = `media-${String(++mediaCounter)}`;
      const filename = `${id}.bin`;
      const createdAt = `2025-01-15 12:01:${String(mediaCounter).padStart(2, "0")}`;
      buffers.set(id, {
        buffer: Buffer.from(input.data),
        mimeType: input.mimeType,
      });
      sqlDb.run(
        "INSERT INTO media (id, note_id, mime_type, filename, created_at) VALUES (?, ?, ?, ?, ?)",
        [id, input.noteId, input.mimeType, filename, createdAt],
      );
      return Promise.resolve({
        id,
        note_id: input.noteId,
        mime_type: input.mimeType,
        filename,
        created_at: createdAt,
      });
    },

    serveMedia(id: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
      return Promise.resolve(buffers.get(id) ?? null);
    },

    deleteMedia(id: string): Promise<void> {
      buffers.delete(id);
      sqlDb.run("DELETE FROM media WHERE id = ?", [id]);
      return Promise.resolve();
    },

    async deleteNoteWithMedia(noteId: NoteId): Promise<void> {
      const rows = await db.getMediaForNote(noteId);
      for (const row of rows) {
        buffers.delete(row.id);
      }
      await db.deleteNote(noteId);
    },
  };

  registerRoutes(app, db, media);
  await app.ready();

  return { app, db, sqlDb, media };
}

export function multipartBody(fields: Record<string, string>, file: { field: string; filename: string; contentType: string; content: string | Buffer }) {
  const boundary = "----keeper-test-boundary";
  const chunks: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ));
  }

  chunks.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
  ));
  chunks.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content));
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
