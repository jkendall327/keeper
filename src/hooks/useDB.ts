import { useState, useCallback, use } from 'react';
import { getDB } from '../db/db-client.ts';
import type { NoteWithTags, Tag, CreateNoteInput, UpdateNoteInput } from '../db/types.ts';

const initialLoad: Promise<[NoteWithTags[], Tag[]]> = Promise.all([
  getDB().getAllNotes(),
  getDB().getAllTags(),
]);

export function useDB() {
  const [initialNotes, initialTags] = use(initialLoad);
  const [notes, setNotes] = useState<NoteWithTags[]>(initialNotes);
  const [allTags, setAllTags] = useState<Tag[]>(initialTags);

  const refresh = useCallback(async () => {
    const [freshNotes, freshTags] = await Promise.all([
      getDB().getAllNotes(),
      getDB().getAllTags(),
    ]);
    setNotes(freshNotes);
    setAllTags(freshTags);
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

  const addTag = useCallback(
    async (noteId: string, tagName: string) => {
      await getDB().addTag(noteId, tagName);
      await refresh();
    },
    [refresh],
  );

  const removeTag = useCallback(
    async (noteId: string, tagName: string) => {
      await getDB().removeTag(noteId, tagName);
      await refresh();
    },
    [refresh],
  );

  return { notes, allTags, refresh, createNote, updateNote, deleteNote, addTag, removeTag };
}
