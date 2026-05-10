import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useKeeperServices } from '../services.ts';
import type {
  AppSettings,
  AutoTagRuleInput,
  CreateNoteInput,
  NoteId,
  NoteWithTags,
  UpdateAppSettingsInput,
  UpdateAutoTagRuleInput,
  UpdateNoteInput,
} from '../db/types.ts';
import type { FilterType } from '../components/Sidebar.tsx';

const EMPTY_NOTES: NoteWithTags[] = [];

export const keeperKeys = {
  notes: ['notes'] as const,
  inbox: ['notes', 'inbox'] as const,
  note: (id: NoteId) => ['notes', 'detail', id] as const,
  view: (name: string) => ['notes', 'view', name] as const,
  search: (query: string) => ['notes', 'search', query] as const,
  tags: ['tags'] as const,
  popularTagSuggestions: (noteId: NoteId, limit: number) => ['tags', 'popularSuggestions', noteId, limit] as const,
  settings: ['settings'] as const,
  autoTagRules: ['autoTagRules'] as const,
  mediaForNote: (noteId: NoteId) => ['media', 'note', noteId] as const,
};

export function useInboxNotes() {
  const { client } = useKeeperServices();
  return useSuspenseQuery({
    queryKey: keeperKeys.inbox,
    queryFn: ({ signal }) => client.notes.list({ signal }),
  });
}

export function useTags() {
  const { client } = useKeeperServices();
  return useSuspenseQuery({
    queryKey: keeperKeys.tags,
    queryFn: ({ signal }) => client.tags.list({ signal }),
  });
}

export function useDisplayedNotes(activeFilter: FilterType, searchQuery: string) {
  const { client } = useKeeperServices();
  const trimmedSearchQuery = searchQuery.trim();
  const inboxQuery = useInboxNotes();
  const viewKey = getViewKey(activeFilter, trimmedSearchQuery);

  const viewQuery = useQuery({
    queryKey: viewKey ?? ['notes', 'idle'],
    queryFn: ({ signal }) => {
      if (trimmedSearchQuery !== '') return client.search.notes(trimmedSearchQuery, { signal });

      switch (activeFilter.type) {
        case 'untagged':
          return client.views.untagged({ signal });
        case 'archive':
          return client.views.archived({ signal });
        case 'trash':
          return client.views.trashed({ signal });
        case 'links':
          return client.views.linked({ signal });
        case 'tag':
          return client.views.tag(activeFilter.tagId, { signal });
        case 'all':
        case 'chat':
          return Promise.resolve(EMPTY_NOTES);
      }
    },
  });

  if (trimmedSearchQuery === '') {
    if (activeFilter.type === 'all') return inboxQuery.data;
    if (activeFilter.type === 'chat') return EMPTY_NOTES;
  }
  return viewQuery.data ?? EMPTY_NOTES;
}

export function useAppSettings() {
  const { client } = useKeeperServices();
  const { data } = useSuspenseQuery({
    queryKey: keeperKeys.settings,
    queryFn: ({ signal }) => client.settings.get({ signal }),
  });

  return data;
}

export function usePopularTagSuggestions(noteId: NoteId) {
  const { client } = useKeeperServices();
  const settings = useAppSettings();
  const enabled = settings.popularTagSuggestionsEnabled;
  const limit = settings.popularTagSuggestionLimit;

  return useQuery({
    queryKey: keeperKeys.popularTagSuggestions(noteId, limit),
    queryFn: ({ signal }) => client.tags.popularSuggestions(noteId, limit, { signal }),
    enabled,
    placeholderData: [],
  });
}

