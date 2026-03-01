import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { useDB } from './hooks/useDB.ts';
import { QuickAdd } from './components/QuickAdd.tsx';
import { NoteGrid } from './components/NoteGrid.tsx';
import { NoteModal } from './components/NoteModal.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { SearchBar } from './components/SearchBar.tsx';
import { Sidebar, type FilterType } from './components/Sidebar.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { ChatView } from './components/ChatView.tsx';
import { Icon } from './components/Icon.tsx';
import { getLLMClient, getApiKey } from './llm/client.ts';
import { getDB } from './db/db-client.ts';
import type { NoteWithTags } from './db/types.ts';

interface AppContentProps {
  notes: NoteWithTags[];
  allTags: ReturnType<typeof useDB>['allTags'];
  refresh: ReturnType<typeof useDB>['refresh'];
  createNote: ReturnType<typeof useDB>['createNote'];
  updateNote: ReturnType<typeof useDB>['updateNote'];
  deleteNote: ReturnType<typeof useDB>['deleteNote'];
  togglePinNote: ReturnType<typeof useDB>['togglePinNote'];
  addTag: ReturnType<typeof useDB>['addTag'];
  removeTag: ReturnType<typeof useDB>['removeTag'];
  renameTag: ReturnType<typeof useDB>['renameTag'];
  updateTagIcon: ReturnType<typeof useDB>['updateTagIcon'];
  deleteTag: ReturnType<typeof useDB>['deleteTag'];
  search: ReturnType<typeof useDB>['search'];
  toggleArchiveNote: ReturnType<typeof useDB>['toggleArchiveNote'];
  getArchivedNotes: ReturnType<typeof useDB>['getArchivedNotes'];
  getUntaggedNotes: ReturnType<typeof useDB>['getUntaggedNotes'];
  getNotesForTag: ReturnType<typeof useDB>['getNotesForTag'];
  getLinkedNotes: ReturnType<typeof useDB>['getLinkedNotes'];
  trashNote: ReturnType<typeof useDB>['trashNote'];
  restoreNote: ReturnType<typeof useDB>['restoreNote'];
  getTrashedNotes: ReturnType<typeof useDB>['getTrashedNotes'];
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onFilterChange: (filter: { isArchive: boolean; isTrash: boolean }) => void;
  onDisplayedNoteIdsChange: (ids: string[]) => void;
  onDisplayedNotesChange: (notes: NoteWithTags[]) => void;
}

