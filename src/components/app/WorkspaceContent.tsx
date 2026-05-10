import type { RefObject } from 'react';
import { useKeeperRouteState } from '../../hooks/useKeeperRouteState.ts';
import { ChatPanel } from '../ChatPanel.tsx';
import { NotesPanel } from '../NotesPanel.tsx';
import type { FilterType } from '../Sidebar.tsx';
import type { AppSettings, NoteId, NoteWithTags } from '../../db/types.ts';

export interface NoteViewState {
  searchInputRef: RefObject<HTMLInputElement | null>;
  displayedNotes: NoteWithTags[];
  selectedNoteIds: Set<NoteId>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<NoteId>>>;
}

export interface WorkspaceSettings extends Pick<
  AppSettings,
  | 'linkPreviewDisplayEnabled'
  | 'quickAddAutofocusEnabled'
> {
  autoApplyActiveTag: boolean;
  showSettings: boolean;
}

interface WorkspaceContentProps {
  settings: WorkspaceSettings;
  view: NoteViewState;
}

function filterKey(filter: FilterType) {
  return filter.type === 'tag' ? `tag:${String(filter.tagId)}` : filter.type;
}

export function WorkspaceContent({
  settings,
  view,
}: WorkspaceContentProps) {
  const { activeFilter } = useKeeperRouteState();

  if (activeFilter.type === 'chat') {
    return <ChatPanel />;
  }

  return (
    <NotesPanel
      key={filterKey(activeFilter)}
      searchInputRef={view.searchInputRef}
      displayedNotes={view.displayedNotes}
      selectedNoteIds={view.selectedNoteIds}
      setSelectedNoteIds={view.setSelectedNoteIds}
      autoApplyActiveTag={settings.autoApplyActiveTag}
      linkPreviewDisplayEnabled={settings.linkPreviewDisplayEnabled}
      quickAddAutofocusEnabled={settings.quickAddAutofocusEnabled}
      showSettings={settings.showSettings}
    />
  );
}