export function useExtensionEvents() {
  const queryClient = useQueryClient();
  const [extensionNoteCreatedCount, setExtensionNoteCreatedCount] = useState(0);

  useEffect(() => {
    const invalidateExternalData = () => {
      void queryClient.invalidateQueries({ queryKey: keeperKeys.notes });
      void queryClient.invalidateQueries({ queryKey: keeperKeys.tags });
      void queryClient.invalidateQueries({ queryKey: keeperKeys.autoTagRules });
      void queryClient.invalidateQueries({ queryKey: keeperKeys.settings });
    };

    const events = new EventSource('/api/events');
    events.addEventListener('refresh', invalidateExternalData);
    events.addEventListener('extension-note-created', () => {
      setExtensionNoteCreatedCount((count) => count + 1);
      invalidateExternalData();
    });
    return () => { events.close(); };
  }, [queryClient]);

  return extensionNoteCreatedCount;
}

export function useNoteMutations() {
  const { client } = useKeeperServices();
  const queryClient = useQueryClient();
  const invalidateNotes = () => queryClient.invalidateQueries({ queryKey: keeperKeys.notes });
  const invalidateNotesAndTags = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keeperKeys.notes }),
      queryClient.invalidateQueries({ queryKey: keeperKeys.tags }),
    ]);
  };

  const createNote = useMutation({
    mutationFn: (input: CreateNoteInput) => client.notes.create(input),
    onSuccess: async (note) => {
      queryClient.setQueryData<NoteWithTags>(keeperKeys.note(note.id), note);
      await invalidateNotesAndTags();
    },
  });
  const updateNote = useMutation({
    mutationFn: (input: UpdateNoteInput) => client.notes.update(input),
    onSuccess: async (note) => {
      queryClient.setQueryData<NoteWithTags>(keeperKeys.note(note.id), note);
      await invalidateNotes();
    },
  });
  const deleteNote = useMutation({ mutationFn: (id: NoteId) => client.notes.delete(id), onSuccess: invalidateNotes });
  const deleteNotes = useMutation({ mutationFn: (ids: NoteId[]) => client.notes.deleteMany(ids), onSuccess: invalidateNotes });
  const archiveNotes = useMutation({ mutationFn: (ids: NoteId[]) => client.notes.archiveMany(ids), onSuccess: invalidateNotes });
  const trashNote = useMutation({ mutationFn: (id: NoteId) => client.notes.trash(id), onSuccess: invalidateNotes });
  const trashNotes = useMutation({ mutationFn: (ids: NoteId[]) => client.notes.trashMany(ids), onSuccess: invalidateNotes });
  const restoreNote = useMutation({ mutationFn: (id: NoteId) => client.notes.restore(id), onSuccess: invalidateNotes });
  const restoreNotes = useMutation({ mutationFn: (ids: NoteId[]) => client.notes.restoreMany(ids), onSuccess: invalidateNotes });
  const togglePinNote = useMutation({ mutationFn: (id: NoteId) => client.notes.togglePin(id), onSuccess: invalidateNotes });
  const toggleArchiveNote = useMutation({ mutationFn: (id: NoteId) => client.notes.toggleArchive(id), onSuccess: invalidateNotes });
  const addTag = useMutation({
    mutationFn: ({ noteId, tagName }: { noteId: NoteId; tagName: string }) => client.tags.addToNote(noteId, tagName),
    onSuccess: invalidateNotesAndTags,
  });
  const removeTag = useMutation({
    mutationFn: ({ noteId, tagName }: { noteId: NoteId; tagName: string }) => client.tags.removeFromNote(noteId, tagName),
    onSuccess: invalidateNotesAndTags,
  });
  const addTagToNotes = useMutation({
    mutationFn: ({ noteIds, tagName }: { noteIds: NoteId[]; tagName: string }) => client.tags.addToNotes(noteIds, tagName),
    onSuccess: invalidateNotesAndTags,
  });
  const removeTagFromNotes = useMutation({
    mutationFn: ({ noteIds, tagName }: { noteIds: NoteId[]; tagName: string }) => client.tags.removeFromNotes(noteIds, tagName),
    onSuccess: invalidateNotesAndTags,
  });
  const runAutoTagRules = useMutation({
    mutationFn: () => client.autoTagRules.run(),
    onSuccess: invalidateNotesAndTags,
  });

  return {
    createNote: createNote.mutateAsync,
    updateNote: updateNote.mutateAsync,
    deleteNote: deleteNote.mutateAsync,
    deleteNotes: deleteNotes.mutateAsync,
    archiveNotes: archiveNotes.mutateAsync,
    trashNote: trashNote.mutateAsync,
    trashNotes: trashNotes.mutateAsync,
    restoreNote: restoreNote.mutateAsync,
    restoreNotes: restoreNotes.mutateAsync,
    togglePinNote: togglePinNote.mutateAsync,
    toggleArchiveNote: toggleArchiveNote.mutateAsync,
    addTag: (noteId: NoteId, tagName: string) => addTag.mutateAsync({ noteId, tagName }),
    removeTag: (noteId: NoteId, tagName: string) => removeTag.mutateAsync({ noteId, tagName }),
    addTagToNotes: (noteIds: NoteId[], tagName: string) => addTagToNotes.mutateAsync({ noteIds, tagName }),
    removeTagFromNotes: (noteIds: NoteId[], tagName: string) => removeTagFromNotes.mutateAsync({ noteIds, tagName }),
    runAutoTagRules: runAutoTagRules.mutateAsync,
  };
}

