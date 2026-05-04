import { Suspense, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import './App.css';
import { useDB } from './hooks/useDB.ts';
import { useDisplayedNotes } from './hooks/useDisplayedNotes.ts';
import { useBulkNoteActions } from './hooks/useBulkNoteActions.ts';
import { AppHeader } from './components/AppHeader.tsx';
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
import { getAutoApplyActiveTag, setAutoApplyActiveTag } from './settings.ts';
import type { AppSettings, CreateNoteInput, NoteWithTags } from './db/types.ts';

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

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;
}

interface AppContentProps {
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
  toggleArchiveNote: ReturnType<typeof useDB>['toggleArchiveNote'];
  trashNote: ReturnType<typeof useDB>['trashNote'];
  restoreNote: ReturnType<typeof useDB>['restoreNote'];
  activeFilter: FilterType;
  setActiveFilter: React.Dispatch<React.SetStateAction<FilterType>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  displayedNotes: NoteWithTags[];
  extensionNoteCreatedCount: number;
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  sidebarOpen: boolean;
  onSidebarClose: () => void;
  isMobile: boolean;
}

function AppContent({
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
  toggleArchiveNote,
  trashNote,
  restoreNote,
  activeFilter,
  setActiveFilter,
  searchQuery,
  setSearchQuery,
  displayedNotes,
  extensionNoteCreatedCount,
  selectedNoteIds,
  setSelectedNoteIds,
  sidebarOpen,
  onSidebarClose,
  isMobile,
}: AppContentProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quickAddRef = useRef<HTMLTextAreaElement>(null);

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
  const [showSettings, setShowSettings] = useState(false);
  const [autoApplyActiveTag, setAutoApplyActiveTagState] = useState(getAutoApplyActiveTag);
  const [extensionBadgeEnabled, setExtensionBadgeEnabled] = useState(true);
  const [linkPreviewFetchEnabled, setLinkPreviewFetchEnabled] = useState(true);
  const [linkPreviewDisplayEnabled, setLinkPreviewDisplayEnabled] = useState(true);
  const [unseenExtensionNoteCount, setUnseenExtensionNoteCount] = useState(0);
  const previousExtensionNoteCreatedCount = useRef(extensionNoteCreatedCount);
  const titleBase = useRef(document.title);

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      const settings = await getDB().getAppSettings();
      if (cancelled) return;
      setExtensionBadgeEnabled(settings.extensionBadgeEnabled);
      if (!settings.extensionBadgeEnabled) setUnseenExtensionNoteCount(0);
      setLinkPreviewFetchEnabled(settings.linkPreviewFetchEnabled);
      setLinkPreviewDisplayEnabled(settings.linkPreviewDisplayEnabled);
    };
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const clearIfFocused = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        setUnseenExtensionNoteCount(0);
      }
    };
    window.addEventListener('focus', clearIfFocused);
    document.addEventListener('visibilitychange', clearIfFocused);
    clearIfFocused();
    return () => {
      window.removeEventListener('focus', clearIfFocused);
      document.removeEventListener('visibilitychange', clearIfFocused);
    };
  }, []);

  useEffect(() => {
    const previous = previousExtensionNoteCreatedCount.current;
    previousExtensionNoteCreatedCount.current = extensionNoteCreatedCount;
    const delta = extensionNoteCreatedCount - previous;
    if (delta <= 0 || !extensionBadgeEnabled) return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    setUnseenExtensionNoteCount((count) => count + delta);
  }, [extensionBadgeEnabled, extensionNoteCreatedCount]);

  useEffect(() => {
    if (!extensionBadgeEnabled) {
      document.title = titleBase.current;
      return;
    }
    document.title = unseenExtensionNoteCount > 0
      ? `(${String(unseenExtensionNoteCount)}) ${titleBase.current}`
      : titleBase.current;
  }, [extensionBadgeEnabled, unseenExtensionNoteCount]);

  // Keep selectedNote in sync with latest data from displayed notes
  // (using displayedNotes so archived notes are findable in archive view)
  const currentNote = selectedNote !== null
    ? displayedNotes.find((n) => n.id === selectedNote.id) ?? null
    : null;

  const clearSelection = useCallback(() => {
    setSelectedNoteIds(new Set());
  }, [setSelectedNoteIds]);

  // Ctrl/Cmd+N returns to the quickest capture path from filters or selection.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'n') return;
      if (selectedNote !== null || showSettings) return;
      if (
        isTextEntryTarget(e.target) &&
        e.target !== searchInputRef.current &&
        e.target !== quickAddRef.current
      ) {
        return;
      }

      e.preventDefault();
      setActiveFilter({ type: 'all' });
      setSearchQuery('');
      clearSelection();
      window.setTimeout(() => {
        quickAddRef.current?.focus();
      }, 0);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); };
  }, [clearSelection, selectedNote, setActiveFilter, setSearchQuery, showSettings]);

  const handleBulkSelect = useCallback((ids: Set<string>) => {
    setSelectedNoteIds(ids);
  }, [setSelectedNoteIds]);

  const activeTag = activeFilter.type === 'tag'
    ? allTags.find((tag) => tag.id === activeFilter.tagId)
    : undefined;

  const handleCreateNote = useCallback(async (input: CreateNoteInput) => {
    const note = await createNote(input);
    if (autoApplyActiveTag && activeTag !== undefined) {
      await addTag(note.id, activeTag.name);
    }
  }, [activeTag, addTag, autoApplyActiveTag, createNote]);

  const handleAutoApplyActiveTagChange = useCallback((enabled: boolean) => {
    setAutoApplyActiveTag(enabled);
    setAutoApplyActiveTagState(enabled);
  }, []);

  const handleAppSettingsChange = useCallback((settings: AppSettings) => {
    setExtensionBadgeEnabled(settings.extensionBadgeEnabled);
    if (!settings.extensionBadgeEnabled) setUnseenExtensionNoteCount(0);
    setLinkPreviewFetchEnabled(settings.linkPreviewFetchEnabled);
    setLinkPreviewDisplayEnabled(settings.linkPreviewDisplayEnabled);
  }, []);

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
          setSelectedNoteIds(new Set());
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
            <QuickAdd ref={quickAddRef} onCreate={handleCreateNote} />
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
              showLinkPreviews={linkPreviewDisplayEnabled}
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
                if (!window.confirm('Permanently delete this note? This cannot be undone.')) return false;
                await deleteNote(id);
                return true;
              }
            : trashNote}
          onTogglePin={togglePinNote}
          onToggleArchive={toggleArchiveNote}
          onAddTag={addTag}
          onRemoveTag={removeTag}
          showLinkPreviews={linkPreviewDisplayEnabled}
          isTrashView={activeFilter.type === 'trash'}
          onRestore={restoreNote}
          onClose={() => { setSelectedNote(null); }}
        />
      )}
      {showSettings && (
        <SettingsModal
          allTags={allTags}
          onClose={() => { setShowSettings(false); }}
          autoApplyActiveTag={autoApplyActiveTag}
          onAutoApplyActiveTagChange={handleAutoApplyActiveTagChange}
          extensionBadgeEnabled={extensionBadgeEnabled}
          linkPreviewFetchEnabled={linkPreviewFetchEnabled}
          linkPreviewDisplayEnabled={linkPreviewDisplayEnabled}
          onAppSettingsChange={handleAppSettingsChange}
        />
      )}
    </div>
  );
}

