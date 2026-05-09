import type {
  AppSettings,
  AutoTagRule,
  AutoTagRuleInput,
  AutoTagRunResult,
  CreateNoteInput,
  LinkPreview,
  Media,
  NoteId,
  NoteWithTags,
  SearchResult,
  StoreMediaInput,
  Tag,
  UpdateAppSettingsInput,
  UpdateAutoTagRuleInput,
  UpdateNoteInput,
} from './types.ts';

type FetchFn = typeof fetch;

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface KeeperClient {
  notes: {
    create(input: CreateNoteInput): Promise<NoteWithTags>;
    list(options?: RequestOptions): Promise<NoteWithTags[]>;
    get(id: NoteId, options?: RequestOptions): Promise<NoteWithTags | null>;
    update(input: UpdateNoteInput): Promise<NoteWithTags>;
    delete(id: NoteId): Promise<void>;
    deleteMany(ids: NoteId[]): Promise<void>;
    archiveMany(ids: NoteId[]): Promise<void>;
    trash(id: NoteId): Promise<void>;
    trashMany(ids: NoteId[]): Promise<void>;
    restore(id: NoteId): Promise<void>;
    restoreMany(ids: NoteId[]): Promise<void>;
    togglePin(id: NoteId): Promise<NoteWithTags>;
    toggleArchive(id: NoteId): Promise<NoteWithTags>;
  };
  tags: {
    list(options?: RequestOptions): Promise<Tag[]>;
    addToNote(noteId: NoteId, tagName: string): Promise<NoteWithTags>;
    removeFromNote(noteId: NoteId, tagName: string): Promise<NoteWithTags>;
    addToNotes(noteIds: NoteId[], tagName: string): Promise<void>;
    removeFromNotes(noteIds: NoteId[], tagName: string): Promise<void>;
    rename(oldName: string, newName: string): Promise<void>;
    updateIcon(tagId: number, icon: string | null): Promise<void>;
    delete(tagId: number): Promise<void>;
  };
  search: {
    notes(query: string, options?: RequestOptions): Promise<SearchResult[]>;
  };
  views: {
    untagged(options?: RequestOptions): Promise<NoteWithTags[]>;
    linked(options?: RequestOptions): Promise<NoteWithTags[]>;
    archived(options?: RequestOptions): Promise<NoteWithTags[]>;
    trashed(options?: RequestOptions): Promise<NoteWithTags[]>;
    tag(tagId: number, options?: RequestOptions): Promise<NoteWithTags[]>;
  };
  autoTagRules: {
    list(options?: RequestOptions): Promise<AutoTagRule[]>;
    create(input: AutoTagRuleInput): Promise<AutoTagRule>;
    update(input: UpdateAutoTagRuleInput): Promise<AutoTagRule>;
    delete(id: number): Promise<void>;
    run(): Promise<AutoTagRunResult>;
  };
  settings: {
    get(options?: RequestOptions): Promise<AppSettings>;
    update(input: UpdateAppSettingsInput): Promise<AppSettings>;
  };
  media: {
    store(input: StoreMediaInput): Promise<Media>;
    get(id: string, options?: RequestOptions): Promise<ArrayBuffer | null>;
    delete(id: string): Promise<void>;
    listForNote(noteId: NoteId, options?: RequestOptions): Promise<Media[]>;
  };
  linkPreviews: {
    get(url: string, options?: RequestOptions): Promise<LinkPreview | null>;
    upsert(input: Pick<LinkPreview, 'url' | 'image_url' | 'status'>): Promise<LinkPreview>;
  };
}

async function fetchJson<T>(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<T> {
  const res = await fetchFn(url, init);
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url}: ${String(res.status)}`);
  }
  return res.json() as Promise<T>;
}

async function fetchNullable<T>(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetchFn(url, init);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url}: ${String(res.status)}`);
  return res.json() as Promise<T>;
}