export function useTagMutations() {
  const { client } = useKeeperServices();
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keeperKeys.notes }),
      queryClient.invalidateQueries({ queryKey: keeperKeys.tags }),
    ]);
  };

  const renameTag = useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) => client.tags.rename(oldName, newName),
    onSuccess: invalidate,
  });
  const updateTagIcon = useMutation({
    mutationFn: ({ tagId, icon }: { tagId: number; icon: string | null }) => client.tags.updateIcon(tagId, icon),
    onSuccess: invalidate,
  });
  const deleteTag = useMutation({
    mutationFn: (tagId: number) => client.tags.delete(tagId),
    onSuccess: invalidate,
  });

  return {
    renameTag: (oldName: string, newName: string) => renameTag.mutateAsync({ oldName, newName }),
    updateTagIcon: (tagId: number, icon: string | null) => updateTagIcon.mutateAsync({ tagId, icon }),
    deleteTag: deleteTag.mutateAsync,
  };
}

export function useAutoTagRules() {
  const { client } = useKeeperServices();
  return useQuery({
    queryKey: keeperKeys.autoTagRules,
    queryFn: ({ signal }) => client.autoTagRules.list({ signal }),
    initialData: [],
  });
}

export function useAutoTagRuleMutations() {
  const { client } = useKeeperServices();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: keeperKeys.autoTagRules });
  const createRule = useMutation({ mutationFn: (input: AutoTagRuleInput) => client.autoTagRules.create(input), onSuccess: invalidate });
  const updateRule = useMutation({ mutationFn: (input: UpdateAutoTagRuleInput) => client.autoTagRules.update(input), onSuccess: invalidate });
  const deleteRule = useMutation({ mutationFn: (id: number) => client.autoTagRules.delete(id), onSuccess: invalidate });

  return {
    createRule: createRule.mutateAsync,
    updateRule: updateRule.mutateAsync,
    deleteRule: deleteRule.mutateAsync,
  };
}

export function useUpdateAppSettings() {
  const { client } = useKeeperServices();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: UpdateAppSettingsInput) => client.settings.update(input),
    onSuccess: (settings: AppSettings) => {
      queryClient.setQueryData(keeperKeys.settings, settings);
    },
  });
  return mutation.mutateAsync;
}

export function useRefreshKeeperData() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keeperKeys.notes }),
      queryClient.invalidateQueries({ queryKey: keeperKeys.tags }),
      queryClient.invalidateQueries({ queryKey: keeperKeys.autoTagRules }),
    ]);
  };
}

function getViewKey(activeFilter: FilterType, searchQuery: string) {
  if (searchQuery !== '') return keeperKeys.search(searchQuery);

  switch (activeFilter.type) {
    case 'all':
    case 'chat':
      return null;
    case 'tag':
      return keeperKeys.view(`tag:${String(activeFilter.tagId)}`);
    case 'untagged':
    case 'archive':
    case 'trash':
    case 'links':
      return keeperKeys.view(activeFilter.type);
  }
}
