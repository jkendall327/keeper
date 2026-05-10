// ── Data types ──────────────────────────────────────────────

declare const noteIdBrand: unique symbol;

export type NoteId = string & { readonly [noteIdBrand]: true };

export function toNoteId(value: string): NoteId {
  return value as NoteId;
}

export function toNoteIds(values: string[]): NoteId[] {
  return values.map(toNoteId);
}

export interface Note {
  id: NoteId;
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
  note_id: NoteId;
  tag_id: number;
}

export interface Media {
  id: string;
  note_id: NoteId;
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
export const DEFAULT_POPULAR_TAG_SUGGESTION_LIMIT = 5;
export const MIN_POPULAR_TAG_SUGGESTION_LIMIT = 1;
export const MAX_POPULAR_TAG_SUGGESTION_LIMIT = 50;

export function normalizePopularTagSuggestionLimit(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error("Popular tag suggestion count must be a whole number");
  }
  if (value < MIN_POPULAR_TAG_SUGGESTION_LIMIT || value > MAX_POPULAR_TAG_SUGGESTION_LIMIT) {
    throw new Error(
      `Popular tag suggestion count must be between ${String(MIN_POPULAR_TAG_SUGGESTION_LIMIT)} and ${String(MAX_POPULAR_TAG_SUGGESTION_LIMIT)}`,
    );
  }
  return value;
}

export interface AppSettings {
  extensionTitleMaxLength: number;
  extensionBadgeEnabled: boolean;
  linkPreviewFetchEnabled: boolean;
  linkPreviewDisplayEnabled: boolean;
  popularTagSuggestionsEnabled: boolean;
  popularTagSuggestionLimit: number;
  quickAddAutofocusEnabled: boolean;
}

export interface UpdateAppSettingsInput {
  extensionTitleMaxLength?: number;
  extensionBadgeEnabled?: boolean;
  linkPreviewFetchEnabled?: boolean;
  linkPreviewDisplayEnabled?: boolean;
  popularTagSuggestionsEnabled?: boolean;
  popularTagSuggestionLimit?: number;
  quickAddAutofocusEnabled?: boolean;
}

// ── Input types ─────────────────────────────────────────────

export interface CreateNoteInput {
  title?: string;
  body: string;
  initialTagNames?: string[];
}

export interface UpdateNoteInput {
  id: NoteId;
  title?: string;
  body?: string;
}

export interface StoreMediaInput {
  noteId: NoteId;
  mimeType: string;
  data: ArrayBuffer;
}

// ── DB API contract ─────────────────────────────────────────

export interface KeeperDB {
  // Notes CRUD
  createNote(input: CreateNoteInput): Promise<NoteWithTags>;
  getNote(id: NoteId): Promise<NoteWithTags | null>;
  getAllNotes(): Promise<NoteWithTags[]>;
  updateNote(input: UpdateNoteInput): Promise<NoteWithTags>;
  deleteNote(id: NoteId): Promise<void>;
  deleteNotes(ids: NoteId[]): Promise<void>;
  archiveNotes(ids: NoteId[]): Promise<void>;
  togglePinNote(id: NoteId): Promise<NoteWithTags>;
  toggleArchiveNote(id: NoteId): Promise<NoteWithTags>;

  // Tags
  addTag(noteId: NoteId, tagName: string): Promise<NoteWithTags>;
  removeTag(noteId: NoteId, tagName: string): Promise<NoteWithTags>;
  addTagToNotes(noteIds: NoteId[], tagName: string): Promise<void>;
  removeTagFromNotes(noteIds: NoteId[], tagName: string): Promise<void>;
  getPopularTagSuggestions(noteId: NoteId, limit: number): Promise<Tag[]>;
  renameTag(oldName: string, newName: string): Promise<void>;
  updateTagIcon(tagId: number, icon: string | null): Promise<void>;
  deleteTag(tagId: number): Promise<void>;
  getAllTags(): Promise<Tag[]>;

  // Search
  search(query: string): Promise<SearchResult[]>;

  // Trash
  trashNote(id: NoteId): Promise<void>;
  trashNotes(ids: NoteId[]): Promise<void>;
  restoreNote(id: NoteId): Promise<void>;
  restoreNotes(ids: NoteId[]): Promise<void>;
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
  getMediaForNote(noteId: NoteId): Promise<Media[]>;

  // Link previews
  getLinkPreview(url: string): Promise<LinkPreview | null>;
  upsertLinkPreview(input: Pick<LinkPreview, "url" | "image_url" | "status">): Promise<LinkPreview>;
}