function AppContent({
  notes,
  allTags,
  refresh,
  createNote,
  updateNote,
  deleteNote,
  togglePinNote,
  addTag,
  removeTag,
  renameTag,
  updateTagIcon,
  deleteTag,
  search,
  toggleArchiveNote,
  getArchivedNotes,
  getUntaggedNotes,
  getNotesForTag,
  getLinkedNotes,
  trashNote,
  restoreNote,
  getTrashedNotes,
  selectedNoteIds,
  setSelectedNoteIds,
  onFilterChange,
  onDisplayedNoteIdsChange,
  onDisplayedNotesChange,
}: AppContentProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Ctrl+/ (or Cmd+/) focuses the search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); };
  }, []);

  const [selectedNote, setSelectedNote] = useState<NoteWithTags | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>({ type: 'all' });
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    onFilterChange({ isArchive: activeFilter.type === 'archive', isTrash: activeFilter.type === 'trash' });
    setSelectedNoteIds(new Set());
  }, [activeFilter, onFilterChange, setSelectedNoteIds]);
  const [displayedNotes, setDisplayedNotes] = useState<NoteWithTags[]>(notes);

  // Update displayed notes based on search query and active filter
  useEffect(() => {
    const loadNotes = async () => {
      let notes_: NoteWithTags[];
      if (searchQuery.trim() !== '') {
        // Use FTS5 search
        notes_ = await search(searchQuery);
      } else {
        // Apply filter
        switch (activeFilter.type) {
          case 'all':
            notes_ = notes;
            break;
          case 'untagged':
            notes_ = await getUntaggedNotes();
            break;
          case 'archive':
            notes_ = await getArchivedNotes();
            break;
          case 'trash':
            notes_ = await getTrashedNotes();
            break;
          case 'links':
            notes_ = await getLinkedNotes();
            break;
          case 'tag':
            notes_ = await getNotesForTag(activeFilter.tagId);
            break;
          case 'chat':
            // Chat view replaces the NoteGrid — no notes to display
            notes_ = [];
            break;
        }
      }
      setDisplayedNotes(notes_);
      onDisplayedNotesChange(notes_);
      onDisplayedNoteIdsChange(notes_.map((n) => n.id));
    };
    void loadNotes();
  }, [searchQuery, activeFilter, notes, search, getArchivedNotes, getTrashedNotes, getUntaggedNotes, getNotesForTag, getLinkedNotes, onDisplayedNotesChange, onDisplayedNoteIdsChange]);

  // Keep selectedNote in sync with latest data from displayed notes
  // (using displayedNotes so archived notes are findable in archive view)
  const currentNote = selectedNote !== null
    ? displayedNotes.find((n) => n.id === selectedNote.id) ?? null
    : null;

  const clearSelection = useCallback(() => {
    setSelectedNoteIds(new Set());
  }, [setSelectedNoteIds]);

  const handleBulkSelect = useCallback((ids: Set<string>) => {
    setSelectedNoteIds(ids);
  }, [setSelectedNoteIds]);

  return (
    <div className="app-layout">
      <Sidebar
        tags={allTags}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onRenameTag={(old, new_) => {
          renameTag(old, new_).catch((err: unknown) => {
            console.error('Failed to rename tag:', err);
          });
        }}
        onDeleteTag={(id) => {
          // Reset filter if the deleted tag is the active filter
          if (activeFilter.type === 'tag' && activeFilter.tagId === id) {
            setActiveFilter({ type: 'all' });
          }
          deleteTag(id).catch((err: unknown) => {
            console.error('Failed to delete tag:', err);
          });
        }}
        onUpdateTagIcon={(id, icon) => {
          updateTagIcon(id, icon).catch((err: unknown) => {
            console.error('Failed to update tag icon:', err);
          });
        }}
        onOpenSettings={() => { setShowSettings(true); }}
      />
      <div className="app-content">
        {activeFilter.type === 'chat' ? (
          (() => {
            const llmClient = getLLMClient();
            const apiKey = getApiKey();
            if (llmClient === null || apiKey === null) {
              return (
                <div className="empty-state">
                  <Icon name="key" size={48} />
                  <p className="empty-state-text">API key required</p>
                  <p className="empty-state-hint">Configure your OpenRouter API key in Settings to use chat</p>
                </div>
              );
            }
            return (
              <ChatView
                client={llmClient}
                db={getDB()}
                apiKey={apiKey}
                onMutation={() => { void refresh(); }}
              />
            );
          })()
        ) : (
          <>
            <SearchBar ref={searchInputRef} value={searchQuery} onChange={setSearchQuery} />
            {searchQuery.trim() !== '' && (
              <p className="search-result-count">
                {displayedNotes.length === 0
                  ? 'No results found'
                  : `${String(displayedNotes.length)} result${displayedNotes.length === 1 ? '' : 's'}`}
              </p>
            )}
            <QuickAdd onCreate={createNote} />
            {displayedNotes.length === 0 && searchQuery.trim() === '' && activeFilter.type === 'all' && (
              <div className="empty-state">
                <Icon name="sticky_note_2" size={48} />
                <p className="empty-state-text">No notes yet</p>
                <p className="empty-state-hint">Start typing above to capture a note</p>
              </div>
            )}
            <NoteGrid
              notes={displayedNotes}
              onSelect={setSelectedNote}
              onDelete={activeFilter.type === 'trash'
                ? async (id: string) => {
                    if (!window.confirm('Permanently delete this note? This cannot be undone.')) return;
                    await deleteNote(id);
                  }
                : trashNote}
              onTogglePin={togglePinNote}
              onToggleArchive={toggleArchiveNote}
              onUpdateNote={updateNote}
              selectedNoteIds={selectedNoteIds}
              onBulkSelect={handleBulkSelect}
              onClearSelection={clearSelection}
              isTrashView={activeFilter.type === 'trash'}
              onRestore={restoreNote}
            />
          </>
        )}
      </div>
      {currentNote !== null && (
        <NoteModal
          note={currentNote}
          allTags={allTags}
          onUpdate={updateNote}
          onDelete={activeFilter.type === 'trash'
            ? async (id: string) => {
                if (!window.confirm('Permanently delete this note? This cannot be undone.')) return;
                await deleteNote(id);
              }
            : trashNote}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onClose={() => { setSelectedNote(null); }}
        />
      )}
      {showSettings && (
        <SettingsModal onClose={() => { setShowSettings(false); }} />
      )}
    </div>
  );
}

