import { useEffect, useState } from 'react';
import type { FilterType } from '../components/Sidebar.tsx';
import type { NoteWithTags } from '../db/types.ts';
import type { useDB } from './useDB.ts';

type DB = ReturnType<typeof useDB>;
const EMPTY_NOTES: NoteWithTags[] = [];

interface UseDisplayedNotesOptions {
  activeFilter: FilterType;
  dbNotes: NoteWithTags[];
  getArchivedNotes: DB['getArchivedNotes'];
  getLinkedNotes: DB['getLinkedNotes'];
  getNotesForTag: DB['getNotesForTag'];
  getTrashedNotes: DB['getTrashedNotes'];
  getUntaggedNotes: DB['getUntaggedNotes'];
  search: DB['search'];
  searchQuery: string;
}

export function useDisplayedNotes({
  activeFilter,
  dbNotes,
  getArchivedNotes,
  getLinkedNotes,
  getNotesForTag,
  getTrashedNotes,
  getUntaggedNotes,
  search,
  searchQuery,
}: UseDisplayedNotesOptions) {
  const trimmedSearchQuery = searchQuery.trim();
  const asyncRequestKey = getAsyncRequestKey(activeFilter, trimmedSearchQuery);
  const [asyncNotesState, setAsyncNotesState] = useState<{
    key: string;
    sourceNotes: NoteWithTags[] | null;
    notes: NoteWithTags[];
  }>({ key: '', sourceNotes: null, notes: EMPTY_NOTES });

  useEffect(() => {
    if (asyncRequestKey === null) return;

    let cancelled = false;
    const loadNotes = async () => {
      let notes: NoteWithTags[];
      if (trimmedSearchQuery !== '') {
        notes = await search(trimmedSearchQuery);
      } else {
        switch (activeFilter.type) {
          case 'untagged':
            notes = await getUntaggedNotes();
            break;
          case 'archive':
            notes = await getArchivedNotes();
            break;
          case 'trash':
            notes = await getTrashedNotes();
            break;
          case 'links':
            notes = await getLinkedNotes();
            break;
          case 'tag':
            notes = await getNotesForTag(activeFilter.tagId);
            break;
          case 'all':
          case 'chat':
            return;
        }
      }
      if (cancelled) return;
      setAsyncNotesState({ key: asyncRequestKey, sourceNotes: dbNotes, notes });
    };
    void loadNotes();
    return () => {
      cancelled = true;
    };
  }, [
    activeFilter,
    asyncRequestKey,
    dbNotes,
    getArchivedNotes,
    getLinkedNotes,
    getNotesForTag,
    getTrashedNotes,
    getUntaggedNotes,
    search,
    trimmedSearchQuery,
  ]);

  if (trimmedSearchQuery === '') {
    switch (activeFilter.type) {
      case 'all':
        return dbNotes;
      case 'chat':
        return EMPTY_NOTES;
      case 'untagged':
      case 'archive':
      case 'trash':
      case 'links':
      case 'tag':
        break;
    }
  }

  return asyncRequestKey !== null &&
    asyncNotesState.key === asyncRequestKey &&
    asyncNotesState.sourceNotes === dbNotes
    ? asyncNotesState.notes
    : EMPTY_NOTES;
}

function getAsyncRequestKey(activeFilter: FilterType, searchQuery: string) {
  if (searchQuery !== '') return `search:${searchQuery}`;

  switch (activeFilter.type) {
    case 'all':
    case 'chat':
      return null;
    case 'tag':
      return `tag:${String(activeFilter.tagId)}`;
    case 'untagged':
    case 'archive':
    case 'trash':
    case 'links':
      return activeFilter.type;
  }
}
