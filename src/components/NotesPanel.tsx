import { useRef, useState, type RefObject } from 'react';
import { useQuickCaptureShortcut, useSearchFocusShortcut } from '../hooks/useAppShortcuts.ts';
import { useKeeperRouteState } from '../hooks/useKeeperRouteState.ts';
import { useNoteCommands } from '../hooks/useNoteCommands.ts';
import { useNoteMutations, useTags } from '../hooks/useKeeperQuery.ts';
import { Icon } from './Icon.tsx';
import { NoteGrid } from './NoteGrid.tsx';
import { NoteModal } from './NoteModal.tsx';
import { QuickAdd } from './QuickAdd.tsx';
import type { CreateNoteInput, NoteId, NoteWithTags } from '../db/types.ts';
import styles from './NotesPanel.module.css';

interface NotesPanelProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  displayedNotes: NoteWithTags[];
  selectedNoteIds: Set<NoteId>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<NoteId>>>;
  autoApplyActiveTag: boolean;
  linkPreviewDisplayEnabled: boolean;
  quickAddAutofocusEnabled: boolean;
  showSettings: boolean;
}

export function NotesPanel({
  searchInputRef,
  displayedNotes,
  selectedNoteIds,
  setSelectedNoteIds,
  autoApplyActiveTag,
  linkPreviewDisplayEnabled,
  quickAddAutofocusEnabled,
  showSettings,
}: NotesPanelProps) {
  const quickAddRef = useRef<HTMLTextAreaElement>(null);
  const { activeFilter, navigateToFilter, searchQuery, setSearchQuery } = useKeeperRouteState();
  const { data: allTags } = useTags();
  const { createNote } = useNoteMutations();
  useSearchFocusShortcut(searchInputRef);

  const [selectedNote, setSelectedNote] = useState<NoteWithTags | null>(null);

  // Keep selectedNote in sync with latest data from displayed notes
  // (using displayedNotes so archived notes are findable in archive view)
  const currentNote = selectedNote !== null
    ? displayedNotes.find((n) => n.id === selectedNote.id) ?? null
    : null;

  const clearSelection = () => {
    setSelectedNoteIds(new Set());
  };

  useQuickCaptureShortcut({
    clearSelection,
    quickAddRef,
    searchInputRef,
    selectedNote,
    navigateToFilter,
    setSearchQuery,
    showSettings,
  });

  const handleBulkSelect = (ids: Set<NoteId>) => {
    setSelectedNoteIds(ids);
  };

  const activeTag = activeFilter.type === 'tag'
    ? allTags.find((tag) => tag.id === activeFilter.tagId)
    : undefined;
  const isTrashView = activeFilter.type === 'trash';
  const noteCommands = useNoteCommands({ isTrashView });

  const handleCreateNote = async (input: CreateNoteInput) => {
    if (autoApplyActiveTag && activeTag !== undefined) {
      await createNote({ ...input, initialTagNames: [activeTag.name] });
      return;
    }
    await createNote(input);
  };

  return (
    <>
      <NoteGrid
        notes={displayedNotes}
        allTags={allTags}
        onSelect={setSelectedNote}
        noteCommands={noteCommands}
        selectedNoteIds={selectedNoteIds}
        onBulkSelect={handleBulkSelect}
        onClearSelection={clearSelection}
        showLinkPreviews={linkPreviewDisplayEnabled}
        isTrashView={isTrashView}
        topContent={(
          <>
            {searchQuery.trim() !== '' && (
              <p className={styles.searchResultCount}>
                {displayedNotes.length === 0
                  ? 'No results found'
                  : `${String(displayedNotes.length)} result${displayedNotes.length === 1 ? '' : 's'}`}
              </p>
            )}
            <QuickAdd
              ref={quickAddRef}
              autoFocus={quickAddAutofocusEnabled}
              onCreate={handleCreateNote}
            />
          </>
        )}
      />
      {displayedNotes.length === 0 && searchQuery.trim() === '' && activeFilter.type === 'all' && (
        <div className={styles.emptyState} data-testid="notes-empty-state">
          <Icon name="sticky_note_2" size={48} />
          <p className={styles.emptyStateText}>No notes yet</p>
          <p className={styles.emptyStateHint}>Start typing above to capture a note</p>
        </div>
      )}
      {currentNote !== null && (
        <NoteModal
          note={currentNote}
          allTags={allTags}
          noteCommands={noteCommands}
          showLinkPreviews={linkPreviewDisplayEnabled}
          isTrashView={isTrashView}
          onClose={() => { setSelectedNote(null); }}
        />
      )}
    </>
  );
}
