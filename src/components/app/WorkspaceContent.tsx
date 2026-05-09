import type { RefObject } from 'react';
import { ChatPanel } from '../ChatPanel.tsx';
import { NotesPanel } from '../NotesPanel.tsx';
import type { FilterType } from '../Sidebar.tsx';
import type { useNoteMutations } from '../../hooks/useKeeperQuery.ts';
import type { AppSettings, NoteId, NoteWithTags, Tag } from '../../db/types.ts';

export interface NoteViewState {
  activeFilter: FilterType;
  navigateToFilter: (filter: FilterType) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  displayedNotes: NoteWithTags[];
  selectedNoteIds: Set<NoteId>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<NoteId>>>;
}

export interface WorkspaceSettings extends Pick<
  AppSettings,
  'linkPreviewDisplayEnabled' | 'popularTagSuggestionsEnabled' | 'popularTagSuggestionLimit'
> {
  autoApplyActiveTag: boolean;
  showSettings: boolean;
}

interface WorkspaceContentProps {
  allTags: Tag[];
  inboxNotes: NoteWithTags[];
  noteMutations: ReturnType<typeof useNoteMutations>;
  settings: WorkspaceSettings;
  view: NoteViewState;
}

function filterKey(filter: FilterType) {
  return filter.type === 'tag' ? `tag:${String(filter.tagId)}` : filter.type;
}

export function WorkspaceContent({
  allTags,
  inboxNotes,
  noteMutations,
  settings,
  view,
}: WorkspaceContentProps) {
  if (view.activeFilter.type === 'chat') {
    return <ChatPanel />;
  }

  return (
    <NotesPanel
      key={filterKey(view.activeFilter)}
      allTags={allTags}
      notes={inboxNotes}
      createNote={noteMutations.createNote}
      updateNote={noteMutations.updateNote}
      deleteNote={noteMutations.deleteNote}
      togglePinNote={noteMutations.togglePinNote}
      addTag={noteMutations.addTag}
      removeTag={noteMutations.removeTag}
      toggleArchiveNote={noteMutations.toggleArchiveNote}
      trashNote={noteMutations.trashNote}
      restoreNote={noteMutations.restoreNote}
      activeFilter={view.activeFilter}
      navigateToFilter={view.navigateToFilter}
      searchInputRef={view.searchInputRef}
      searchQuery={view.searchQuery}
      setSearchQuery={view.setSearchQuery}
      displayedNotes={view.displayedNotes}
      selectedNoteIds={view.selectedNoteIds}
      setSelectedNoteIds={view.setSelectedNoteIds}
      autoApplyActiveTag={settings.autoApplyActiveTag}
      linkPreviewDisplayEnabled={settings.linkPreviewDisplayEnabled}
      popularTagSuggestionsEnabled={settings.popularTagSuggestionsEnabled}
      popularTagSuggestionLimit={settings.popularTagSuggestionLimit}
      showSettings={settings.showSettings}
    />
  );
}
