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
  previewMode: boolean;
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onFilterChange: (isArchive: boolean) => void;
}

function AppContent({ previewMode, selectedNoteIds, setSelectedNoteIds, onFilterChange }: AppContentProps) {
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

  const {
    notes,
    allTags,
    refresh,
    createNote,
    updateNote,
    deleteNote,
    deleteNotes,
    archiveNotes,
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
  } = useDB();

  const [selectedNote, setSelectedNote] = useState<NoteWithTags | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>({ type: 'all' });
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    onFilterChange(activeFilter.type === 'archive');
    setSelectedNoteIds(new Set());
  }, [activeFilter, onFilterChange, setSelectedNoteIds]);
  const [displayedNotes, setDisplayedNotes] = useState<NoteWithTags[]>(notes);

  // Update displayed notes based on search query and active filter
  useEffect(() => {
    const loadNotes = async () => {
      if (searchQuery.trim() !== '') {
        // Use FTS5 search
        const results = await search(searchQuery);
        setDisplayedNotes(results);
      } else {
        // Apply filter
        switch (activeFilter.type) {
          case 'all':
            setDisplayedNotes(notes);
            break;
          case 'untagged':
            setDisplayedNotes(await getUntaggedNotes());
            break;
          case 'archive':
            setDisplayedNotes(await getArchivedNotes());
            break;
          case 'links':
            setDisplayedNotes(await getLinkedNotes());
            break;
          case 'tag':
            setDisplayedNotes(await getNotesForTag(activeFilter.tagId));
            break;
          case 'chat':
            // Chat view replaces the NoteGrid — no notes to display
            setDisplayedNotes([]);
            break;
        }
      }
    };
    void loadNotes();
  }, [searchQuery, activeFilter, notes, search, getArchivedNotes, getUntaggedNotes, getNotesForTag, getLinkedNotes]);

  // Keep selectedNote in sync with latest data from notes array
  const currentNote = selectedNote !== null
    ? notes.find((n) => n.id === selectedNote.id) ?? null
    : null;

  const clearSelection = useCallback(() => {
    setSelectedNoteIds(new Set());
  }, [setSelectedNoteIds]);

  const handleBulkSelect = useCallback((ids: Set<string>) => {
    setSelectedNoteIds(ids);
  }, [setSelectedNoteIds]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${String(ids.length)} selected note${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    await deleteNotes(ids);
    setSelectedNoteIds(new Set());
  }, [selectedNoteIds, deleteNotes, setSelectedNoteIds]);

  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    await archiveNotes(ids);
    setSelectedNoteIds(new Set());
  }, [selectedNoteIds, archiveNotes, setSelectedNoteIds]);

  // Listen for bulk action events from header buttons
  useEffect(() => {
    const onBulkDelete = () => { void handleBulkDelete(); };
    const onBulkArchive = () => { void handleBulkArchive(); };
    const onExport = () => { setShowExportModal(true); };
    window.addEventListener('keeper:bulk-delete', onBulkDelete);
    window.addEventListener('keeper:bulk-archive', onBulkArchive);
    window.addEventListener('keeper:export', onExport);
    return () => {
      window.removeEventListener('keeper:bulk-delete', onBulkDelete);
      window.removeEventListener('keeper:bulk-archive', onBulkArchive);
      window.removeEventListener('keeper:export', onExport);
    };
  }, [handleBulkDelete, handleBulkArchive]);

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
              onDelete={deleteNote}
              onTogglePin={togglePinNote}
              onToggleArchive={toggleArchiveNote}
              previewMode={previewMode}
              onUpdateNote={updateNote}
              selectedNoteIds={selectedNoteIds}
              onBulkSelect={handleBulkSelect}
              onClearSelection={clearSelection}
            />
          </>
        )}
      </div>
      {currentNote !== null && (
        <NoteModal
          note={currentNote}
          allTags={allTags}
          onUpdate={updateNote}
          onDelete={deleteNote}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          onClose={() => { setSelectedNote(null); }}
          previewMode={previewMode}
        />
      )}
      {showExportModal && selectedNoteIds.size > 0 && (
        <ExportModal
          notes={displayedNotes.filter((n) => selectedNoteIds.has(n.id))}
          onClose={() => { setShowExportModal(false); }}
          onDelete={() => { void handleBulkDelete(); }}
        />
      )}
      {showSettings && (
        <SettingsModal onClose={() => { setShowSettings(false); }} />
      )}
    </div>
  );
}

function App() {
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [isArchiveView, setIsArchiveView] = useState(false);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Keeper</h1>
        <div className="app-header-actions">
          {selectedNoteIds.size > 0 && (
            <div className="bulk-actions">
              <span className="bulk-count">{selectedNoteIds.size} selected</span>
              {!isArchiveView && (
                <button
                  className="bulk-action-btn bulk-archive-btn"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('keeper:bulk-archive'));
                  }}
                >
                  Archive
                </button>
              )}
              <button
                className="bulk-action-btn bulk-export-btn"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('keeper:export'));
                }}
              >
                Export
              </button>
              <button
                className="bulk-action-btn bulk-delete-btn"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('keeper:bulk-delete'));
                }}
              >
                Delete
              </button>
            </div>
          )}
          <button
            className="preview-toggle"
            onClick={() => { setPreviewMode(!previewMode); }}
            title={previewMode ? 'Switch to edit mode' : 'Switch to preview mode'}
          >
            <Icon name={previewMode ? 'edit' : 'visibility'} />
          </button>
        </div>
      </header>
      <main className="app-main">
        <Suspense fallback={<p className="loading">Loading...</p>}>
          <AppContent
            previewMode={previewMode}
            selectedNoteIds={selectedNoteIds}
            setSelectedNoteIds={setSelectedNoteIds}
            onFilterChange={setIsArchiveView}
          />
        </Suspense>
      </main>
    </div>
  );
}

export default App;
