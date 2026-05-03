// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { createTestApp, multipartBody, type TestApp } from "./test-app.ts";
import type { LightMyRequestResponse } from "fastify";

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
  tags: TagDto[];
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
});
