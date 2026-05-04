import { afterEach, describe, expect, it, vi } from "vitest";
import { getDB } from "../db/db-client.ts";
import { toNoteId } from "../db/types.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(body: unknown = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((..._args: Parameters<typeof fetch>) => Promise.resolve(jsonResponse(body)));
  globalThis.fetch = fetchMock;
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KeeperDB HTTP client contract", () => {
  it("uses the expected note routes", async () => {
    const fetchMock = mockFetch([]);
    const db = getDB();
    const n1 = toNoteId("n1");
    const n2 = toNoteId("n2");

    await db.getAllNotes();
    await db.getNote(n1);
    await db.createNote({ body: "new" });
    await db.updateNote({ id: n1, body: "changed" });
    await db.deleteNote(n1);
    await db.deleteNotes([n1, n2]);
    await db.archiveNotes([n1]);
    await db.trashNote(n1);
    await db.trashNotes([n1]);
    await db.restoreNote(n1);
    await db.restoreNotes([n1]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/notes", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/notes/n1");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/notes", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/notes/n1", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/notes/n1", { method: "DELETE" });
    expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/notes/delete", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(7, "/api/notes/archive", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(8, "/api/notes/n1/trash", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(9, "/api/notes/trash", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(10, "/api/notes/n1/restore", { method: "POST" });
    expect(fetchMock).toHaveBeenNthCalledWith(11, "/api/notes/restore", expect.objectContaining({ method: "POST" }));
  });

  it("uses the expected tag and view routes", async () => {
    const fetchMock = mockFetch([]);
    const db = getDB();
    const n1 = toNoteId("n1");

    await db.getAllTags();
    await db.addTag(n1, "work");
    await db.removeTag(n1, "needs encoding");
    await db.addTagToNotes([n1], "bulk");
    await db.removeTagFromNotes([n1], "bulk");
    await db.renameTag("old", "new");
    await db.updateTagIcon(7, "star");
    await db.deleteTag(7);
    await db.search("hello world");
    await db.getUntaggedNotes();
    await db.getLinkedNotes();
    await db.getArchivedNotes();
    await db.getTrashedNotes();
    await db.getNotesForTag(3);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/tags", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/notes/n1/tags", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/notes/n1/tags/needs%20encoding", { method: "DELETE" });
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/notes/tags/add", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/notes/tags/remove", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/tags/rename", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(7, "/api/tags/7/icon", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(8, "/api/tags/7", { method: "DELETE" });
    expect(fetchMock).toHaveBeenNthCalledWith(9, "/api/search?q=hello%20world", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(10, "/api/views/untagged", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(11, "/api/views/links", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(12, "/api/views/archived", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(13, "/api/views/trash", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(14, "/api/views/tag/3", undefined);
  });

  it("maps 404 nullable reads to null and non-ok responses to errors", async () => {
    const notFound = vi.fn((..._args: Parameters<typeof fetch>) =>
      Promise.resolve(jsonResponse({ error: "missing" }, 404)));
    globalThis.fetch = notFound;
    await expect(getDB().getNote(toNoteId("missing"))).resolves.toBeNull();

    const broken = vi.fn((..._args: Parameters<typeof fetch>) =>
      Promise.resolve(jsonResponse({ error: "bad" }, 500)));
    globalThis.fetch = broken;
    await expect(getDB().getAllNotes()).rejects.toThrow("GET /api/notes: 500");
  });
});
