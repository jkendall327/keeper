import type { UpdateNoteInput } from '../db/types.ts';

export interface NoteCommands {
  update: (input: UpdateNoteInput) => Promise<void>;
  delete: (id: string) => Promise<unknown>;
  togglePin: (id: string) => Promise<void>;
  archiveOrRestore: (id: string) => Promise<void>;
  addTag: (noteId: string, tagName: string) => Promise<void>;
  removeTag: (noteId: string, tagName: string) => Promise<void>;
}
