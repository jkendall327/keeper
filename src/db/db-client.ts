import type {
  KeeperDB,
  NoteWithTags,
  Tag,
  SearchResult,
  Media,
  CreateNoteInput,
  UpdateNoteInput,
  AutoTagRule,
  AutoTagRuleInput,
  UpdateAutoTagRuleInput,
  AutoTagRunResult,
  AppSettings,
  UpdateAppSettingsInput,
  LinkPreview,
  NoteId,
} from "./types.ts";

// ── HTTP helpers ─────────────────────────────────────────────

type FetchFn = typeof fetch;

async function fetchJson<T>(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<T> {
  const res = await fetchFn(url, init);
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url}: ${String(res.status)}`);
  }
  return res.json() as Promise<T>;
}

async function fetchNullable<T>(fetchFn: FetchFn, url: string): Promise<T | null> {
  const res = await fetchFn(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url}: ${String(res.status)}`);
  return res.json() as Promise<T>;
}

async function fetchVoid(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<void> {
  const res = await fetchFn(url, init);
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url}: ${String(res.status)}`);
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

export function createHttpDB(fetchFn: FetchFn = (...args) => globalThis.fetch(...args)): KeeperDB {
  return {
  // Notes CRUD
  createNote: (input: CreateNoteInput) =>
    fetchJson<NoteWithTags>(fetchFn, "/api/notes", jsonOpts("POST", input)),

  getAllNotes: () => fetchJson<NoteWithTags[]>(fetchFn, "/api/notes"),

  getNote: (id: NoteId) => fetchNullable<NoteWithTags>(fetchFn, `/api/notes/${id}`),

  updateNote: (input: UpdateNoteInput) =>
    fetchJson<NoteWithTags>(fetchFn, `/api/notes/${input.id}`, jsonOpts("PUT", input)),

  deleteNote: (id: NoteId) =>
    fetchVoid(fetchFn, `/api/notes/${id}`, { method: "DELETE" }),

  deleteNotes: (ids: NoteId[]) =>
    fetchVoid(fetchFn, "/api/notes/delete", jsonOpts("POST", { ids })),

  archiveNotes: (ids: NoteId[]) =>
    fetchVoid(fetchFn, "/api/notes/archive", jsonOpts("POST", { ids })),

  trashNote: (id: NoteId) =>
    fetchVoid(fetchFn, `/api/notes/${id}/trash`, { method: "POST" }),

  trashNotes: (ids: NoteId[]) =>
    fetchVoid(fetchFn, "/api/notes/trash", jsonOpts("POST", { ids })),

  restoreNote: (id: NoteId) =>
    fetchVoid(fetchFn, `/api/notes/${id}/restore`, { method: "POST" }),

  restoreNotes: (ids: NoteId[]) =>
    fetchVoid(fetchFn, "/api/notes/restore", jsonOpts("POST", { ids })),

  togglePinNote: (id: NoteId) =>
    fetchJson<NoteWithTags>(fetchFn, `/api/notes/${id}/pin`, { method: "POST" }),

  toggleArchiveNote: (id: NoteId) =>
    fetchJson<NoteWithTags>(fetchFn, `/api/notes/${id}/archive`, { method: "POST" }),

  // Tags
  getAllTags: () => fetchJson<Tag[]>(fetchFn, "/api/tags"),

  addTag: (noteId: NoteId, tagName: string) =>
    fetchJson<NoteWithTags>(
      fetchFn,
      `/api/notes/${noteId}/tags`,
      jsonOpts("POST", { name: tagName }),
    ),

  removeTag: (noteId: NoteId, tagName: string) =>
    fetchJson<NoteWithTags>(
      fetchFn,
      `/api/notes/${noteId}/tags/${encodeURIComponent(tagName)}`,
      { method: "DELETE" },
    ),

  addTagToNotes: (noteIds: NoteId[], tagName: string) =>
    fetchVoid(fetchFn, "/api/notes/tags/add", jsonOpts("POST", { noteIds, tagName })),

  removeTagFromNotes: (noteIds: NoteId[], tagName: string) =>
    fetchVoid(fetchFn, "/api/notes/tags/remove", jsonOpts("POST", { noteIds, tagName })),

  renameTag: (oldName: string, newName: string) =>
    fetchVoid(fetchFn, "/api/tags/rename", jsonOpts("PUT", { oldName, newName })),

  updateTagIcon: (tagId: number, icon: string | null) =>
    fetchVoid(fetchFn, `/api/tags/${String(tagId)}/icon`, jsonOpts("PUT", { icon })),

  deleteTag: (tagId: number) =>
    fetchVoid(fetchFn, `/api/tags/${String(tagId)}`, { method: "DELETE" }),

  // Search
  search: (query: string) =>
    fetchJson<SearchResult[]>(
      fetchFn,
      `/api/search?q=${encodeURIComponent(query)}`,
    ),

  // Smart views
  getUntaggedNotes: () => fetchJson<NoteWithTags[]>(fetchFn, "/api/views/untagged"),
  getLinkedNotes: () => fetchJson<NoteWithTags[]>(fetchFn, "/api/views/links"),
  getArchivedNotes: () => fetchJson<NoteWithTags[]>(fetchFn, "/api/views/archived"),
  getTrashedNotes: () => fetchJson<NoteWithTags[]>(fetchFn, "/api/views/trash"),
  getNotesForTag: (tagId: number) =>
    fetchJson<NoteWithTags[]>(fetchFn, `/api/views/tag/${String(tagId)}`),

  // Autotag rules
  getAutoTagRules: () => fetchJson<AutoTagRule[]>(fetchFn, "/api/auto-tag-rules"),

  createAutoTagRule: (input: AutoTagRuleInput) =>
    fetchJson<AutoTagRule>(fetchFn, "/api/auto-tag-rules", jsonOpts("POST", input)),

  updateAutoTagRule: (input: UpdateAutoTagRuleInput) =>
    fetchJson<AutoTagRule>(
      fetchFn,
      `/api/auto-tag-rules/${String(input.id)}`,
      jsonOpts("PUT", input),
    ),

  deleteAutoTagRule: (id: number) =>
    fetchVoid(fetchFn, `/api/auto-tag-rules/${String(id)}`, { method: "DELETE" }),

  runAutoTagRules: () =>
    fetchJson<AutoTagRunResult>(fetchFn, "/api/auto-tag-rules/run", { method: "POST" }),

  // App settings
  getAppSettings: () => fetchJson<AppSettings>(fetchFn, "/api/settings"),

  updateAppSettings: (input: UpdateAppSettingsInput) =>
    fetchJson<AppSettings>(fetchFn, "/api/settings", jsonOpts("PUT", input)),

  // Media
  async storeMedia(input) {
    const form = new FormData();
    form.append("noteId", input.noteId);
    form.append("mimeType", input.mimeType);
    form.append("file", new Blob([input.data], { type: input.mimeType }));
    return fetchJson<Media>(fetchFn, "/api/media", { method: "POST", body: form });
  },

  async getMedia(id: string) {
    const res = await fetchFn(`/api/media/${id}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET /api/media/${id}: ${String(res.status)}`);
    return res.arrayBuffer();
  },

  deleteMedia: (id: string) =>
    fetchVoid(fetchFn, `/api/media/${id}`, { method: "DELETE" }),

  getMediaForNote: (noteId: NoteId) =>
    fetchJson<Media[]>(fetchFn, `/api/notes/${noteId}/media`),

  getLinkPreview: (url: string) =>
    fetchNullable<LinkPreview>(fetchFn, `/api/link-preview?url=${encodeURIComponent(url)}`),

  upsertLinkPreview: (input) =>
    fetchJson<LinkPreview>(fetchFn, "/api/link-previews", jsonOpts("PUT", input)),
  };
}
