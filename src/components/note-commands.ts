import type { NoteId, UpdateNoteInput } from '../db/types.ts';

export interface NoteCommands {
  update: (input: UpdateNoteInput) => Promise<void>;
  delete: (id: NoteId) => Promise<unknown>;
  togglePin: (id: NoteId) => Promise<void>;
  archiveOrRestore: (id: NoteId) => Promise<void>;
  addTag: (noteId: NoteId, tagName: string) => Promise<void>;
  removeTag: (noteId: NoteId, tagName: string) => Promise<void>;
}
