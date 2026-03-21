import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

function useIsMobile() {
  const query = useMemo(() => window.matchMedia('(max-width: 768px)'), []);
  const [isMobile, setIsMobile] = useState(query.matches);
  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => { setIsMobile(e.matches); };
    query.addEventListener('change', handler);
    return () => { query.removeEventListener('change', handler); };
  }, [query]);
  return isMobile;
}

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
  sidebarOpen: boolean;
  onSidebarClose: () => void;
  isMobile: boolean;
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
  sidebarOpen,
  onSidebarClose,
  isMobile,
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
      {isMobile && sidebarOpen && (
        <div className="sidebar-overlay" onClick={onSidebarClose} />
      )}
      <Sidebar
        tags={allTags}
        activeFilter={activeFilter}
        onFilterChange={(filter) => {
          setActiveFilter(filter);
          if (isMobile) onSidebarClose();
        }}
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
        onOpenSettings={() => {
          setShowSettings(true);
          if (isMobile) onSidebarClose();
        }}
        isOpen={sidebarOpen}
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
              allTags={allTags}
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
              onAddTag={addTag}
              onRemoveTag={removeTag}
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
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  // Delete key deletes selected notes
  useEffect(() => {
    const handleDeleteKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
      if (selectedNoteIds.size === 0) return;
      e.preventDefault();
      void handleBulkDelete();
    };
    document.addEventListener('keydown', handleDeleteKey);
    return () => { document.removeEventListener('keydown', handleDeleteKey); };
  }, [selectedNoteIds.size, handleBulkDelete]);

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
        <div className="app-header-left">
          {isMobile && (
            <button
              className="hamburger-btn"
              onClick={() => { setSidebarOpen((v) => !v); }}
              aria-label="Toggle sidebar"
            >
              <Icon name="menu" size={24} />
            </button>
          )}
          {!isMobile && <h1>Keeper</h1>}
        </div>
        <div className="app-header-actions">
          {displayedNoteIds.length > 0 && (
            <button
              className="bulk-action-btn select-all-btn"
              onClick={handleSelectAll}
              title={selectedNoteIds.size === displayedNoteIds.length && displayedNoteIds.length > 0
                ? 'Deselect All'
                : 'Select All'}
            >
              {isMobile
                ? <Icon name={selectedNoteIds.size === displayedNoteIds.length && displayedNoteIds.length > 0 ? 'deselect' : 'select_all'} size={20} />
                : selectedNoteIds.size === displayedNoteIds.length && displayedNoteIds.length > 0
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
                  title="Restore"
                >
                  {isMobile ? <Icon name="restore_from_trash" size={20} /> : 'Restore'}
                </button>
              )}
              {!isArchiveView && !isTrashView && (
                <button
                  className="bulk-action-btn bulk-archive-btn"
                  onClick={() => { void handleBulkArchive(); }}
                  title="Archive"
                >
                  {isMobile ? <Icon name="archive" size={20} /> : 'Archive'}
                </button>
              )}
              {!isMobile && (
                <button
                  className="bulk-action-btn bulk-export-btn"
                  onClick={() => { setShowExportModal(true); }}
                >
                  Export
                </button>
              )}
              <button
                className="bulk-action-btn bulk-delete-btn"
                onClick={() => { void handleBulkDelete(); }}
                title="Delete"
              >
                {isMobile ? <Icon name="delete" size={20} /> : 'Delete'}
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
            sidebarOpen={sidebarOpen}
            onSidebarClose={useCallback(() => { setSidebarOpen(false); }, [])}
            isMobile={isMobile}
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
