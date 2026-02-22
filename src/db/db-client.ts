import type {
  KeeperDB,
  NoteWithTags,
  Tag,
  SearchResult,
  Media,
  CreateNoteInput,
  UpdateNoteInput,
} from "./types.ts";

// ── HTTP helpers ─────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url}: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function fetchNullable<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchVoid(url: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url}: ${res.status}`);
  }
}

function jsonOpts(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ── KeeperDB HTTP client ────────────────────────────────────

const db: KeeperDB = {
  // Notes CRUD
  createNote: (input: CreateNoteInput) =>
    fetchJson<NoteWithTags>("/api/notes", jsonOpts("POST", input)),

  getAllNotes: () => fetchJson<NoteWithTags[]>("/api/notes"),

  getNote: (id: string) => fetchNullable<NoteWithTags>(`/api/notes/${id}`),

  updateNote: (input: UpdateNoteInput) =>
    fetchJson<NoteWithTags>(`/api/notes/${input.id}`, jsonOpts("PUT", input)),

  deleteNote: (id: string) =>
    fetchVoid(`/api/notes/${id}`, { method: "DELETE" }),

  deleteNotes: (ids: string[]) =>
    fetchVoid("/api/notes/delete", jsonOpts("POST", { ids })),

  archiveNotes: (ids: string[]) =>
    fetchVoid("/api/notes/archive", jsonOpts("POST", { ids })),

  togglePinNote: (id: string) =>
    fetchJson<NoteWithTags>(`/api/notes/${id}/pin`, { method: "POST" }),

  toggleArchiveNote: (id: string) =>
    fetchJson<NoteWithTags>(`/api/notes/${id}/archive`, { method: "POST" }),

  // Tags
  getAllTags: () => fetchJson<Tag[]>("/api/tags"),

  addTag: (noteId: string, tagName: string) =>
    fetchJson<NoteWithTags>(
      `/api/notes/${noteId}/tags`,
      jsonOpts("POST", { name: tagName }),
    ),

  removeTag: (noteId: string, tagName: string) =>
    fetchJson<NoteWithTags>(
      `/api/notes/${noteId}/tags/${encodeURIComponent(tagName)}`,
      { method: "DELETE" },
    ),

  renameTag: (oldName: string, newName: string) =>
    fetchVoid("/api/tags/rename", jsonOpts("PUT", { oldName, newName })),

  updateTagIcon: (tagId: number, icon: string | null) =>
    fetchVoid(`/api/tags/${tagId}/icon`, jsonOpts("PUT", { icon })),

  deleteTag: (tagId: number) =>
    fetchVoid(`/api/tags/${tagId}`, { method: "DELETE" }),

  // Search
  search: (query: string) =>
    fetchJson<SearchResult[]>(
      `/api/search?q=${encodeURIComponent(query)}`,
    ),

  // Smart views
  getUntaggedNotes: () => fetchJson<NoteWithTags[]>("/api/views/untagged"),
  getLinkedNotes: () => fetchJson<NoteWithTags[]>("/api/views/links"),
  getArchivedNotes: () => fetchJson<NoteWithTags[]>("/api/views/archived"),
  getNotesForTag: (tagId: number) =>
    fetchJson<NoteWithTags[]>(`/api/views/tag/${tagId}`),

  // Media
  async storeMedia(input) {
    const form = new FormData();
    form.append("noteId", input.noteId);
    form.append("mimeType", input.mimeType);
    form.append("file", new Blob([input.data], { type: input.mimeType }));
    return fetchJson<Media>("/api/media", { method: "POST", body: form });
  },

  async getMedia(id: string) {
    const res = await fetch(`/api/media/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET /api/media/${id}: ${res.status}`);
    return res.arrayBuffer();
  },

  deleteMedia: (id: string) =>
    fetchVoid(`/api/media/${id}`, { method: "DELETE" }),

  getMediaForNote: (noteId: string) =>
    fetchJson<Media[]>(`/api/notes/${noteId}/media`),
};

export function getDB(): KeeperDB {
  return db;
}
