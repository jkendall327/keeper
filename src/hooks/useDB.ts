import { useState, useCallback, use } from 'react';
import { getDB } from '../db/db-client.ts';
import type { NoteWithTags, CreateNoteInput, UpdateNoteInput } from '../db/types.ts';

const initialLoad: Promise<NoteWithTags[]> = getDB().getAllNotes();

export function useDB() {
  const initial = use(initialLoad);
  const [notes, setNotes] = useState<NoteWithTags[]>(initial);

  const refresh = useCallback(async () => {
    const all = await getDB().getAllNotes();
    setNotes(all);
  }, []);

  const createNote = useCallback(
    async (input: CreateNoteInput) => {
      await getDB().createNote(input);
      await refresh();
    },
    [refresh],
  );

  const updateNote = useCallback(
    async (input: UpdateNoteInput) => {
      await getDB().updateNote(input);
      await refresh();
    },
    [refresh],
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await getDB().deleteNote(id);
      await refresh();
    },
    [refresh],
  );

  return { notes, refresh, createNote, updateNote, deleteNote };
}
