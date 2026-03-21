import { useState, useCallback, useEffect, use } from 'react';
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

  // Listen for server-sent events so external changes (e.g. browser extension)
  // automatically refresh the UI without a manual page reload.
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('refresh', () => { void refresh(); });
    return () => { es.close(); };
  }, [refresh]);

  const mutate = useCallback(
    async (fn: () => Promise<unknown>) => { await fn(); await refresh(); },
    [refresh],
  );

  const createNote = useCallback((input: CreateNoteInput) => mutate(() => getDB().createNote(input)), [mutate]);
  const updateNote = useCallback((input: UpdateNoteInput) => mutate(() => getDB().updateNote(input)), [mutate]);
  const deleteNote = useCallback((id: string) => mutate(() => getDB().deleteNote(id)), [mutate]);
  const deleteNotes = useCallback((ids: string[]) => mutate(() => getDB().deleteNotes(ids)), [mutate]);
  const archiveNotes = useCallback((ids: string[]) => mutate(() => getDB().archiveNotes(ids)), [mutate]);
  const togglePinNote = useCallback((id: string) => mutate(() => getDB().togglePinNote(id)), [mutate]);
  const addTag = useCallback((noteId: string, tagName: string) => mutate(() => getDB().addTag(noteId, tagName)), [mutate]);
  const removeTag = useCallback((noteId: string, tagName: string) => mutate(() => getDB().removeTag(noteId, tagName)), [mutate]);
  const renameTag = useCallback((oldName: string, newName: string) => mutate(() => getDB().renameTag(oldName, newName)), [mutate]);
  const updateTagIcon = useCallback((tagId: number, icon: string | null) => mutate(() => getDB().updateTagIcon(tagId, icon)), [mutate]);
  const deleteTag = useCallback((tagId: number) => mutate(() => getDB().deleteTag(tagId)), [mutate]);
  const trashNote = useCallback((id: string) => mutate(() => getDB().trashNote(id)), [mutate]);
  const trashNotes = useCallback((ids: string[]) => mutate(() => getDB().trashNotes(ids)), [mutate]);
  const restoreNote = useCallback((id: string) => mutate(() => getDB().restoreNote(id)), [mutate]);
  const restoreNotes = useCallback((ids: string[]) => mutate(() => getDB().restoreNotes(ids)), [mutate]);
  const addTagToNotes = useCallback((noteIds: string[], tagName: string) => mutate(() => getDB().addTagToNotes(noteIds, tagName)), [mutate]);
  const removeTagFromNotes = useCallback((noteIds: string[], tagName: string) => mutate(() => getDB().removeTagFromNotes(noteIds, tagName)), [mutate]);
  const toggleArchiveNote = useCallback((id: string) => mutate(() => getDB().toggleArchiveNote(id)), [mutate]);

  const search = useCallback((query: string) => getDB().search(query), []);
  const getTrashedNotes = useCallback(() => getDB().getTrashedNotes(), []);
  const getArchivedNotes = useCallback(() => getDB().getArchivedNotes(), []);
  const getUntaggedNotes = useCallback(() => getDB().getUntaggedNotes(), []);
  const getNotesForTag = useCallback((tagId: number) => getDB().getNotesForTag(tagId), []);
  const getLinkedNotes = useCallback(() => getDB().getLinkedNotes(), []);

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
    addTagToNotes,
    removeTagFromNotes,
    renameTag,
    updateTagIcon,
    deleteTag,
    search,
    trashNote,
    trashNotes,
    restoreNote,
    restoreNotes,
    getTrashedNotes,
    toggleArchiveNote,
    getArchivedNotes,
    getUntaggedNotes,
    getNotesForTag,
    getLinkedNotes,
  };
}
