// @vitest-environment node
import { access } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { createFileBackedTestApp, createTestApp, multipartBody, type TestApp } from "./test-app.ts";
import type { LightMyRequestResponse } from "fastify";
import { readKeeperArchive } from "../keeper-archive.ts";

interface TagDto {
  id: number;
  name: string;
  icon: string | null;
}

interface NoteDto {
  id: string;
  title: string;
  body: string;
  has_links: boolean;
  trashed?: boolean;
  tags: TagDto[];
}

interface NoteResolveDto {
  id: string;
  status: "found" | "missing";
  note: NoteDto | null;
}

interface ErrorDto {
  error: string;
}

function parseJson(response: LightMyRequestResponse): unknown {
  return JSON.parse(response.body) as unknown;
}

let current: TestApp | undefined;

async function setup() {
  current = await createTestApp();
  return current;
}

afterEach(async () => {
  await current?.app.close();
  await current?.cleanup?.();
  current = undefined;
});

describe("Fastify API routes", () => {
  it("creates, reads, updates, and deletes notes through HTTP", async () => {
    const { app } = await setup();

    const created = await app.inject({
      method: "POST",
      url: "/api/notes",
      payload: { body: "hello https://example.com", title: "Greeting" },
    });
    expect(created.statusCode).toBe(200);
    expect(parseJson(created) as NoteDto).toMatchObject({
      id: "test-id-1",
      title: "Greeting",
      body: "hello https://example.com",
      has_links: true,
    });

    const updated = await app.inject({
      method: "PUT",
      url: "/api/notes/test-id-1",
      payload: { body: "updated" },
    });
    expect(updated.statusCode).toBe(200);
    expect(parseJson(updated) as NoteDto).toMatchObject({ id: "test-id-1", body: "updated", has_links: false });

    const fetched = await app.inject({ method: "GET", url: "/api/notes/test-id-1" });
    expect(fetched.statusCode).toBe(200);
    expect(parseJson(fetched) as NoteDto).toMatchObject({ id: "test-id-1", body: "updated" });

    const missing = await app.inject({ method: "GET", url: "/api/notes/missing" });
    expect(missing.statusCode).toBe(404);

    const deleted = await app.inject({ method: "DELETE", url: "/api/notes/test-id-1" });
    expect(deleted.statusCode).toBe(200);
    const list = await app.inject({ method: "GET", url: "/api/notes" });
    expect(parseJson(list) as NoteDto[]).toEqual([]);
  });

  it("truncates long extension note titles using the configured setting", async () => {
    const { app } = await setup();

    const settings = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { extensionTitleMaxLength: 12 },
    });
    expect(settings.statusCode).toBe(200);
    expect(parseJson(settings)).toMatchObject({ extensionTitleMaxLength: 12 });

    const created = await app.inject({
      method: "POST",
      url: "/api/notes",
      headers: { "X-Keeper-Source": "extension" },
      payload: { body: "https://example.com", title: "An extremely long page title" },
    });
    expect(created.statusCode).toBe(200);
    expect(parseJson(created) as NoteDto).toMatchObject({
      title: "An extrem...",
    });
  });

  it("does not truncate long non-extension note titles", async () => {
    const { app } = await setup();
    await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { extensionTitleMaxLength: 12 },
    });

    const title = "An extremely long page title";
    const created = await app.inject({
      method: "POST",
      url: "/api/notes",
      payload: { body: "https://example.com", title },
    });
    expect(created.statusCode).toBe(200);
    expect(parseJson(created) as NoteDto).toMatchObject({ title });
  });

  it("rejects invalid extension title length settings", async () => {
    const { app } = await setup();

    const response = await app.inject({
      method: "PUT",
      url: "/api/settings",
      payload: { extensionTitleMaxLength: 3 },
    });
    expect(response.statusCode).toBe(400);
    expect((parseJson(response) as ErrorDto).error).toContain("between");
  });

  it("supports bulk archive, trash, and restore routes used by the client", async () => {
    const { app } = await setup();
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "one" } });
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "two" } });

    const archived = await app.inject({
      method: "POST",
      url: "/api/notes/archive",
      payload: { ids: ["test-id-1"] },
    });
    expect(archived.statusCode).toBe(200);
    const archivedNotes = parseJson(await app.inject({ method: "GET", url: "/api/views/archived" })) as NoteDto[];
    expect(archivedNotes).toHaveLength(1);

    const trashed = await app.inject({
      method: "POST",
      url: "/api/notes/trash",
      payload: { ids: ["test-id-2"] },
    });
    expect(trashed.statusCode).toBe(200);
    const trashedNotes = parseJson(await app.inject({ method: "GET", url: "/api/views/trash" })) as NoteDto[];
    expect(trashedNotes).toHaveLength(1);

    const restored = await app.inject({
      method: "POST",
      url: "/api/notes/restore",
      payload: { ids: ["test-id-2"] },
    });
    expect(restored.statusCode).toBe(200);
    const restoredTrashNotes = parseJson(await app.inject({ method: "GET", url: "/api/views/trash" })) as NoteDto[];
    expect(restoredTrashNotes).toHaveLength(0);
  });

  it("resolves notes in request order including trashed notes", async () => {
    const { app } = await setup();
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "one" } });
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "two" } });
    await app.inject({ method: "POST", url: "/api/notes/test-id-2/trash" });

    const resolved = await app.inject({
      method: "POST",
      url: "/api/notes/resolve",
      payload: { ids: ["test-id-2", "missing", "test-id-1"] },
    });

    expect(resolved.statusCode).toBe(200);
    const body = parseJson(resolved) as NoteResolveDto[];
    expect(body.map((item) => [item.id, item.status])).toEqual([
      ["test-id-2", "found"],
      ["missing", "missing"],
      ["test-id-1", "found"],
    ]);
    expect(body[0]?.note).toMatchObject({ id: "test-id-2", body: "two", trashed: true });
    expect(body[1]?.note).toBeNull();
  });

  it("supports single and bulk tag operations", async () => {
    const { app } = await setup();
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "one" } });
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "two" } });

    const added = await app.inject({
      method: "POST",
      url: "/api/notes/test-id-1/tags",
      payload: { name: "work" },
    });
    expect(added.statusCode).toBe(200);
    expect((parseJson(added) as NoteDto).tags).toContainEqual({ id: 1, name: "work", icon: null });

    const bulkAdded = await app.inject({
      method: "POST",
      url: "/api/notes/tags/add",
      payload: { noteIds: ["test-id-1", "test-id-2"], tagName: "shared" },
    });
    expect(bulkAdded.statusCode).toBe(200);
    const tags = parseJson(await app.inject({ method: "GET", url: "/api/tags" })) as TagDto[];
    expect(tags.map((tag) => tag.name)).toEqual(["shared", "work"]);

    const removed = await app.inject({
      method: "POST",
      url: "/api/notes/tags/remove",
      payload: { noteIds: ["test-id-1"], tagName: "shared" },
    });
    expect(removed.statusCode).toBe(200);

    const first = parseJson(await app.inject({ method: "GET", url: "/api/notes/test-id-1" })) as NoteDto;
    const second = parseJson(await app.inject({ method: "GET", url: "/api/notes/test-id-2" })) as NoteDto;
    expect(first.tags.map((tag) => tag.name)).not.toContain("shared");
    expect(second.tags.map((tag) => tag.name)).toContain("shared");
  });

  it("creates notes with initial tags and returns popular tag suggestions", async () => {
    const { app } = await setup();
    const target = await app.inject({
      method: "POST",
      url: "/api/notes",
      payload: { body: "target", initialTagNames: ["work"] },
    });
    expect(target.statusCode).toBe(200);
    expect((parseJson(target) as NoteDto).tags.map((tag) => tag.name)).toEqual(["work"]);

    await app.inject({
      method: "POST",
      url: "/api/notes",
      payload: { body: "one", initialTagNames: ["later", "alpha"] },
    });
    await app.inject({
      method: "POST",
      url: "/api/notes",
      payload: { body: "two", initialTagNames: ["later"] },
    });

    const suggestions = await app.inject({
      method: "GET",
      url: "/api/tags/popular-suggestions?noteId=test-id-1&limit=2",
    });
    expect(suggestions.statusCode).toBe(200);
    expect((parseJson(suggestions) as TagDto[]).map((tag) => tag.name)).toEqual(["later", "alpha"]);
  });

  it("returns search and smart view results from real SQLite behavior", async () => {
    const { app } = await setup();
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "plain note" } });
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "docs https://example.com/manual" } });
    await app.inject({ method: "POST", url: "/api/notes/test-id-1/tags", payload: { name: "todo" } });

    const search = await app.inject({ method: "GET", url: "/api/search?q=docs" });
    expect(search.statusCode).toBe(200);
    expect((parseJson(search) as NoteDto[])[0]).toMatchObject({ id: "test-id-2", body: "docs https://example.com/manual" });

    const links = await app.inject({ method: "GET", url: "/api/views/links" });
    expect((parseJson(links) as NoteDto[]).map((note) => note.id)).toEqual(["test-id-2"]);

    const untagged = await app.inject({ method: "GET", url: "/api/views/untagged" });
    expect((parseJson(untagged) as NoteDto[]).map((note) => note.id)).toEqual(["test-id-2"]);

    const tagView = await app.inject({ method: "GET", url: "/api/views/tag/1" });
    expect((parseJson(tagView) as NoteDto[]).map((note) => note.id)).toEqual(["test-id-1"]);
  });

  it("validates and runs autotag rules through HTTP", async () => {
    const { app } = await setup();
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "read https://example.com/a" } });

    const invalid = await app.inject({
      method: "POST",
      url: "/api/auto-tag-rules",
      payload: { pattern: "[", tagNames: ["web"] },
    });
    expect(invalid.statusCode).toBe(400);
    expect((parseJson(invalid) as ErrorDto).error).toContain("valid regular expression");

    const created = await app.inject({
      method: "POST",
      url: "/api/auto-tag-rules",
      payload: { pattern: "example\\.com", tagNames: ["web", "read later"] },
    });
    expect(created.statusCode).toBe(200);
    expect(parseJson(created) as { id: number; pattern: string; tagNames: string[] }).toMatchObject({
      id: 1,
      pattern: "example\\.com",
      tagNames: ["read later", "web"],
    });

    const run = await app.inject({ method: "POST", url: "/api/auto-tag-rules/run" });
    expect(run.statusCode).toBe(200);
    expect(parseJson(run) as { matchedNoteCount: number; archivedNoteCount: number; appliedTagCount: number }).toEqual({
      matchedNoteCount: 1,
      archivedNoteCount: 1,
      appliedTagCount: 2,
    });

    const archived = parseJson(await app.inject({ method: "GET", url: "/api/views/archived" })) as NoteDto[];
    expect(archived[0]?.tags.map((tag) => tag.name)).toEqual(["read later", "web"]);
  });

  it("uploads, serves, lists, and deletes media", async () => {
    const { app } = await setup();
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "media note" } });
    const multipart = multipartBody(
      { noteId: "test-id-1", mimeType: "image/png" },
      { field: "file", filename: "pic.png", contentType: "image/png", content: "png-bytes" },
    );

    const uploaded = await app.inject({
      method: "POST",
      url: "/api/media",
      headers: { "content-type": multipart.contentType },
      payload: multipart.body,
    });
    expect(uploaded.statusCode).toBe(200);
    expect(parseJson(uploaded) as { id: string; note_id: string; mime_type: string }).toMatchObject({
      id: "media-1",
      note_id: "test-id-1",
      mime_type: "image/png",
    });

    const listed = await app.inject({ method: "GET", url: "/api/notes/test-id-1/media" });
    expect(parseJson(listed) as unknown[]).toHaveLength(1);

    const served = await app.inject({ method: "GET", url: "/api/media/media-1" });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.body).toBe("png-bytes");

    const deleted = await app.inject({ method: "DELETE", url: "/api/media/media-1" });
    expect(deleted.statusCode).toBe(200);
    const missing = await app.inject({ method: "GET", url: "/api/media/media-1" });
    expect(missing.statusCode).toBe(404);
  });

  it("deletes media files when bulk permanently deleting notes", async () => {
    current = await createFileBackedTestApp();
    const { app, mediaDir } = current;
    if (mediaDir === undefined) throw new Error("Expected file-backed media directory");

    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "media note one" } });
    await app.inject({ method: "POST", url: "/api/notes", payload: { body: "media note two" } });

    const firstMultipart = multipartBody(
      { noteId: "test-id-1", mimeType: "image/png" },
      { field: "file", filename: "one.png", contentType: "image/png", content: "first-png-bytes" },
    );
    const firstUpload = await app.inject({
      method: "POST",
      url: "/api/media",
      headers: { "content-type": firstMultipart.contentType },
      payload: firstMultipart.body,
    });
    const firstMedia = parseJson(firstUpload) as { filename: string };

    const secondMultipart = multipartBody(
      { noteId: "test-id-2", mimeType: "image/png" },
      { field: "file", filename: "two.png", contentType: "image/png", content: "second-png-bytes" },
    );
    const secondUpload = await app.inject({
      method: "POST",
      url: "/api/media",
      headers: { "content-type": secondMultipart.contentType },
      payload: secondMultipart.body,
    });
    const secondMedia = parseJson(secondUpload) as { filename: string };

    const firstPath = join(mediaDir, firstMedia.filename);
    const secondPath = join(mediaDir, secondMedia.filename);
    await expect(access(firstPath)).resolves.toBeUndefined();
    await expect(access(secondPath)).resolves.toBeUndefined();

    const deleted = await app.inject({
      method: "POST",
      url: "/api/notes/delete",
      payload: { ids: ["test-id-1", "test-id-2"] },
    });

    expect(deleted.statusCode).toBe(200);
    await expect(access(firstPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(secondPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("downloads a backup archive with a SQLite snapshot and media files", async () => {
    current = await createFileBackedTestApp();
    const { app } = current;
    await app.inject({ method: "POST", url: "/api/notes", payload: { title: "Saved", body: "with image" } });
    const multipart = multipartBody(
      { noteId: "test-id-1", mimeType: "image/png" },
      { field: "file", filename: "pic.png", contentType: "image/png", content: "png-bytes" },
    );
    const uploaded = await app.inject({
      method: "POST",
      url: "/api/media",
      headers: { "content-type": multipart.contentType },
      payload: multipart.body,
    });
    const mediaId = (parseJson(uploaded) as { id: string }).id;

    const response = await app.inject({ method: "GET", url: "/api/backup" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/zip");
    expect(response.headers["content-disposition"]).toContain("keeper-backup-");

    const archive = readKeeperArchive(response.rawPayload);
    const manifest = JSON.parse(archive.get("manifest.json")?.toString("utf8") ?? "") as {
      app: string;
      counts: { notes: number; media: number };
    };
    expect(manifest).toMatchObject({
      app: "keeper",
      counts: { notes: 1, media: 1 },
    });
    expect(archive.has("keeper.sqlite3")).toBe(true);
    expect([...archive.keys()]).toContain(`media/${mediaId}.png`);
    expect(archive.get(`media/${mediaId}.png`)?.toString()).toBe("png-bytes");

    const status = await app.inject({ method: "GET", url: "/api/status" });
    expect(status.statusCode).toBe(200);
    expect(parseJson(status) as { counts: { notes: number; media: number }; backups: { backupCount: number; lastBackup: { filename: string } | null } }).toMatchObject({
      counts: { notes: 1, media: 1 },
      backups: {
        backupCount: 1,
        lastBackup: { filename: expect.stringContaining("keeper-backup") as string },
      },
    });
  });

  it("reports health and installed system status for file-backed runs", async () => {
    current = await createFileBackedTestApp();
    const { app } = current;

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(parseJson(health) as { status: string; schemaVersion: number; currentSchemaVersion: number }).toMatchObject({
      status: "ok",
      schemaVersion: expect.any(Number) as number,
      currentSchemaVersion: expect.any(Number) as number,
    });

    const status = await app.inject({ method: "GET", url: "/api/status" });
    expect(status.statusCode).toBe(200);
    expect(parseJson(status) as {
      status: string;
      paths: { dataDir: string; mediaDir: string; backupDir: string; databasePath: string };
      database: { migrationState: string; integrity: string; foreignKeys: string };
      checks: unknown[];
    }).toMatchObject({
      status: "ok",
      paths: {
        dataDir: expect.stringContaining("keeper-test-data-") as string,
        mediaDir: expect.stringContaining("media") as string,
        backupDir: expect.stringContaining("backups") as string,
        databasePath: expect.stringContaining("keeper.sqlite3") as string,
      },
      database: {
        migrationState: "current",
        integrity: "ok",
        foreignKeys: "ok",
      },
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "data-dir", status: "ok" }),
        expect.objectContaining({ id: "database-migration", status: "ok" }),
      ]) as unknown[],
    });
  });

  it("restores a backup archive over the current database and media directory", async () => {
    current = await createFileBackedTestApp();
    const { app } = current;
    await app.inject({ method: "POST", url: "/api/notes", payload: { title: "Original", body: "keep me" } });
    const originalMedia = multipartBody(
      { noteId: "test-id-1", mimeType: "image/png" },
      { field: "file", filename: "pic.png", contentType: "image/png", content: "original-bytes" },
    );
    const uploaded = await app.inject({
      method: "POST",
      url: "/api/media",
      headers: { "content-type": originalMedia.contentType },
      payload: originalMedia.body,
    });
    const mediaId = (parseJson(uploaded) as { id: string }).id;
    const backup = await app.inject({ method: "GET", url: "/api/backup" });

    await app.inject({ method: "POST", url: "/api/notes", payload: { title: "Later", body: "discard me" } });
    await app.inject({ method: "DELETE", url: `/api/media/${mediaId}` });

    const restoreMultipart = multipartBody(
      {},
      { field: "backup", filename: "keeper-backup.keeper.zip", contentType: "application/zip", content: backup.rawPayload },
    );
    const restored = await app.inject({
      method: "POST",
      url: "/api/restore",
      headers: { "content-type": restoreMultipart.contentType },
      payload: restoreMultipart.body,
    });
    expect(restored.statusCode).toBe(200);
    expect(parseJson(restored) as { preRestoreBackupPath: string }).toMatchObject({
      preRestoreBackupPath: expect.stringContaining("pre-restore-") as string,
    });

    const notes = parseJson(await app.inject({ method: "GET", url: "/api/notes" })) as NoteDto[];
    expect(notes.map((note) => note.title)).toEqual(["Original"]);

    const served = await app.inject({ method: "GET", url: `/api/media/${mediaId}` });
    expect(served.statusCode).toBe(200);
    expect(served.body).toBe("original-bytes");
  });
});
