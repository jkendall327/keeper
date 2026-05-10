import { describe, expect, it, vi } from "vitest";
import { createHttpClient } from "../db/db-client.ts";
import { toNoteId } from "../db/types.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(body: unknown = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((..._args: Parameters<typeof fetch>) => Promise.resolve(jsonResponse(body)));
  return fetchMock;
}

function asFetch(fetchMock: ReturnType<typeof vi.fn>): typeof fetch {
  return fetchMock as unknown as typeof fetch;
}

describe("KeeperDB HTTP client contract", () => {
  it("uses the expected note routes", async () => {
    const fetchMock = mockFetch([]);
    const client = createHttpClient(asFetch(fetchMock));
    const n1 = toNoteId("n1");
    const n2 = toNoteId("n2");

    await client.notes.list();
    await client.notes.get(n1);
    await client.notes.create({ body: "new" });
    await client.notes.update({ id: n1, body: "changed" });
    await client.notes.delete(n1);
    await client.notes.deleteMany([n1, n2]);
    await client.notes.archiveMany([n1]);
    await client.notes.trash(n1);
    await client.notes.trashMany([n1]);
    await client.notes.restore(n1);
    await client.notes.restoreMany([n1]);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/notes", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/notes/n1", undefined);
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
    const client = createHttpClient(asFetch(fetchMock));
    const n1 = toNoteId("n1");

    await client.tags.list();
    await client.tags.addToNote(n1, "work");
    await client.tags.removeFromNote(n1, "needs encoding");
    await client.tags.addToNotes([n1], "bulk");
    await client.tags.removeFromNotes([n1], "bulk");
    await client.tags.popularSuggestions(n1, 5);
    await client.tags.rename("old", "new");
    await client.tags.updateIcon(7, "star");
    await client.tags.delete(7);
    await client.search.notes("hello world");
    await client.views.untagged();
    await client.views.linked();
    await client.views.archived();
    await client.views.trashed();
    await client.views.tag(3);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/tags", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/notes/n1/tags", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/notes/n1/tags/needs%20encoding", { method: "DELETE" });
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/notes/tags/add", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/notes/tags/remove", expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/tags/popular-suggestions?noteId=n1&limit=5", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(7, "/api/tags/rename", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(8, "/api/tags/7/icon", expect.objectContaining({ method: "PUT" }));
    expect(fetchMock).toHaveBeenNthCalledWith(9, "/api/tags/7", { method: "DELETE" });
    expect(fetchMock).toHaveBeenNthCalledWith(10, "/api/search?q=hello%20world", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(11, "/api/views/untagged", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(12, "/api/views/links", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(13, "/api/views/archived", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(14, "/api/views/trash", undefined);
    expect(fetchMock).toHaveBeenNthCalledWith(15, "/api/views/tag/3", undefined);
  });

  it("maps 404 nullable reads to null and non-ok responses to errors", async () => {
    const notFound = vi.fn((..._args: Parameters<typeof fetch>) =>
      Promise.resolve(jsonResponse({ error: "missing" }, 404)));
    await expect(createHttpClient(asFetch(notFound)).notes.get(toNoteId("missing"))).resolves.toBeNull();

    const broken = vi.fn((..._args: Parameters<typeof fetch>) =>
      Promise.resolve(jsonResponse({ error: "bad" }, 500)));
    await expect(createHttpClient(asFetch(broken)).notes.list()).rejects.toThrow("GET /api/notes: 500");
  });
});
