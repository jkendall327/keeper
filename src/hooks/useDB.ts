import { useState, useCallback, useEffect, use } from 'react';
import { useKeeperServices } from '../services.ts';
import type { KeeperDB, NoteId, NoteWithTags, Tag, CreateNoteInput, UpdateNoteInput } from '../db/types.ts';

const initialLoads = new WeakMap<KeeperDB, Promise<[NoteWithTags[], Tag[]]>>();

function loadInitialDBState(db: KeeperDB): Promise<[NoteWithTags[], Tag[]]> {
  const existingLoad = initialLoads.get(db);
  if (existingLoad !== undefined) return existingLoad;

  const load = Promise.all([
    db.getAllNotes(),
    db.getAllTags(),
  ]);
  initialLoads.set(db, load);
  return load;
}

export function useDB() {
  const { db } = useKeeperServices();
  const initialLoad = loadInitialDBState(db);
  const [initialNotes, initialTags] = use(initialLoad);
  const [notes, setNotes] = useState<NoteWithTags[]>(initialNotes);
  const [allTags, setAllTags] = useState<Tag[]>(initialTags);
  const [extensionNoteCreatedCount, setExtensionNoteCreatedCount] = useState(0);

  const refresh = useCallback(async () => {
    const [freshNotes, freshTags] = await Promise.all([
      db.getAllNotes(),
      db.getAllTags(),
    ]);
    setNotes(freshNotes);
    setAllTags(freshTags);
  }, [db]);

  // Listen for server-sent events so external changes (e.g. browser extension)
  // automatically refresh the UI without a manual page reload.
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('refresh', () => { void refresh(); });
    es.addEventListener('extension-note-created', () => {
      setExtensionNoteCreatedCount((count) => count + 1);
      void refresh();
    });
    return () => { es.close(); };
  }, [refresh]);

  const mutate = useCallback(
    async (fn: () => Promise<unknown>) => { await fn(); await refresh(); },
    [refresh],
  );

  const mutateWithResult = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      const result = await fn();
      await refresh();
      return result;
    },
    [refresh],
  );

  const createNote = useCallback((input: CreateNoteInput) => mutateWithResult(() => db.createNote(input)), [db, mutateWithResult]);
  const updateNote = useCallback((input: UpdateNoteInput) => mutate(() => db.updateNote(input)), [db, mutate]);
  const deleteNote = useCallback((id: NoteId) => mutate(() => db.deleteNote(id)), [db, mutate]);
  const deleteNotes = useCallback((ids: NoteId[]) => mutate(() => db.deleteNotes(ids)), [db, mutate]);
  const archiveNotes = useCallback((ids: NoteId[]) => mutate(() => db.archiveNotes(ids)), [db, mutate]);
  const togglePinNote = useCallback((id: NoteId) => mutate(() => db.togglePinNote(id)), [db, mutate]);
  const addTag = useCallback((noteId: NoteId, tagName: string) => mutate(() => db.addTag(noteId, tagName)), [db, mutate]);
  const removeTag = useCallback((noteId: NoteId, tagName: string) => mutate(() => db.removeTag(noteId, tagName)), [db, mutate]);
  const renameTag = useCallback((oldName: string, newName: string) => mutate(() => db.renameTag(oldName, newName)), [db, mutate]);
  const updateTagIcon = useCallback((tagId: number, icon: string | null) => mutate(() => db.updateTagIcon(tagId, icon)), [db, mutate]);
  const deleteTag = useCallback((tagId: number) => mutate(() => db.deleteTag(tagId)), [db, mutate]);
  const trashNote = useCallback((id: NoteId) => mutate(() => db.trashNote(id)), [db, mutate]);
  const trashNotes = useCallback((ids: NoteId[]) => mutate(() => db.trashNotes(ids)), [db, mutate]);
  const restoreNote = useCallback((id: NoteId) => mutate(() => db.restoreNote(id)), [db, mutate]);
  const restoreNotes = useCallback((ids: NoteId[]) => mutate(() => db.restoreNotes(ids)), [db, mutate]);
  const addTagToNotes = useCallback((noteIds: NoteId[], tagName: string) => mutate(() => db.addTagToNotes(noteIds, tagName)), [db, mutate]);
  const removeTagFromNotes = useCallback((noteIds: NoteId[], tagName: string) => mutate(() => db.removeTagFromNotes(noteIds, tagName)), [db, mutate]);
  const toggleArchiveNote = useCallback((id: NoteId) => mutate(() => db.toggleArchiveNote(id)), [db, mutate]);
  const createAutoTagRule = useCallback((input: Parameters<KeeperDB['createAutoTagRule']>[0]) => mutate(() => db.createAutoTagRule(input)), [db, mutate]);
  const updateAutoTagRule = useCallback((input: Parameters<KeeperDB['updateAutoTagRule']>[0]) => mutate(() => db.updateAutoTagRule(input)), [db, mutate]);
  const deleteAutoTagRule = useCallback((id: number) => mutate(() => db.deleteAutoTagRule(id)), [db, mutate]);
  const runAutoTagRules = useCallback(() => db.runAutoTagRules().then(async (result) => { await refresh(); return result; }), [db, refresh]);

  const search = useCallback((query: string) => db.search(query), [db]);
  const getAutoTagRules = useCallback(() => db.getAutoTagRules(), [db]);
  const getTrashedNotes = useCallback(() => db.getTrashedNotes(), [db]);
  const getArchivedNotes = useCallback(() => db.getArchivedNotes(), [db]);
  const getUntaggedNotes = useCallback(() => db.getUntaggedNotes(), [db]);
  const getNotesForTag = useCallback((tagId: number) => db.getNotesForTag(tagId), [db]);
  const getLinkedNotes = useCallback(() => db.getLinkedNotes(), [db]);

  return {
    notes,
    allTags,
    extensionNoteCreatedCount,
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
    getAutoTagRules,
    createAutoTagRule,
    updateAutoTagRule,
    deleteAutoTagRule,
    runAutoTagRules,
  };
}