function App() {
  const db = useDB();
  const {
    createNote: createSharedNote,
    deleteNotes,
    archiveNotes,
    trashNotes,
    restoreNotes,
    notes: dbNotes,
    search,
    getArchivedNotes,
    getTrashedNotes,
    getUntaggedNotes,
    getNotesForTag,
    getLinkedNotes,
  } = db;
  const [activeFilter, setActiveFilter] = useState<FilterType>({ type: 'all' });
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isArchiveView = activeFilter.type === 'archive';
  const isTrashView = activeFilter.type === 'trash';
  const displayedNotes = useDisplayedNotes({
    activeFilter,
    dbNotes,
    getArchivedNotes,
    getLinkedNotes,
    getNotesForTag,
    getTrashedNotes,
    getUntaggedNotes,
    search,
    searchQuery,
  });
  const bulkActions = useBulkNoteActions({
    archiveNotes,
    deleteNotes,
    displayedNotes,
    isTrashView,
    restoreNotes,
    runAutoTagRules: db.runAutoTagRules,
    trashNotes,
  });
  const { handleBulkDelete, selectedNoteIds, selectedNotes, setSelectedNoteIds } = bulkActions;

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
      void createSharedNote({ body });
    }
    window.history.replaceState(null, '', '/');
  }, [createSharedNote]);

  const handleSidebarClose = useCallback(() => { setSidebarOpen(false); }, []);

  return (
    <div className="app">
      <AppHeader
        allTags={db.allTags}
        bulkActions={bulkActions}
        isArchiveView={isArchiveView}
        isMobile={isMobile}
        isTrashView={isTrashView}
        onAddTagToNotes={db.addTagToNotes}
        onOpenExport={() => { setShowExportModal(true); }}
        onRemoveTagFromNotes={db.removeTagFromNotes}
        onToggleSidebar={() => { setSidebarOpen((v) => !v); }}
      />
      <main className="app-main">
        <Suspense fallback={<p className="loading">Loading...</p>}>
          <AppContent
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
            toggleArchiveNote={db.toggleArchiveNote}
            trashNote={db.trashNote}
            restoreNote={db.restoreNote}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            displayedNotes={displayedNotes}
            extensionNoteCreatedCount={db.extensionNoteCreatedCount}
            selectedNoteIds={selectedNoteIds}
            setSelectedNoteIds={setSelectedNoteIds}
            sidebarOpen={sidebarOpen}
            onSidebarClose={handleSidebarClose}
            isMobile={isMobile}
          />
        </Suspense>
      </main>
      {showExportModal && selectedNoteIds.size > 0 && (
        <ExportModal
          notes={selectedNotes}
          onClose={() => { setShowExportModal(false); }}
          onDelete={() => { void handleBulkDelete(); }}
        />
      )}
    </div>
  );
}

export default App;
