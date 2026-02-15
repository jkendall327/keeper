// ── Data types ──────────────────────────────────────────────

export interface Note {
  id: string;
  title: string;
  body: string;
  has_links: boolean;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface NoteTag {
  note_id: string;
  tag_id: number;
}

export interface Media {
  id: string;
  note_id: string;
  mime_type: string;
  filename: string;
  created_at: string;
}

export interface NoteWithTags extends Note {
  tags: Tag[];
}

export interface SearchResult extends NoteWithTags {
  rank: number;
}

// ── Input types ─────────────────────────────────────────────

export interface CreateNoteInput {
  title?: string | undefined;
  body: string;
}

export interface UpdateNoteInput {
  id: string;
  title?: string | undefined;
  body?: string | undefined;
}

export interface StoreMediaInput {
  noteId: string;
  mimeType: string;
  data: ArrayBuffer;
}

// ── DB API contract ─────────────────────────────────────────

export interface KeeperDB {
  // Notes CRUD
  createNote(input: CreateNoteInput): Promise<NoteWithTags>;
  getNote(id: string): Promise<NoteWithTags | null>;
  getAllNotes(): Promise<NoteWithTags[]>;
  updateNote(input: UpdateNoteInput): Promise<NoteWithTags>;
  deleteNote(id: string): Promise<void>;
  deleteNotes(ids: string[]): Promise<void>;
  togglePinNote(id: string): Promise<NoteWithTags>;

  // Tags
  addTag(noteId: string, tagName: string): Promise<NoteWithTags>;
  removeTag(noteId: string, tagName: string): Promise<NoteWithTags>;
  renameTag(oldName: string, newName: string): Promise<void>;
  deleteTag(tagId: number): Promise<void>;
  getAllTags(): Promise<Tag[]>;

  // Search
  search(query: string): Promise<SearchResult[]>;

  // Smart views
  getUntaggedNotes(): Promise<NoteWithTags[]>;
  getLinkedNotes(): Promise<NoteWithTags[]>;
  getNotesForTag(tagId: number): Promise<NoteWithTags[]>;

  // Media
  storeMedia(input: StoreMediaInput): Promise<Media>;
  getMedia(id: string): Promise<ArrayBuffer | null>;
  deleteMedia(id: string): Promise<void>;
  getMediaForNote(noteId: string): Promise<Media[]>;
}
