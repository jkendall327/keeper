import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuickCaptureShortcut, useSearchFocusShortcut } from '../hooks/useAppShortcuts.ts';
import { Icon } from './Icon.tsx';
import { NoteGrid } from './NoteGrid.tsx';
import { NoteModal } from './NoteModal.tsx';
import { QuickAdd } from './QuickAdd.tsx';
import { SearchBar } from './SearchBar.tsx';
import type { FilterType } from './Sidebar.tsx';
import type { NoteCommands } from './note-commands.ts';
import type { CreateNoteInput, NoteId, NoteWithTags } from '../db/types.ts';
import type { useDB } from '../hooks/useDB.ts';
import styles from './NotesPanel.module.css';

interface NotesPanelProps {
  allTags: ReturnType<typeof useDB>['allTags'];
  notes: NoteWithTags[];
  createNote: ReturnType<typeof useDB>['createNote'];
  updateNote: ReturnType<typeof useDB>['updateNote'];
  deleteNote: ReturnType<typeof useDB>['deleteNote'];
  togglePinNote: ReturnType<typeof useDB>['togglePinNote'];
  addTag: ReturnType<typeof useDB>['addTag'];
  removeTag: ReturnType<typeof useDB>['removeTag'];
  toggleArchiveNote: ReturnType<typeof useDB>['toggleArchiveNote'];
  trashNote: ReturnType<typeof useDB>['trashNote'];
  restoreNote: ReturnType<typeof useDB>['restoreNote'];
  activeFilter: FilterType;
  setActiveFilter: React.Dispatch<React.SetStateAction<FilterType>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  displayedNotes: NoteWithTags[];
  selectedNoteIds: Set<NoteId>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<NoteId>>>;
  autoApplyActiveTag: boolean;
  linkPreviewDisplayEnabled: boolean;
  popularTagSuggestionsEnabled: boolean;
  popularTagSuggestionLimit: number;
  showSettings: boolean;
}

export function NotesPanel({
  allTags,
  notes,
  createNote,
  updateNote,
  deleteNote,
  togglePinNote,
  addTag,
  removeTag,
  toggleArchiveNote,
  trashNote,
  restoreNote,
  activeFilter,
  setActiveFilter,
  searchQuery,
  setSearchQuery,
  displayedNotes,
  selectedNoteIds,
  setSelectedNoteIds,
  autoApplyActiveTag,
  linkPreviewDisplayEnabled,
  popularTagSuggestionsEnabled,
  popularTagSuggestionLimit,
  showSettings,
}: NotesPanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quickAddRef = useRef<HTMLTextAreaElement>(null);
  useSearchFocusShortcut(searchInputRef);

  const [selectedNote, setSelectedNote] = useState<NoteWithTags | null>(null);

  // Keep selectedNote in sync with latest data from displayed notes
  // (using displayedNotes so archived notes are findable in archive view)
  const currentNote = selectedNote !== null
    ? displayedNotes.find((n) => n.id === selectedNote.id) ?? null
    : null;

  const clearSelection = useCallback(() => {
    setSelectedNoteIds(new Set());
  }, [setSelectedNoteIds]);

  useQuickCaptureShortcut({
    clearSelection,
    quickAddRef,
    searchInputRef,
    selectedNote,
    setActiveFilter,
    setSearchQuery,
    showSettings,
  });

  const handleBulkSelect = useCallback((ids: Set<NoteId>) => {
    setSelectedNoteIds(ids);
  }, [setSelectedNoteIds]);

  const activeTag = activeFilter.type === 'tag'
    ? allTags.find((tag) => tag.id === activeFilter.tagId)
    : undefined;
  const isTrashView = activeFilter.type === 'trash';

  const noteCommands = useMemo<NoteCommands>(() => ({
    update: updateNote,
    delete: isTrashView
      ? async (id: NoteId) => {
          if (!window.confirm('Permanently delete this note? This cannot be undone.')) return false;
          await deleteNote(id);
          return true;
        }
      : trashNote,
    togglePin: togglePinNote,
    archiveOrRestore: isTrashView ? restoreNote : toggleArchiveNote,
    addTag,
    removeTag,
  }), [
    addTag,
    deleteNote,
    isTrashView,
    removeTag,
    restoreNote,
    toggleArchiveNote,
    togglePinNote,
    trashNote,
    updateNote,
  ]);

  const handleCreateNote = useCallback(async (input: CreateNoteInput) => {
    const note = await createNote(input);
    if (autoApplyActiveTag && activeTag !== undefined) {
      await addTag(note.id, activeTag.name);
    }
  }, [activeTag, addTag, autoApplyActiveTag, createNote]);

  return (
    <>
      <SearchBar ref={searchInputRef} value={searchQuery} onChange={setSearchQuery} />
      {searchQuery.trim() !== '' && (
        <p className={`${styles.searchResultCount} search-result-count`}>
          {displayedNotes.length === 0
            ? 'No results found'
            : `${String(displayedNotes.length)} result${displayedNotes.length === 1 ? '' : 's'}`}
        </p>
      )}
      <QuickAdd ref={quickAddRef} onCreate={handleCreateNote} />
      {displayedNotes.length === 0 && searchQuery.trim() === '' && activeFilter.type === 'all' && (
        <div className={`${styles.emptyState} empty-state`} data-testid="notes-empty-state">
          <Icon name="sticky_note_2" size={48} />
          <p className={`${styles.emptyStateText} empty-state-text`}>No notes yet</p>
          <p className={`${styles.emptyStateHint} empty-state-hint`}>Start typing above to capture a note</p>
        </div>
      )}
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
      />
      {currentNote !== null && (
        <NoteModal
          note={currentNote}
          allTags={allTags}
          allNotes={notes}
          noteCommands={noteCommands}
          showLinkPreviews={linkPreviewDisplayEnabled}
          popularTagSuggestionsEnabled={popularTagSuggestionsEnabled}
          popularTagSuggestionLimit={popularTagSuggestionLimit}
          isTrashView={isTrashView}
          onClose={() => { setSelectedNote(null); }}
        />
      )}
    </>
  );
}
