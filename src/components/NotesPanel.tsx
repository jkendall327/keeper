import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuickCaptureShortcut, useSearchFocusShortcut } from '../hooks/useAppShortcuts.ts';
import { Icon } from './Icon.tsx';
import { NoteGrid } from './NoteGrid.tsx';
import { NoteModal } from './NoteModal.tsx';
import { QuickAdd } from './QuickAdd.tsx';
import { SearchBar } from './SearchBar.tsx';
import type { FilterType } from './Sidebar.tsx';
import type { NoteCommands } from './note-commands.ts';
import type { CreateNoteInput, NoteId, NoteWithTags, Tag, UpdateNoteInput } from '../db/types.ts';
import styles from './NotesPanel.module.css';

interface NotesPanelProps {
  allTags: Tag[];
  notes: NoteWithTags[];
  createNote: (input: CreateNoteInput) => Promise<NoteWithTags>;
  updateNote: (input: UpdateNoteInput) => Promise<NoteWithTags>;
  deleteNote: (id: NoteId) => Promise<void>;
  togglePinNote: (id: NoteId) => Promise<NoteWithTags>;
  addTag: (noteId: NoteId, tagName: string) => Promise<NoteWithTags>;
  removeTag: (noteId: NoteId, tagName: string) => Promise<NoteWithTags>;
  toggleArchiveNote: (id: NoteId) => Promise<NoteWithTags>;
  trashNote: (id: NoteId) => Promise<void>;
  restoreNote: (id: NoteId) => Promise<void>;
  activeFilter: FilterType;
  navigateToFilter: (filter: FilterType) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
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
  navigateToFilter,
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
    navigateToFilter,
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
    update: async (input) => { await updateNote(input); },
    delete: isTrashView
      ? async (id: NoteId) => {
          if (!window.confirm('Permanently delete this note? This cannot be undone.')) return false;
          await deleteNote(id);
          return true;
        }
      : trashNote,
    togglePin: async (id) => { await togglePinNote(id); },
    archiveOrRestore: async (id) => { await (isTrashView ? restoreNote(id) : toggleArchiveNote(id)); },
    addTag: async (noteId, tagName) => { await addTag(noteId, tagName); },
    removeTag: async (noteId, tagName) => { await removeTag(noteId, tagName); },
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
      <div className={styles.stickyControls}>
        <SearchBar ref={searchInputRef} value={searchQuery} onChange={setSearchQuery} />
        {searchQuery.trim() !== '' && (
          <p className={styles.searchResultCount}>
            {displayedNotes.length === 0
              ? 'No results found'
              : `${String(displayedNotes.length)} result${displayedNotes.length === 1 ? '' : 's'}`}
          </p>
        )}
        <QuickAdd ref={quickAddRef} onCreate={handleCreateNote} />
      </div>
      {displayedNotes.length === 0 && searchQuery.trim() === '' && activeFilter.type === 'all' && (
        <div className={styles.emptyState} data-testid="notes-empty-state">
          <Icon name="sticky_note_2" size={48} />
          <p className={styles.emptyStateText}>No notes yet</p>
          <p className={styles.emptyStateHint}>Start typing above to capture a note</p>
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
