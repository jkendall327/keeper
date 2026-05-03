// ── Data types ──────────────────────────────────────────────

export interface Note {
  id: string;
  title: string;
  body: string;
  has_links: boolean;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: number;
  name: string;
  icon: string | null;
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

export type LinkPreviewStatus = "found" | "missing" | "error";

export interface LinkPreview {
  url: string;
  image_url: string | null;
  status: LinkPreviewStatus;
  fetched_at: string;
  updated_at: string;
}

export interface NoteWithTags extends Note {
  tags: Tag[];
  link_preview: LinkPreview | null;
}

/** Default icon for tags without a custom icon */
export function tagDisplayIcon(tag: Tag): string {
  return tag.icon ?? "label";
}

export interface SearchResult extends NoteWithTags {
  rank: number;
}

export interface AutoTagRule {
  id: number;
  pattern: string;
  tagNames: string[];
  created_at: string;
  updated_at: string;
}

export interface AutoTagRuleInput {
  pattern: string;
  tagNames: string[];
}

export interface UpdateAutoTagRuleInput extends AutoTagRuleInput {
  id: number;
}

export interface AutoTagRunResult {
  matchedNoteCount: number;
  archivedNoteCount: number;
  appliedTagCount: number;
}

export const DEFAULT_EXTENSION_TITLE_MAX_LENGTH = 120;
export const MIN_EXTENSION_TITLE_MAX_LENGTH = 4;
export const MAX_EXTENSION_TITLE_MAX_LENGTH = 500;

export interface AppSettings {
  extensionTitleMaxLength: number;
}

export interface UpdateAppSettingsInput {
  extensionTitleMaxLength?: number;
}

// ── Input types ─────────────────────────────────────────────

export interface CreateNoteInput {
  title?: string;
  body: string;
}

export interface UpdateNoteInput {
  id: string;
  title?: string;
  body?: string;
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
  archiveNotes(ids: string[]): Promise<void>;
  togglePinNote(id: string): Promise<NoteWithTags>;
  toggleArchiveNote(id: string): Promise<NoteWithTags>;

  // Tags
  addTag(noteId: string, tagName: string): Promise<NoteWithTags>;
  removeTag(noteId: string, tagName: string): Promise<NoteWithTags>;
  addTagToNotes(noteIds: string[], tagName: string): Promise<void>;
  removeTagFromNotes(noteIds: string[], tagName: string): Promise<void>;
  renameTag(oldName: string, newName: string): Promise<void>;
  updateTagIcon(tagId: number, icon: string | null): Promise<void>;
  deleteTag(tagId: number): Promise<void>;
  getAllTags(): Promise<Tag[]>;

  // Search
  search(query: string): Promise<SearchResult[]>;

  // Trash
  trashNote(id: string): Promise<void>;
  trashNotes(ids: string[]): Promise<void>;
  restoreNote(id: string): Promise<void>;
  restoreNotes(ids: string[]): Promise<void>;
  getTrashedNotes(): Promise<NoteWithTags[]>;

  // Smart views
  getUntaggedNotes(): Promise<NoteWithTags[]>;
  getLinkedNotes(): Promise<NoteWithTags[]>;
  getNotesForTag(tagId: number): Promise<NoteWithTags[]>;
  getArchivedNotes(): Promise<NoteWithTags[]>;

  // Autotag rules
  getAutoTagRules(): Promise<AutoTagRule[]>;
  createAutoTagRule(input: AutoTagRuleInput): Promise<AutoTagRule>;
  updateAutoTagRule(input: UpdateAutoTagRuleInput): Promise<AutoTagRule>;
  deleteAutoTagRule(id: number): Promise<void>;
  runAutoTagRules(): Promise<AutoTagRunResult>;

  // App settings
  getAppSettings(): Promise<AppSettings>;
  updateAppSettings(input: UpdateAppSettingsInput): Promise<AppSettings>;

  // Media
  storeMedia(input: StoreMediaInput): Promise<Media>;
  getMedia(id: string): Promise<ArrayBuffer | null>;
  deleteMedia(id: string): Promise<void>;
  getMediaForNote(noteId: string): Promise<Media[]>;

  // Link previews
  getLinkPreview(url: string): Promise<LinkPreview | null>;
  upsertLinkPreview(input: Pick<LinkPreview, "url" | "image_url" | "status">): Promise<LinkPreview>;
}
