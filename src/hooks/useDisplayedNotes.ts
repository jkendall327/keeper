import { useEffect, useState } from 'react';
import type { FilterType } from '../components/Sidebar.tsx';
import type { NoteWithTags } from '../db/types.ts';
import type { useDB } from './useDB.ts';

type DB = ReturnType<typeof useDB>;

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
  const [displayedNotes, setDisplayedNotes] = useState<NoteWithTags[]>(dbNotes);

  useEffect(() => {
    let cancelled = false;
    const loadNotes = async () => {
      let notes: NoteWithTags[];
      if (searchQuery.trim() !== '') {
        notes = await search(searchQuery);
      } else {
        switch (activeFilter.type) {
          case 'all':
            notes = dbNotes;
            break;
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
          case 'chat':
            notes = [];
            break;
        }
      }
      if (cancelled) return;
      setDisplayedNotes(notes);
    };
    void loadNotes();
    return () => {
      cancelled = true;
    };
  }, [
    activeFilter,
    dbNotes,
    getArchivedNotes,
    getLinkedNotes,
    getNotesForTag,
    getTrashedNotes,
    getUntaggedNotes,
    search,
    searchQuery,
  ]);

  return displayedNotes;
}
