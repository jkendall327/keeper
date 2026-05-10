import type { NoteId, NoteWithTags, UpdateNoteInput } from '../db/types.ts';

export interface NoteCommands {
  update: (input: UpdateNoteInput) => Promise<void>;
  delete: (id: NoteId) => Promise<unknown>;
  togglePin: (id: NoteId) => Promise<void>;
  archiveOrRestore: (id: NoteId) => Promise<void>;
  addTag: (noteId: NoteId, tagName: string) => Promise<void>;
  removeTag: (noteId: NoteId, tagName: string) => Promise<void>;
}

interface BuildNoteCommandsOptions {
  isTrashView: boolean;
  updateNote: (input: UpdateNoteInput) => Promise<NoteWithTags>;
  deleteNote: (id: NoteId) => Promise<void>;
  togglePinNote: (id: NoteId) => Promise<NoteWithTags>;
  toggleArchiveNote: (id: NoteId) => Promise<NoteWithTags>;
  trashNote: (id: NoteId) => Promise<void>;
  restoreNote: (id: NoteId) => Promise<void>;
  addTag: (noteId: NoteId, tagName: string) => Promise<NoteWithTags>;
  removeTag: (noteId: NoteId, tagName: string) => Promise<NoteWithTags>;
}

export function buildNoteCommands({
  isTrashView,
  updateNote,
  deleteNote,
  togglePinNote,
  toggleArchiveNote,
  trashNote,
  restoreNote,
  addTag,
  removeTag,
}: BuildNoteCommandsOptions): NoteCommands {
  return {
    update: async (input) => { await updateNote(input); },
    delete: isTrashView
      ? async (id: NoteId) => {
          if (!window.confirm('Permanently delete this note? This cannot be undone.')) return false;
          await deleteNote(id);
          return true;
        }
      : trashNote,
    togglePin: async (id) => { await togglePinNote(id); },
    archiveOrRestore: async (id) => { await (isTrashView ? restoreNote(id) : toggleArchiveNote(id)); },
    addTag: async (noteId, tagName) => { await addTag(noteId, tagName); },
    removeTag: async (noteId, tagName) => { await removeTag(noteId, tagName); },
  };
}
