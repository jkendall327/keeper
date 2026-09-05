import { useCallback, useMemo, useRef, type RefObject } from 'react';
import { useQuickCaptureShortcut, useSearchFocusShortcut } from '../hooks/useAppShortcuts.ts';
import { useKeeperRouteState } from '../hooks/useKeeperRouteState.ts';
import { useNoteCommands } from '../hooks/useNoteCommands.ts';
import { useNoteMutations, useTags } from '../hooks/useKeeperQuery.ts';
import { Icon } from './Icon.tsx';
import { NoteGrid } from './NoteGrid.tsx';
import { NoteModalHost, type NoteModalHostHandle } from './NoteModalHost.tsx';
import { QuickAdd } from './QuickAdd.tsx';
import type { CreateNoteInput, NoteId, NoteWithTags, Reminder, Tag } from '../db/types.ts';
import styles from './NotesPanel.module.css';

interface NotesPanelProps {
  searchInputRef: RefObject<HTMLInputElement | null>;
  displayedNotes: NoteWithTags[];
  remindersByNoteId: ReadonlyMap<NoteId, Reminder>;
  selectedNoteIds: Set<NoteId>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<NoteId>>>;
  autoApplyActiveTag: boolean;
  isMobile: boolean;
  linkPreviewDisplayEnabled: boolean;
  quickAddAutofocusEnabled: boolean;
  advancedModeEnabled: boolean;
  showSettings: boolean;
}

export function NotesPanel({
  searchInputRef,
  displayedNotes,
  remindersByNoteId,
  selectedNoteIds,
  setSelectedNoteIds,
  autoApplyActiveTag,
  isMobile,
  linkPreviewDisplayEnabled,
  quickAddAutofocusEnabled,
  advancedModeEnabled,
  showSettings,
}: NotesPanelProps) {
  const quickAddRef = useRef<HTMLTextAreaElement>(null);
  const noteModalRef = useRef<NoteModalHostHandle>(null);
  const { activeFilter, navigateToFilter, searchQuery, setSearchQuery } = useKeeperRouteState();
  const { data: allTags } = useTags();
  const { createNote } = useNoteMutations();
  useSearchFocusShortcut(searchInputRef);

  const clearSelection = useCallback(() => {
    setSelectedNoteIds(new Set());
  }, [setSelectedNoteIds]);

  const isNoteModalOpen = useCallback(
    () => noteModalRef.current?.isOpen() ?? false,
    [],
  );

  useQuickCaptureShortcut({
    clearSelection,
    quickAddRef,
    searchInputRef,
    isNoteModalOpen,
    navigateToFilter,
    setSearchQuery,
    showSettings,
  });

  const handleBulkSelect = useCallback((ids: Set<NoteId>) => {
    setSelectedNoteIds(ids);
  }, [setSelectedNoteIds]);

  const activeTag = activeFilter.type === 'tag' && activeFilter.tagId !== null
    ? allTags.find((tag) => tag.id === activeFilter.tagId)
    : undefined;
  const isTrashView = activeFilter.type === 'trash';
  const isRemindersView = activeFilter.type === 'reminders';
  const noteCommands = useNoteCommands({ isTrashView });

  const handleCreateNote = useCallback(async (input: CreateNoteInput) => {
    if (autoApplyActiveTag && activeTag !== undefined) {
      await createNote({ ...input, initialTagNames: [activeTag.name] });
      return;
    }
    await createNote(input);
  }, [activeTag, autoApplyActiveTag, createNote]);

  const handleNoteSelect = useCallback((note: NoteWithTags) => {
    noteModalRef.current?.open(note.id);
  }, []);

  const handleTagSelect = (tag: Tag) => {
    clearSelection();
    navigateToFilter({ type: 'tag', tagId: tag.id, tagName: tag.name }, true);
  };
  const preserveOrder = activeFilter.type === 'duplicates' || isRemindersView;
  const orderedNotes = preserveOrder ? displayedNotes : [
    ...displayedNotes.filter((note) => note.pinned && !note.archived),
    ...displayedNotes.filter((note) => !note.pinned && !note.archived),
    ...displayedNotes.filter((note) => note.archived),
  ];

  const topContent = useMemo(() => (
    <>
      {searchQuery.trim() !== '' && (
        <p className={styles.searchResultCount}>
          {displayedNotes.length === 0
            ? 'No results found'
            : `${String(displayedNotes.length)} result${displayedNotes.length === 1 ? '' : 's'}`}
        </p>
      )}
      {isRemindersView ? (
        <div className={styles.remindersHeader}>
          <h2>Reminders</h2>
          <p>Due reminders appear first. Opening this view marks them as read.</p>
        </div>
      ) : (
        <QuickAdd
          ref={quickAddRef}
          autoFocus={quickAddAutofocusEnabled}
          onCreate={handleCreateNote}
        />
      )}
    </>
  ), [displayedNotes.length, handleCreateNote, isRemindersView, quickAddAutofocusEnabled, searchQuery]);

  return (
    <>
      <NoteGrid
        notes={displayedNotes}
        searchQuery={searchQuery}
        onTagSelect={handleTagSelect}
        remindersByNoteId={remindersByNoteId}
        allTags={allTags}
        onSelect={handleNoteSelect}
        noteCommands={noteCommands}
        selectedNoteIds={selectedNoteIds}
        onBulkSelect={handleBulkSelect}
        onClearSelection={clearSelection}
        showLinkPreviews={linkPreviewDisplayEnabled}
        isMobile={isMobile}
        isTrashView={isTrashView}
        preserveOrder={activeFilter.type === 'duplicates' || isRemindersView}
        topContent={topContent}
      />
      {displayedNotes.length === 0 && searchQuery.trim() === '' && activeFilter.type === 'all' && (
        <div className={styles.emptyState} data-testid="notes-empty-state">
          <Icon name="sticky_note_2" size={48} />
          <p className={styles.emptyStateText}>No notes yet</p>
          <p className={styles.emptyStateHint}>Start typing above to capture a note</p>
        </div>
      )}
      {displayedNotes.length === 0 && searchQuery.trim() === '' && isRemindersView && (
        <div className={styles.emptyState} data-testid="reminders-empty-state">
          <Icon name="notifications_none" size={48} />
          <p className={styles.emptyStateText}>No reminders</p>
          <p className={styles.emptyStateHint}>Open a note to add one</p>
        </div>
      )}
      <NoteModalHost
        ref={noteModalRef}
        displayedNotes={orderedNotes}
        remindersByNoteId={remindersByNoteId}
        allTags={allTags}
        noteCommands={noteCommands}
        showDebugDetails={advancedModeEnabled}
        showLinkPreviews={linkPreviewDisplayEnabled}
        isTrashView={isTrashView}
      />
    </>
  );
}
