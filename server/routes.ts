import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  KeeperDB,
  AutoTagRuleInput,
  CreateNoteInput,
  UpdateAppSettingsInput,
  UpdateNoteInput,
} from "../src/db/types.ts";
import { normalizePopularTagSuggestionLimit, toNoteId, toNoteIds } from "../src/db/types.ts";
import { bufferToArrayBuffer, type MediaHandler } from "./media-handler.ts";
import { truncateExtensionTitle } from "../src/utils/extension-title.ts";
import { createEventBroadcaster } from "./events.ts";
import { createLinkMetadataQueue } from "./link-preview-queue.ts";
import type { BackupService } from "./backup-service.ts";
import type { SystemStatusService } from "./system-status.ts";

export function registerRoutes(
  app: FastifyInstance,
  db: KeeperDB,
  media: MediaHandler,
  backup?: BackupService,
  system?: SystemStatusService,
): void {
  const { broadcast, registerEventRoutes } = createEventBroadcaster();
  const linkMetadataQueue = createLinkMetadataQueue({
    db,
    log: app.log,
    broadcast,
  });
  app.addHook("onClose", () => {
    linkMetadataQueue.stop();
  });
  void linkMetadataQueue.start();

  registerEventRoutes(app);

  // ── Health & status ───────────────────────

  if (system !== undefined) {
    app.get("/api/health", async (_req, reply) => {
      const health = await system.getHealth();
      return reply.code(health.status === "error" ? 503 : 200).send(health);
    });

    app.get("/api/status", async () => {
      return system.getStatus();
    });
  }

  // ── Notes ──────────────────────────────────

  app.post<{ Body: CreateNoteInput }>("/api/notes", async (req) => {
    const input = { ...req.body };
    const isExtensionNote = req.headers["x-keeper-source"] === "extension";
    if (isExtensionNote && input.title !== undefined) {
      const settings = await db.getAppSettings();
      input.title = truncateExtensionTitle(input.title, settings.extensionTitleMaxLength);
    }
    const note = await db.createNote(input);
    broadcast(isExtensionNote ? "extension-note-created" : "refresh");
    void linkMetadataQueue.enqueueFromBody(note.body);
    return note;
  });

  app.get("/api/notes", async () => {
    return db.getAllNotes();
  });

  app.post<{ Body: { ids: string[] } }>(
    "/api/notes/resolve",
    async (req, reply) => {
      if (!Array.isArray(req.body.ids) || !req.body.ids.every((id) => typeof id === "string")) {
        return reply.code(400).send({ error: "ids must be an array of note IDs" });
      }
      return db.resolveNotes(toNoteIds(req.body.ids));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/notes/:id",
    async (req, reply) => {
      const note = await db.getNote(toNoteId(req.params.id));
      if (note === null) {
        return reply.code(404).send({ error: "Not found" });
      }
      return note;
    },
  );

  app.put<{ Params: { id: string }; Body: Omit<UpdateNoteInput, "id"> }>(
    "/api/notes/:id",
    async (req) => {
      const note = await db.updateNote({ ...req.body, id: toNoteId(req.params.id) });
      void linkMetadataQueue.enqueueFromBody(note.body);
      return note;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/notes/:id",
    async (req) => {
      await db.deleteNote(toNoteId(req.params.id));
      return {};
    },
  );

  app.post<{ Body: { ids: string[] } }>(
    "/api/notes/delete",
    async (req) => {
      await db.deleteNotes(toNoteIds(req.body.ids));
      return {};
    },
  );

  app.post<{ Body: { ids: string[] } }>(
    "/api/notes/archive",
    async (req) => {
      await db.archiveNotes(toNoteIds(req.body.ids));
      return {};
    },
  );

  app.post("/api/notes/archive-tagged", async () => {
    return db.archiveTaggedNotes();
  });

  app.post<{ Params: { id: string } }>(
    "/api/notes/:id/trash",
    async (req) => {
      await db.trashNote(toNoteId(req.params.id));
      return {};
    },
  );

  app.post<{ Body: { ids: string[] } }>(
    "/api/notes/trash",
    async (req) => {
      await db.trashNotes(toNoteIds(req.body.ids));
      return {};
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/notes/:id/restore",
    async (req) => {
      await db.restoreNote(toNoteId(req.params.id));
      return {};
    },
  );

  app.post<{ Body: { ids: string[] } }>(
    "/api/notes/restore",
    async (req) => {
      await db.restoreNotes(toNoteIds(req.body.ids));
      return {};
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/notes/:id/pin",
    async (req) => {
      return db.togglePinNote(toNoteId(req.params.id));
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/notes/:id/archive",
    async (req) => {
      return db.toggleArchiveNote(toNoteId(req.params.id));
    },
  );

  // ── Tags ───────────────────────────────────

  app.get("/api/tags", async () => {
    return db.getAllTags();
  });

  app.get<{ Querystring: { noteId?: string; limit?: string } }>(
    "/api/tags/popular-suggestions",
    async (req, reply) => {
      if (req.query.noteId === undefined) {
        return reply.code(400).send({ error: "noteId is required" });
      }

      try {
        const limit = normalizePopularTagSuggestionLimit(Number(req.query.limit ?? "5"));
        return await db.getPopularTagSuggestions(toNoteId(req.query.noteId), limit);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid popular tag suggestion request";
        return reply.code(400).send({ error: message });
      }
    },
  );

  app.post<{ Params: { noteId: string }; Body: { name: string } }>(
    "/api/notes/:noteId/tags",
    async (req) => {
      return db.addTag(toNoteId(req.params.noteId), req.body.name);
    },
  );

  app.delete<{ Params: { noteId: string; tagName: string } }>(
    "/api/notes/:noteId/tags/:tagName",
    async (req) => {
      return db.removeTag(toNoteId(req.params.noteId), req.params.tagName);
    },
  );

  app.post<{ Body: { noteIds: string[]; tagName: string } }>(
    "/api/notes/tags/add",
    async (req) => {
      await db.addTagToNotes(toNoteIds(req.body.noteIds), req.body.tagName);
      return {};
    },
  );

  app.post<{ Body: { noteIds: string[]; tagName: string } }>(
    "/api/notes/tags/remove",
    async (req) => {
      await db.removeTagFromNotes(toNoteIds(req.body.noteIds), req.body.tagName);
      return {};
    },
  );

  app.put<{ Body: { oldName: string; newName: string } }>(
    "/api/tags/rename",
    async (req) => {
      await db.renameTag(req.body.oldName, req.body.newName);
      return {};
    },
  );

  app.put<{ Params: { id: string }; Body: { icon: string | null } }>(
    "/api/tags/:id/icon",
    async (req) => {
      await db.updateTagIcon(Number(req.params.id), req.body.icon);
      return {};
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/tags/:id",
    async (req) => {
      await db.deleteTag(Number(req.params.id));
      return {};
    },
  );

  // ── Search & Views ─────────────────────────

  app.get<{ Querystring: { q?: string } }>("/api/search", async (req) => {
    return db.search(req.query.q ?? "");
  });

  app.get("/api/views/untagged", async () => {
    return db.getUntaggedNotes();
  });

  app.get("/api/views/links", async () => {
    return db.getLinkedNotes();
  });

  app.get("/api/views/duplicates", async () => {
    return db.getDuplicateNotes();
  });

  app.get("/api/views/archived", async () => {
    return db.getArchivedNotes();
  });

  app.get("/api/views/trash", async () => {
    return db.getTrashedNotes();
  });

  app.get<{ Params: { tagId: string } }>(
    "/api/views/tag/:tagId",
    async (req) => {
      return db.getNotesForTag(Number(req.params.tagId));
    },
  );

  // ── Autotag rules ─────────────────────────

  function sendRuleError(reply: FastifyReply, error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid autotag rule";
    return reply.code(400).send({ error: message });
  }

  app.get("/api/auto-tag-rules", async () => {
    return db.getAutoTagRules();
  });

  app.post<{ Body: AutoTagRuleInput }>(
    "/api/auto-tag-rules",
    async (req, reply) => {
      try {
        return await db.createAutoTagRule(req.body);
      } catch (error) {
        return sendRuleError(reply, error);
      }
    },
  );

  app.put<{ Params: { id: string }; Body: AutoTagRuleInput }>(
    "/api/auto-tag-rules/:id",
    async (req, reply) => {
      try {
        return await db.updateAutoTagRule({
          ...req.body,
          id: Number(req.params.id),
        });
      } catch (error) {
        return sendRuleError(reply, error);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/api/auto-tag-rules/:id",
    async (req) => {
      await db.deleteAutoTagRule(Number(req.params.id));
      return {};
    },
  );

  app.post("/api/auto-tag-rules/run", async () => {
    const result = await db.runAutoTagRules();
    broadcast("refresh");
    return result;
  });

  // ── App settings ─────────────────────────

  app.get("/api/settings", async () => {
    return db.getAppSettings();
  });

  app.put<{ Body: UpdateAppSettingsInput }>(
    "/api/settings",
    async (req, reply) => {
      try {
        return await db.updateAppSettings(req.body);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid settings";
        return reply.code(400).send({ error: message });
      }
    },
  );

  // ── Backup & Restore ─────────────────────

  if (backup !== undefined) {
    app.get<{ Querystring: { includeMedia?: string } }>(
      "/api/backup",
      async (req, reply) => {
        const includeMedia = req.query.includeMedia !== "false";
        const archive = await backup.createBackup({ includeMedia, saveCopy: true });
        const stamp = new Date().toISOString().slice(0, 10);
        return reply
          .header("Content-Type", "application/zip")
          .header("Content-Disposition", `attachment; filename="keeper-backup-${stamp}.keeper.zip"`)
          .send(archive);
      },
    );

    app.post("/api/restore", async (req, reply) => {
      const parts = req.parts();
      let archive: Buffer | undefined;

      for await (const part of parts) {
        if (part.type === "file") {
          archive = await part.toBuffer();
        }
      }

      if (archive === undefined) {
        return reply.code(400).send({ error: "No backup archive uploaded" });
      }

      try {
        const result = await backup.restoreBackup({ archive });
        broadcast("refresh");
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to restore backup";
        return reply.code(400).send({ error: message });
      }
    });
  }

  // ── Link metadata ─────────────────────────

  app.get<{ Querystring: { url?: string } }>(
    "/api/link-metadata",
    async (req, reply) => {
      if (req.query.url === undefined) {
        return reply.code(400).send({ error: "url is required" });
      }
      const metadata = await db.getLinkMetadata(req.query.url);
      if (metadata === null) {
        return reply.code(404).send({ error: "Not found" });
      }
      return metadata;
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
      noteId: toNoteId(noteId),
      mimeType,
      data: bufferToArrayBuffer(fileBuffer),
    });
  });

  app.get<{ Params: { id: string } }>(
    "/api/media/:id",
    async (req, reply) => {
      const result = await media.serveMedia(req.params.id);
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
      await media.deleteMedia(req.params.id);
      return {};
    },
  );

  app.get<{ Params: { noteId: string } }>(
    "/api/notes/:noteId/media",
    async (req) => {
      return db.getMediaForNote(toNoteId(req.params.noteId));
    },
  );
}
