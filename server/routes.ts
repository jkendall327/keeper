import type { FastifyInstance } from "fastify";
import type {
  KeeperDB,
  CreateNoteInput,
  UpdateNoteInput,
} from "../src/db/types.ts";
import type { MediaHandler } from "./media-handler.ts";

export function registerRoutes(
  app: FastifyInstance,
  db: KeeperDB,
  media: MediaHandler,
): void {
  // ── Notes ──────────────────────────────────

  app.post<{ Body: CreateNoteInput }>("/api/notes", async (req) => {
    return db.createNote(req.body);
  });

  app.get("/api/notes", async () => {
    return db.getAllNotes();
  });

  app.get<{ Params: { id: string } }>(
    "/api/notes/:id",
    async (req, reply) => {
      const note = await db.getNote(req.params["id"]);
      if (note === null) {
        return reply.code(404).send({ error: "Not found" });
      }
      return note;
    },
  );

  app.put<{ Params: { id: string }; Body: Omit<UpdateNoteInput, "id"> }>(
    "/api/notes/:id",
    async (req) => {
      return db.updateNote({ ...req.body, id: req.params["id"] });
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/notes/:id",
    async (req) => {
      await db.deleteNote(req.params["id"]);
      return {};
    },
  );

  app.post<{ Body: { ids: string[] } }>(
    "/api/notes/delete",
    async (req) => {
      await db.deleteNotes(req.body["ids"]);
      return {};
    },
  );

  app.post<{ Body: { ids: string[] } }>(
    "/api/notes/archive",
    async (req) => {
      await db.archiveNotes(req.body["ids"]);
      return {};
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/notes/:id/pin",
    async (req) => {
      return db.togglePinNote(req.params["id"]);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/notes/:id/archive",
    async (req) => {
      return db.toggleArchiveNote(req.params["id"]);
    },
  );

  // ── Tags ───────────────────────────────────

  app.get("/api/tags", async () => {
    return db.getAllTags();
  });

  app.post<{ Params: { noteId: string }; Body: { name: string } }>(
    "/api/notes/:noteId/tags",
    async (req) => {
      return db.addTag(req.params["noteId"], req.body["name"]);
    },
  );

  app.delete<{ Params: { noteId: string; tagName: string } }>(
    "/api/notes/:noteId/tags/:tagName",
    async (req) => {
      return db.removeTag(req.params["noteId"], req.params["tagName"]);
    },
  );

  app.put<{ Body: { oldName: string; newName: string } }>(
    "/api/tags/rename",
    async (req) => {
      await db.renameTag(req.body["oldName"], req.body["newName"]);
      return {};
    },
  );

  app.put<{ Params: { id: string }; Body: { icon: string | null } }>(
    "/api/tags/:id/icon",
    async (req) => {
      await db.updateTagIcon(Number(req.params["id"]), req.body["icon"]);
      return {};
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/tags/:id",
    async (req) => {
      await db.deleteTag(Number(req.params["id"]));
      return {};
    },
  );

  // ── Search & Views ─────────────────────────

  app.get<{ Querystring: { q?: string } }>("/api/search", async (req) => {
    return db.search(req.query["q"] ?? "");
  });

  app.get("/api/views/untagged", async () => {
    return db.getUntaggedNotes();
  });

  app.get("/api/views/links", async () => {
    return db.getLinkedNotes();
  });

  app.get("/api/views/archived", async () => {
    return db.getArchivedNotes();
  });

  app.get<{ Params: { tagId: string } }>(
    "/api/views/tag/:tagId",
    async (req) => {
      return db.getNotesForTag(Number(req.params["tagId"]));
    },
  );

  // ── Media ──────────────────────────────────

  app.post("/api/media", async (req) => {
    const parts = req.parts();
    let noteId = "";
    let mimeType = "";
    let fileBuffer: Buffer | undefined;

    for await (const part of parts) {
      if (part.type === "field") {
        if (part.fieldname === "noteId") noteId = part.value as string;
        else if (part.fieldname === "mimeType") mimeType = part.value as string;
      } else {
        fileBuffer = await part.toBuffer();
      }
    }

    if (fileBuffer === undefined) throw new Error("No file uploaded");

    return media.storeMedia({
      noteId,
      mimeType,
      data: fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength,
      ),
    });
  });

  app.get<{ Params: { id: string } }>(
    "/api/media/:id",
    async (req, reply) => {
      const result = await media.serveMedia(req.params["id"]);
      if (result === null) {
        return reply.code(404).send({ error: "Media not found" });
      }
      return reply
        .header("Content-Type", result.mimeType)
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .send(result.buffer);
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/media/:id",
    async (req) => {
      await media.deleteMedia(req.params["id"]);
      return {};
    },
  );

  app.get<{ Params: { noteId: string } }>(
    "/api/notes/:noteId/media",
    async (req) => {
      return db.getMediaForNote(req.params["noteId"]);
    },
  );
}
