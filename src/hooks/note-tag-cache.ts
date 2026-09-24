import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { NoteId, NoteWithTags, Tag } from '../db/types.ts';

export type TagChange = { add: Tag } | { remove: string };

// These collections keep their membership and order when only labels change.
// Label and untagged views must be fetched again to discover newly matching notes.
export function canPatchNoteTags(key: QueryKey): boolean {
  if (key[0] !== 'notes') return false;
  if (key[1] === 'inbox' || key[1] === 'detail' || key[1] === 'search') return true;
  return key[1] === 'view' && ['archive', 'trash', 'links', 'duplicates'].includes(String(key[2]));
}

export async function patchCachedNoteTags(
  queryClient: QueryClient,
  noteIds: NoteId[],
  change: TagChange,
): Promise<void> {
  const ids = new Set(noteIds);
  const filters = { predicate: (query: { queryKey: QueryKey }) => canPatchNoteTags(query.queryKey) };
  const needsRefresh = new Set(queryClient.getQueryCache().findAll(filters)
    .filter((query) => query.state.isInvalidated || query.state.fetchStatus === 'fetching')
    .map((query) => query.queryHash));
  // An older response must not overwrite the completed label operation.
  await queryClient.cancelQueries(filters);

  const patchNote = (note: NoteWithTags): NoteWithTags => {
    if (!ids.has(note.id)) return note;
    if ('add' in change) {
      if (note.tags.some((tag) => tag.id === change.add.id)) return note;
      return { ...note, tags: [...note.tags, change.add] };
    }
    const tags = note.tags.filter((tag) => tag.name !== change.remove);
    return tags.length === note.tags.length ? note : { ...note, tags };
  };

  queryClient.setQueriesData<NoteWithTags[] | NoteWithTags | null>(filters, (cached) => {
    if (cached === undefined || cached === null) return cached;
    return Array.isArray(cached) ? cached.map(patchNote) : patchNote(cached);
  });
  // Preserve refreshes and stale markers from other operations (for example
  // creating a note), including collections that are currently inactive.
  await queryClient.invalidateQueries({ predicate: (query) => needsRefresh.has(query.queryHash) });
}
