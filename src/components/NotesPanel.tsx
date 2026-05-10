import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { useQuickCaptureShortcut, useSearchFocusShortcut } from '../hooks/useAppShortcuts.ts';
import { Icon } from './Icon.tsx';
import { NoteGrid } from './NoteGrid.tsx';
import { NoteModal } from './NoteModal.tsx';
import { QuickAdd } from './QuickAdd.tsx';
import type { FilterType } from './Sidebar.tsx';
import type { NoteCommands } from './note-commands.ts';
import type { CreateNoteInput, NoteId, NoteWithTags, Tag, UpdateNoteInput } from '../db/types.ts';
import styles from './NotesPanel.module.css';

interface NotesPanelProps {
  allTags: Tag[];
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
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  displayedNotes: NoteWithTags[];
  selectedNoteIds: Set<NoteId>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<NoteId>>>;
  autoApplyActiveTag: boolean;
  linkPreviewDisplayEnabled: boolean;
  popularTagSuggestionsEnabled: boolean;
  popularTagSuggestionLimit: number;
  quickAddAutofocusEnabled: boolean;
  showSettings: boolean;
}

export function NotesPanel({
  allTags,
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
  searchInputRef,
  searchQuery,
  setSearchQuery,
  displayedNotes,
  selectedNoteIds,
  setSelectedNoteIds,
  autoApplyActiveTag,
  linkPreviewDisplayEnabled,
  popularTagSuggestionsEnabled,
  popularTagSuggestionLimit,
  quickAddAutofocusEnabled,
  showSettings,
}: NotesPanelProps) {
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
    if (autoApplyActiveTag && activeTag !== undefined) {
      await createNote({ ...input, initialTagNames: [activeTag.name] });
      return;
    }
    await createNote(input);
  }, [activeTag, autoApplyActiveTag, createNote]);

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
          popularTagSuggestionsEnabled={popularTagSuggestionsEnabled}
          popularTagSuggestionLimit={popularTagSuggestionLimit}
          isTrashView={isTrashView}
          onClose={() => { setSelectedNote(null); }}
        />
      )}
    </>
  );
}
