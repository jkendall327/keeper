import { extractUrls } from '../db/url-detect';
import { DEFAULT_EXTENSION_TITLE_MAX_LENGTH } from '../db/types';
import type {
  AutoTagRule,
  AutoTagRuleInput,
  AutoTagRunResult,
  AppSettings,
  KeeperDB,
  LinkPreview,
  NoteWithTags,
  Tag,
  CreateNoteInput,
  UpdateNoteInput,
  SearchResult,
  UpdateAutoTagRuleInput,
  UpdateAppSettingsInput,
} from '../db/types';
import { normalizeExtensionTitleMaxLength } from '../utils/extension-title';

export interface MockDB extends KeeperDB {
  reset(): void;
}

/**
 * Simple in-memory mock DB for UI integration tests.
 * Implements core KeeperDB interface without SQLite.
 */
export function createMockDB(): MockDB {
  let noteId = 1;
  let tagId = 1;
  let ruleId = 1;
  const notes = new Map<string, NoteWithTags>();
  const tags = new Map<number, Tag>();
  const rules = new Map<number, AutoTagRule>();
  const linkPreviews = new Map<string, LinkPreview>();
  let appSettings: AppSettings = {
    extensionTitleMaxLength: DEFAULT_EXTENSION_TITLE_MAX_LENGTH,
    extensionBadgeEnabled: true,
    linkPreviewFetchEnabled: true,
    linkPreviewDisplayEnabled: true,
  };

  const generateId = () => `n${String(noteId++)}`;
  const generateTagId = () => tagId++;
  const now = () => new Date().toISOString();
  const hasUrl = (text: string) => /https?:\/\//.test(text);

  const reset = () => {
    noteId = 1;
    tagId = 1;
    ruleId = 1;
    notes.clear();
    tags.clear();
    rules.clear();
    linkPreviews.clear();
    appSettings = {
      extensionTitleMaxLength: DEFAULT_EXTENSION_TITLE_MAX_LENGTH,
      extensionBadgeEnabled: true,
      linkPreviewFetchEnabled: true,
      linkPreviewDisplayEnabled: true,
    };
  };

  const normalizeRuleInput = (input: AutoTagRuleInput): AutoTagRuleInput => {
    const pattern = input.pattern.trim();
    if (pattern === '') throw new Error('Pattern is required');
    new RegExp(pattern, 'i');
    const tagNames = Array.from(new Set(input.tagNames.map((name) => name.trim()).filter((name) => name !== '')));
    if (tagNames.length === 0) throw new Error('At least one tag is required');
    return { pattern, tagNames };
  };

  const getOrCreateTag = (tagName: string): Tag => {
    const existing = Array.from(tags.values()).find(t => t.name === tagName);
    if (existing !== undefined) return existing;
    const tag = { id: generateTagId(), name: tagName, icon: null };
    tags.set(tag.id, tag);
    return tag;
  };

  return {
    reset,

    async createNote(input: CreateNoteInput): Promise<NoteWithTags> {
      const id = generateId();
      const note: NoteWithTags = {
        id,
        title: input.title ?? '',
        body: input.body,
        has_links: hasUrl(input.body),
        pinned: false,
        archived: false,
        trashed: false,
        created_at: now(),
        updated_at: now(),
        tags: [],
        link_preview: null,
      };
      notes.set(id, note);
      return Promise.resolve(note);
    },

    async getNote(id: string): Promise<NoteWithTags | null> {
      return Promise.resolve(notes.get(id) ?? null);
    },

    async getAllNotes(): Promise<NoteWithTags[]> {
      return Promise.resolve(
        Array.from(notes.values())
          .filter(n => !n.archived && !n.trashed)
          .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.updated_at.localeCompare(a.updated_at);
          }),
      );
    },

    async updateNote(input: UpdateNoteInput): Promise<NoteWithTags> {
      const note = notes.get(input.id);
      if (note === undefined) throw new Error(`Note ${input.id} not found`);

      const newBody = input.body ?? note.body;
      const updated = {
        ...note,
        title: input.title ?? note.title,
        body: newBody,
        has_links: hasUrl(newBody),
        updated_at: now(),
      };
      notes.set(input.id, updated);
      return Promise.resolve(updated);
    },

    async deleteNote(id: string): Promise<void> {
      notes.delete(id);
      return Promise.resolve();
    },

    async deleteNotes(ids: string[]): Promise<void> {
      for (const id of ids) {
        notes.delete(id);
      }
      return Promise.resolve();
    },

    async trashNote(id: string): Promise<void> {
      const note = notes.get(id);
      if (note !== undefined) {
        notes.set(id, { ...note, trashed: true });
      }
      return Promise.resolve();
    },

    async trashNotes(ids: string[]): Promise<void> {
      for (const id of ids) {
        const note = notes.get(id);
        if (note !== undefined) {
          notes.set(id, { ...note, trashed: true });
        }
      }
      return Promise.resolve();
    },

    async restoreNote(id: string): Promise<void> {
      const note = notes.get(id);
      if (note !== undefined) {
        notes.set(id, { ...note, trashed: false });
      }
      return Promise.resolve();
    },

    async getTrashedNotes(): Promise<NoteWithTags[]> {
      return Promise.resolve(
        Array.from(notes.values())
          .filter(n => n.trashed)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      );
    },

    async archiveNotes(ids: string[]): Promise<void> {
      for (const id of ids) {
        const note = notes.get(id);
        if (note !== undefined) {
          notes.set(id, { ...note, archived: true });
        }
      }
      return Promise.resolve();
    },

    async togglePinNote(id: string): Promise<NoteWithTags> {
      const note = notes.get(id);
      if (note === undefined) throw new Error(`Note ${id} not found`);

      const updated = {
        ...note,
        pinned: !note.pinned,
        updated_at: now(),
      };
      notes.set(id, updated);
      return Promise.resolve(updated);
    },

    async toggleArchiveNote(id: string): Promise<NoteWithTags> {
      const note = notes.get(id);
      if (note === undefined) throw new Error(`Note ${id} not found`);

      const updated = {
        ...note,
        archived: !note.archived,
        updated_at: now(),
      };
      notes.set(id, updated);
      return Promise.resolve(updated);
    },

    async addTag(noteId: string, tagName: string): Promise<NoteWithTags> {
      const note = notes.get(noteId);
      if (note === undefined) throw new Error(`Note ${noteId} not found`);

      const tag = getOrCreateTag(tagName);

      // Add to note if not already present
      if (!note.tags.some(t => t.name === tagName)) {
        note.tags = [...note.tags, tag];
      }

      return Promise.resolve(note);
    },

    async removeTag(noteId: string, tagName: string): Promise<NoteWithTags> {
      const note = notes.get(noteId);
      if (note === undefined) throw new Error(`Note ${noteId} not found`);

      note.tags = note.tags.filter(t => t.name !== tagName);
      return Promise.resolve(note);
    },

    async addTagToNotes(noteIds: string[], tagName: string): Promise<void> {
      const tag = getOrCreateTag(tagName);
      for (const noteId of noteIds) {
        const note = notes.get(noteId);
        if (note !== undefined && !note.tags.some(t => t.name === tagName)) {
          note.tags = [...note.tags, tag];
        }
      }
      return Promise.resolve();
    },

    async removeTagFromNotes(noteIds: string[], tagName: string): Promise<void> {
      for (const noteId of noteIds) {
        const note = notes.get(noteId);
        if (note !== undefined) {
          note.tags = note.tags.filter(t => t.name !== tagName);
        }
      }
      return Promise.resolve();
    },

    async restoreNotes(ids: string[]): Promise<void> {
      for (const id of ids) {
        const note = notes.get(id);
        if (note !== undefined) {
          notes.set(id, { ...note, trashed: false });
        }
      }
      return Promise.resolve();
    },

    async renameTag(oldName: string, newName: string): Promise<void> {
      for (const note of notes.values()) {
        for (const tag of note.tags) {
          if (tag.name === oldName) {
            tag.name = newName;
          }
        }
      }
      const tag = Array.from(tags.values()).find(t => t.name === oldName);
      if (tag !== undefined) {
        tag.name = newName;
      }
      return Promise.resolve();
    },

    async updateTagIcon(tagId: number, icon: string | null): Promise<void> {
      const tag = tags.get(tagId);
      if (tag !== undefined) {
        tag.icon = icon;
        // Update icon on all notes that have this tag
        for (const note of notes.values()) {
          for (const t of note.tags) {
            if (t.id === tagId) {
              t.icon = icon;
            }
          }
        }
      }
      return Promise.resolve();
    },

    async deleteTag(tagId: number): Promise<void> {
      // Remove tag from all notes
      for (const note of notes.values()) {
        note.tags = note.tags.filter(t => t.id !== tagId);
      }
      // Remove from tags map
      tags.delete(tagId);
      return Promise.resolve();
    },

    async getAllTags(): Promise<Tag[]> {
      return Promise.resolve(Array.from(tags.values()));
    },

    async search(query: string): Promise<SearchResult[]> {
      const q = query.toLowerCase();
      return Promise.resolve(
        Array.from(notes.values())
          .filter((n) => !n.trashed && (n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)))
          .map((n, i) => ({ ...n, rank: -(i + 1) })),
      );
    },

    async getUntaggedNotes(): Promise<NoteWithTags[]> {
      return Promise.resolve(
        Array.from(notes.values())
          .filter(n => n.tags.length === 0 && !n.archived && !n.trashed)
          .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.updated_at.localeCompare(a.updated_at);
          }),
      );
    },

    async getLinkedNotes(): Promise<NoteWithTags[]> {
      return Promise.resolve(Array.from(notes.values()).filter(n => n.has_links && !n.archived && !n.trashed));
    },

    async getNotesForTag(tagId: number): Promise<NoteWithTags[]> {
      return Promise.resolve(
        Array.from(notes.values())
          .filter(n => n.tags.some(t => t.id === tagId) && !n.trashed)
          .sort((a, b) => {
            if (a.archived !== b.archived) return a.archived ? 1 : -1;
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.updated_at.localeCompare(a.updated_at);
          }),
      );
    },

    async getArchivedNotes(): Promise<NoteWithTags[]> {
      return Promise.resolve(Array.from(notes.values()).filter(n => n.archived && !n.trashed));
    },

    async getAutoTagRules(): Promise<AutoTagRule[]> {
      return Promise.resolve(Array.from(rules.values()));
    },

    async createAutoTagRule(input: AutoTagRuleInput): Promise<AutoTagRule> {
      const normalized = normalizeRuleInput(input);
      const timestamp = now();
      const rule: AutoTagRule = {
        id: ruleId++,
        pattern: normalized.pattern,
        tagNames: normalized.tagNames,
        created_at: timestamp,
        updated_at: timestamp,
      };
      rules.set(rule.id, rule);
      return Promise.resolve(rule);
    },

    async updateAutoTagRule(input: UpdateAutoTagRuleInput): Promise<AutoTagRule> {
      if (!rules.has(input.id)) throw new Error(`Autotag rule not found: ${String(input.id)}`);
      const normalized = normalizeRuleInput(input);
      const existing = rules.get(input.id);
      if (existing === undefined) throw new Error(`Autotag rule not found: ${String(input.id)}`);
      const updated = {
        ...existing,
        pattern: normalized.pattern,
        tagNames: normalized.tagNames,
        updated_at: now(),
      };
      rules.set(input.id, updated);
      return Promise.resolve(updated);
    },

    async deleteAutoTagRule(id: number): Promise<void> {
      rules.delete(id);
      return Promise.resolve();
    },

    async runAutoTagRules(): Promise<AutoTagRunResult> {
      let matchedNoteCount = 0;
      let archivedNoteCount = 0;
      let appliedTagCount = 0;
      const compiledRules = Array.from(rules.values()).map((rule) => ({
        regex: new RegExp(rule.pattern, 'i'),
        tagNames: rule.tagNames,
      }));

      for (const note of notes.values()) {
        if (note.archived || note.trashed) continue;
        const urls = extractUrls(note.body);
        const matchedTagNames = new Set<string>();
        for (const rule of compiledRules) {
          if (urls.some((url) => rule.regex.test(url))) {
            for (const tagName of rule.tagNames) {
              matchedTagNames.add(tagName);
            }
          }
        }
        if (matchedTagNames.size === 0) continue;

        matchedNoteCount++;
        let updated = note;
        for (const tagName of matchedTagNames) {
          const tag = getOrCreateTag(tagName);
          if (!updated.tags.some((existingTag) => existingTag.name === tag.name)) {
            updated = { ...updated, tags: [...updated.tags, tag] };
            appliedTagCount++;
          }
        }
        updated = { ...updated, archived: true, updated_at: now() };
        notes.set(note.id, updated);
        archivedNoteCount++;
      }

      return Promise.resolve({ matchedNoteCount, archivedNoteCount, appliedTagCount });
    },

    async getAppSettings(): Promise<AppSettings> {
      return Promise.resolve(appSettings);
    },

    async updateAppSettings(input: UpdateAppSettingsInput): Promise<AppSettings> {
      appSettings = {
        extensionTitleMaxLength: input.extensionTitleMaxLength === undefined
          ? appSettings.extensionTitleMaxLength
          : normalizeExtensionTitleMaxLength(input.extensionTitleMaxLength),
        extensionBadgeEnabled: input.extensionBadgeEnabled ?? appSettings.extensionBadgeEnabled,
        linkPreviewFetchEnabled: input.linkPreviewFetchEnabled ?? appSettings.linkPreviewFetchEnabled,
        linkPreviewDisplayEnabled: input.linkPreviewDisplayEnabled ?? appSettings.linkPreviewDisplayEnabled,
      };
      return Promise.resolve(appSettings);
    },

    storeMedia(): Promise<never> {
      return Promise.reject(new Error('storeMedia not implemented in mock'));
    },

    getMedia(): Promise<never> {
      return Promise.reject(new Error('getMedia not implemented in mock'));
    },

    deleteMedia(): Promise<never> {
      return Promise.reject(new Error('deleteMedia not implemented in mock'));
    },

    getMediaForNote(): Promise<never> {
      return Promise.reject(new Error('getMediaForNote not implemented in mock'));
    },

    async getLinkPreview(url: string): Promise<LinkPreview | null> {
      return Promise.resolve(linkPreviews.get(url) ?? null);
    },

    async upsertLinkPreview(input): Promise<LinkPreview> {
      const timestamp = now();
      const preview: LinkPreview = {
        url: input.url,
        image_url: input.image_url,
        status: input.status,
        fetched_at: timestamp,
        updated_at: timestamp,
      };
      linkPreviews.set(input.url, preview);
      return Promise.resolve(preview);
    },
  };
}
