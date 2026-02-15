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

  const deleteNotes = useCallback(
    async (ids: string[]) => {
      await getDB().deleteNotes(ids);
      await refresh();
    },
    [refresh],
  );

  const archiveNotes = useCallback(
    async (ids: string[]) => {
      await getDB().archiveNotes(ids);
      await refresh();
    },
    [refresh],
  );

  const togglePinNote = useCallback(
    async (id: string) => {
      await getDB().togglePinNote(id);
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

  const renameTag = useCallback(
    async (oldName: string, newName: string) => {
      await getDB().renameTag(oldName, newName);
      await refresh();
    },
    [refresh],
  );

  const deleteTag = useCallback(
    async (tagId: number) => {
      await getDB().deleteTag(tagId);
      await refresh();
    },
    [refresh],
  );

  const search = useCallback(async (query: string) => {
    return await getDB().search(query);
  }, []);

  const toggleArchiveNote = useCallback(
    async (id: string) => {
      await getDB().toggleArchiveNote(id);
      await refresh();
    },
    [refresh],
  );

  const getArchivedNotes = useCallback(async () => {
    return await getDB().getArchivedNotes();
  }, []);

  const getUntaggedNotes = useCallback(async () => {
    return await getDB().getUntaggedNotes();
  }, []);

  const getNotesForTag = useCallback(async (tagId: number) => {
    return await getDB().getNotesForTag(tagId);
  }, []);

  const getLinkedNotes = useCallback(async () => {
    return await getDB().getLinkedNotes();
  }, []);

  return {
    notes,
    allTags,
    refresh,
    createNote,
    updateNote,
    deleteNote,
    deleteNotes,
    archiveNotes,
    togglePinNote,
    addTag,
    removeTag,
    renameTag,
    deleteTag,
    search,
    toggleArchiveNote,
    getArchivedNotes,
    getUntaggedNotes,
    getNotesForTag,
    getLinkedNotes,
  };
}