async function fetchVoid(fetchFn: FetchFn, url: string, init?: RequestInit): Promise<void> {
  const res = await fetchFn(url, init);
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url}: ${String(res.status)}`);
  }
}

function jsonOpts(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function withSignal(options?: RequestOptions): RequestInit | undefined {
  return options?.signal === undefined ? undefined : { signal: options.signal };
}

export function createHttpClient(fetchFn: FetchFn = (...args) => globalThis.fetch(...args)): KeeperClient {
  return {
    notes: {
      create: (input) => fetchJson<NoteWithTags>(fetchFn, '/api/notes', jsonOpts('POST', input)),
      list: (options) => fetchJson<NoteWithTags[]>(fetchFn, '/api/notes', withSignal(options)),
      get: (id, options) => fetchNullable<NoteWithTags>(fetchFn, `/api/notes/${id}`, withSignal(options)),
      update: (input) => fetchJson<NoteWithTags>(fetchFn, `/api/notes/${input.id}`, jsonOpts('PUT', input)),
      delete: (id) => fetchVoid(fetchFn, `/api/notes/${id}`, { method: 'DELETE' }),
      deleteMany: (ids) => fetchVoid(fetchFn, '/api/notes/delete', jsonOpts('POST', { ids })),
      archiveMany: (ids) => fetchVoid(fetchFn, '/api/notes/archive', jsonOpts('POST', { ids })),
      trash: (id) => fetchVoid(fetchFn, `/api/notes/${id}/trash`, { method: 'POST' }),
      trashMany: (ids) => fetchVoid(fetchFn, '/api/notes/trash', jsonOpts('POST', { ids })),
      restore: (id) => fetchVoid(fetchFn, `/api/notes/${id}/restore`, { method: 'POST' }),
      restoreMany: (ids) => fetchVoid(fetchFn, '/api/notes/restore', jsonOpts('POST', { ids })),
      togglePin: (id) => fetchJson<NoteWithTags>(fetchFn, `/api/notes/${id}/pin`, { method: 'POST' }),
      toggleArchive: (id) => fetchJson<NoteWithTags>(fetchFn, `/api/notes/${id}/archive`, { method: 'POST' }),
    },
    tags: {
      list: (options) => fetchJson<Tag[]>(fetchFn, '/api/tags', withSignal(options)),
      addToNote: (noteId, tagName) =>
        fetchJson<NoteWithTags>(fetchFn, `/api/notes/${noteId}/tags`, jsonOpts('POST', { name: tagName })),
      removeFromNote: (noteId, tagName) =>
        fetchJson<NoteWithTags>(
          fetchFn,
          `/api/notes/${noteId}/tags/${encodeURIComponent(tagName)}`,
          { method: 'DELETE' },
        ),
      addToNotes: (noteIds, tagName) =>
        fetchVoid(fetchFn, '/api/notes/tags/add', jsonOpts('POST', { noteIds, tagName })),
      removeFromNotes: (noteIds, tagName) =>
        fetchVoid(fetchFn, '/api/notes/tags/remove', jsonOpts('POST', { noteIds, tagName })),
      rename: (oldName, newName) =>
        fetchVoid(fetchFn, '/api/tags/rename', jsonOpts('PUT', { oldName, newName })),
      updateIcon: (tagId, icon) =>
        fetchVoid(fetchFn, `/api/tags/${String(tagId)}/icon`, jsonOpts('PUT', { icon })),
      delete: (tagId) => fetchVoid(fetchFn, `/api/tags/${String(tagId)}`, { method: 'DELETE' }),
    },
    search: {
      notes: (query, options) =>
        fetchJson<SearchResult[]>(fetchFn, `/api/search?q=${encodeURIComponent(query)}`, withSignal(options)),
    },
    views: {
      untagged: (options) => fetchJson<NoteWithTags[]>(fetchFn, '/api/views/untagged', withSignal(options)),
      linked: (options) => fetchJson<NoteWithTags[]>(fetchFn, '/api/views/links', withSignal(options)),
      archived: (options) => fetchJson<NoteWithTags[]>(fetchFn, '/api/views/archived', withSignal(options)),
      trashed: (options) => fetchJson<NoteWithTags[]>(fetchFn, '/api/views/trash', withSignal(options)),
      tag: (tagId, options) => fetchJson<NoteWithTags[]>(fetchFn, `/api/views/tag/${String(tagId)}`, withSignal(options)),
    },
    autoTagRules: {
      list: (options) => fetchJson<AutoTagRule[]>(fetchFn, '/api/auto-tag-rules', withSignal(options)),
      create: (input) => fetchJson<AutoTagRule>(fetchFn, '/api/auto-tag-rules', jsonOpts('POST', input)),
      update: (input) =>
        fetchJson<AutoTagRule>(fetchFn, `/api/auto-tag-rules/${String(input.id)}`, jsonOpts('PUT', input)),
      delete: (id) => fetchVoid(fetchFn, `/api/auto-tag-rules/${String(id)}`, { method: 'DELETE' }),
      run: () => fetchJson<AutoTagRunResult>(fetchFn, '/api/auto-tag-rules/run', { method: 'POST' }),
    },
    settings: {
      get: (options) => fetchJson<AppSettings>(fetchFn, '/api/settings', withSignal(options)),
      update: (input) => fetchJson<AppSettings>(fetchFn, '/api/settings', jsonOpts('PUT', input)),
    },
    media: {
      async store(input) {
        const form = new FormData();
        form.append('noteId', input.noteId);
        form.append('mimeType', input.mimeType);
        form.append('file', new Blob([input.data], { type: input.mimeType }));
        return fetchJson<Media>(fetchFn, '/api/media', { method: 'POST', body: form });
      },
      async get(id, options) {
        const res = await fetchFn(`/api/media/${id}`, withSignal(options));
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GET /api/media/${id}: ${String(res.status)}`);
        return res.arrayBuffer();
      },
      delete: (id) => fetchVoid(fetchFn, `/api/media/${id}`, { method: 'DELETE' }),
      listForNote: (noteId, options) =>
        fetchJson<Media[]>(fetchFn, `/api/notes/${noteId}/media`, withSignal(options)),
    },
    linkPreviews: {
      get: (url, options) =>
        fetchNullable<LinkPreview>(fetchFn, `/api/link-preview?url=${encodeURIComponent(url)}`, withSignal(options)),
      upsert: (input) => fetchJson<LinkPreview>(fetchFn, '/api/link-previews', jsonOpts('PUT', input)),
    },
  };
}
