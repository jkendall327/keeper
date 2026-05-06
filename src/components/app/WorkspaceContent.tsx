import { ChatPanel } from '../ChatPanel.tsx';
import { NotesPanel } from '../NotesPanel.tsx';
import type { FilterType } from '../Sidebar.tsx';
import type { useDB } from '../../hooks/useDB.ts';
import type { AppSettings, NoteId, NoteWithTags } from '../../db/types.ts';

type DB = ReturnType<typeof useDB>;

type WorkspaceDb = Pick<
  DB,
  | 'allTags'
  | 'notes'
  | 'refresh'
  | 'createNote'
  | 'updateNote'
  | 'deleteNote'
  | 'togglePinNote'
  | 'addTag'
  | 'removeTag'
  | 'toggleArchiveNote'
  | 'trashNote'
  | 'restoreNote'
>;

export interface NoteViewState {
  activeFilter: FilterType;
  setActiveFilter: React.Dispatch<React.SetStateAction<FilterType>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
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
  db: WorkspaceDb;
  settings: WorkspaceSettings;
  view: NoteViewState;
}

function filterKey(filter: FilterType) {
  return filter.type === 'tag' ? `tag:${String(filter.tagId)}` : filter.type;
}

export function WorkspaceContent({
  db,
  settings,
  view,
}: WorkspaceContentProps) {
  if (view.activeFilter.type === 'chat') {
    return <ChatPanel refresh={db.refresh} />;
  }

  return (
    <NotesPanel
      key={filterKey(view.activeFilter)}
      allTags={db.allTags}
      notes={db.notes}
      createNote={db.createNote}
      updateNote={db.updateNote}
      deleteNote={db.deleteNote}
      togglePinNote={db.togglePinNote}
      addTag={db.addTag}
      removeTag={db.removeTag}
      toggleArchiveNote={db.toggleArchiveNote}
      trashNote={db.trashNote}
      restoreNote={db.restoreNote}
      activeFilter={view.activeFilter}
      setActiveFilter={view.setActiveFilter}
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