function App() {
  const db = useDB();
  const { deleteNotes, archiveNotes, trashNotes, restoreNote: restoreNoteFromDB } = db;
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [isArchiveView, setIsArchiveView] = useState(false);
  const [isTrashView, setIsTrashView] = useState(false);
  const [displayedNoteIds, setDisplayedNoteIds] = useState<string[]>([]);
  const [displayedNotes, setDisplayedNotes] = useState<NoteWithTags[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);

  // Handle Web Share Target: when opened via /share?title=...&text=...&url=...
  useEffect(() => {
    if (window.location.pathname !== '/share') return;
    const params = new URLSearchParams(window.location.search);
    const title = params.get('title') ?? '';
    const text = params.get('text') ?? '';
    const url = params.get('url') ?? '';

    const parts: string[] = [];
    if (title !== '') parts.push(title);
    if (text !== '') parts.push(text);
    if (url !== '' && url !== text) parts.push(url);
    const body = parts.join('\n');

    if (body !== '') {
      void db.createNote({ body });
    }
    window.history.replaceState(null, '', '/');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectAll = useCallback(() => {
    if (selectedNoteIds.size === displayedNoteIds.length && displayedNoteIds.length > 0) {
      setSelectedNoteIds(new Set());
    } else {
      setSelectedNoteIds(new Set(displayedNoteIds));
    }
  }, [selectedNoteIds.size, displayedNoteIds, setSelectedNoteIds]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    if (isTrashView) {
      if (!window.confirm(`Permanently delete ${String(ids.length)} selected note${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
      await deleteNotes(ids);
    } else {
      await trashNotes(ids);
    }
    setSelectedNoteIds(new Set());
  }, [selectedNoteIds, isTrashView, deleteNotes, trashNotes]);

  const handleBulkRestore = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    for (const id of ids) {
      await restoreNoteFromDB(id);
    }
    setSelectedNoteIds(new Set());
  }, [selectedNoteIds, restoreNoteFromDB]);

  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    await archiveNotes(ids);
    setSelectedNoteIds(new Set());
  }, [selectedNoteIds, archiveNotes]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Keeper</h1>
        <div className="app-header-actions">
          {displayedNoteIds.length > 0 && (
            <button
              className="bulk-action-btn select-all-btn"
              onClick={handleSelectAll}
            >
              {selectedNoteIds.size === displayedNoteIds.length && displayedNoteIds.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </button>
          )}
          {selectedNoteIds.size > 0 && (
            <div className="bulk-actions">
              <span className="bulk-count">{selectedNoteIds.size} selected</span>
              {isTrashView && (
                <button
                  className="bulk-action-btn bulk-archive-btn"
                  onClick={() => { void handleBulkRestore(); }}
                >
                  Restore
                </button>
              )}
              {!isArchiveView && !isTrashView && (
                <button
                  className="bulk-action-btn bulk-archive-btn"
                  onClick={() => { void handleBulkArchive(); }}
                >
                  Archive
                </button>
              )}
              <button
                className="bulk-action-btn bulk-export-btn"
                onClick={() => { setShowExportModal(true); }}
              >
                Export
              </button>
              <button
                className="bulk-action-btn bulk-delete-btn"
                onClick={() => { void handleBulkDelete(); }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="app-main">
        <Suspense fallback={<p className="loading">Loading...</p>}>
          <AppContent
            notes={db.notes}
            allTags={db.allTags}
            refresh={db.refresh}
            createNote={db.createNote}
            updateNote={db.updateNote}
            deleteNote={db.deleteNote}
            togglePinNote={db.togglePinNote}
            addTag={db.addTag}
            removeTag={db.removeTag}
            renameTag={db.renameTag}
            updateTagIcon={db.updateTagIcon}
            deleteTag={db.deleteTag}
            search={db.search}
            toggleArchiveNote={db.toggleArchiveNote}
            getArchivedNotes={db.getArchivedNotes}
            getUntaggedNotes={db.getUntaggedNotes}
            getNotesForTag={db.getNotesForTag}
            getLinkedNotes={db.getLinkedNotes}
            trashNote={db.trashNote}
            restoreNote={db.restoreNote}
            getTrashedNotes={db.getTrashedNotes}
            selectedNoteIds={selectedNoteIds}
            setSelectedNoteIds={setSelectedNoteIds}
            onFilterChange={useCallback((f: { isArchive: boolean; isTrash: boolean }) => {
              setIsArchiveView(f.isArchive);
              setIsTrashView(f.isTrash);
            }, [])}
            onDisplayedNoteIdsChange={setDisplayedNoteIds}
            onDisplayedNotesChange={setDisplayedNotes}
          />
        </Suspense>
      </main>
      {showExportModal && selectedNoteIds.size > 0 && (
        <ExportModal
          notes={displayedNotes.filter((n) => selectedNoteIds.has(n.id))}
          onClose={() => { setShowExportModal(false); }}
          onDelete={() => { void handleBulkDelete(); }}
        />
      )}
    </div>
  );
}

export default App;
