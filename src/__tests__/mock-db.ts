import type { KeeperDB, NoteWithTags, Tag, CreateNoteInput, UpdateNoteInput, SearchResult } from '../db/types';

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
  const notes = new Map<string, NoteWithTags>();
  const tags = new Map<number, Tag>();

  const generateId = () => `n${String(noteId++)}`;
  const generateTagId = () => tagId++;
  const now = () => new Date().toISOString();

  const reset = () => {
    noteId = 1;
    tagId = 1;
    notes.clear();
    tags.clear();
  };

  return {
    reset,

    async createNote(input: CreateNoteInput): Promise<NoteWithTags> {
      const id = generateId();
      const note: NoteWithTags = {
        id,
        title: input.title ?? '',
        body: input.body,
        has_links: false,
        pinned: false,
        archived: false,
        created_at: now(),
        updated_at: now(),
        tags: [],
      };
      notes.set(id, note);
      return Promise.resolve(note);
    },

    async getNote(id: string): Promise<NoteWithTags | null> {
      return Promise.resolve(notes.get(id) ?? null);
    },

    async getAllNotes(): Promise<NoteWithTags[]> {
      return Promise.resolve(Array.from(notes.values()));
    },

    async updateNote(input: UpdateNoteInput): Promise<NoteWithTags> {
      const note = notes.get(input.id);
      if (!note) throw new Error(`Note ${input.id} not found`);

      const updated = {
        ...note,
        title: input.title ?? note.title,
        body: input.body ?? note.body,
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

    async archiveNotes(ids: string[]): Promise<void> {
      for (const id of ids) {
        const note = notes.get(id);
        if (note) {
          notes.set(id, { ...note, archived: true });
        }
      }
      return Promise.resolve();
    },

    async togglePinNote(id: string): Promise<NoteWithTags> {
      const note = notes.get(id);
      if (!note) throw new Error(`Note ${id} not found`);

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
      if (!note) throw new Error(`Note ${id} not found`);

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
      if (!note) throw new Error(`Note ${noteId} not found`);

      // Get or create tag
      let tag = Array.from(tags.values()).find(t => t.name === tagName);
      if (!tag) {
        tag = { id: generateTagId(), name: tagName };
        tags.set(tag.id, tag);
      }

      // Add to note if not already present
      if (!note.tags.some(t => t.name === tagName)) {
        note.tags = [...note.tags, tag];
      }

      return Promise.resolve(note);
    },

    async removeTag(noteId: string, tagName: string): Promise<NoteWithTags> {
      const note = notes.get(noteId);
      if (!note) throw new Error(`Note ${noteId} not found`);

      note.tags = note.tags.filter(t => t.name !== tagName);
      return Promise.resolve(note);
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
      if (tag) {
        tag.name = newName;
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

    async search(_query: string): Promise<SearchResult[]> {
      // Simple mock: return empty for now
      return Promise.resolve([]);
    },

    async getUntaggedNotes(): Promise<NoteWithTags[]> {
      return Promise.resolve(Array.from(notes.values()).filter(n => n.tags.length === 0));
    },

    async getLinkedNotes(): Promise<NoteWithTags[]> {
      return Promise.resolve(Array.from(notes.values()).filter(n => n.has_links));
    },

    async getNotesForTag(tagId: number): Promise<NoteWithTags[]> {
      return Promise.resolve(Array.from(notes.values()).filter(n => n.tags.some(t => t.id === tagId)));
    },

    async getArchivedNotes(): Promise<NoteWithTags[]> {
      return Promise.resolve(Array.from(notes.values()).filter(n => n.archived));
    },

    async storeMedia(): Promise<never> {
      throw new Error('storeMedia not implemented in mock');
    },

    async getMedia(): Promise<never> {
      throw new Error('getMedia not implemented in mock');
    },

    async deleteMedia(): Promise<never> {
      throw new Error('deleteMedia not implemented in mock');
    },

    async getMediaForNote(): Promise<never> {
      throw new Error('getMediaForNote not implemented in mock');
    },
  };
}
