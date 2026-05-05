import { Suspense, useState } from 'react';
import './App.css';
import styles from './App.module.css';
import { useDB } from './hooks/useDB.ts';
import { useAppSettings } from './hooks/useAppSettings.ts';
import { useDisplayedNotes } from './hooks/useDisplayedNotes.ts';
import { useBulkNoteActions } from './hooks/useBulkNoteActions.ts';
import { useExtensionBadge } from './hooks/useExtensionBadge.ts';
import { useIsMobile } from './hooks/useIsMobile.ts';
import { useWebShareTarget } from './hooks/useWebShareTarget.ts';
import { AppHeader } from './components/AppHeader.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { NotesPanel } from './components/NotesPanel.tsx';
import { Sidebar, type FilterType } from './components/Sidebar.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { getAutoApplyActiveTag, setAutoApplyActiveTag } from './settings.ts';
import type { NoteId, NoteWithTags } from './db/types.ts';

interface AppContentProps {
  allTags: ReturnType<typeof useDB>['allTags'];
  notes: ReturnType<typeof useDB>['notes'];
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
  selectedNoteIds: Set<NoteId>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<NoteId>>>;
  sidebarOpen: boolean;
  onSidebarClose: () => void;
  isMobile: boolean;
}

function filterKey(filter: FilterType) {
  return filter.type === 'tag' ? `tag:${String(filter.tagId)}` : filter.type;
}

function AppContent({
  allTags,
  notes,
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
  const [showSettings, setShowSettings] = useState(false);
  const [autoApplyActiveTag, setAutoApplyActiveTagState] = useState(getAutoApplyActiveTag);
  const { appSettings, appSettingsLoaded, onAppSettingsChange } = useAppSettings();
  useExtensionBadge({
    enabled: appSettings.extensionBadgeEnabled,
    extensionNoteCreatedCount,
  });

  const handleAutoApplyActiveTagChange = (enabled: boolean) => {
    setAutoApplyActiveTag(enabled);
    setAutoApplyActiveTagState(enabled);
  };

  return (
    <div className={styles.layout}>
      {isMobile && sidebarOpen && (
        <div className={styles.sidebarOverlay} onClick={onSidebarClose} />
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
      <div className={styles.content}>
        {activeFilter.type === 'chat' ? (
          <ChatPanel refresh={refresh} />
        ) : (
          <NotesPanel
            key={filterKey(activeFilter)}
            allTags={allTags}
            notes={notes}
            createNote={createNote}
            updateNote={updateNote}
            deleteNote={deleteNote}
            togglePinNote={togglePinNote}
            addTag={addTag}
            removeTag={removeTag}
            toggleArchiveNote={toggleArchiveNote}
            trashNote={trashNote}
            restoreNote={restoreNote}
            activeFilter={activeFilter}
            setActiveFilter={setActiveFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            displayedNotes={displayedNotes}
            selectedNoteIds={selectedNoteIds}
            setSelectedNoteIds={setSelectedNoteIds}
            autoApplyActiveTag={autoApplyActiveTag}
            linkPreviewDisplayEnabled={appSettings.linkPreviewDisplayEnabled}
            popularTagSuggestionsEnabled={appSettings.popularTagSuggestionsEnabled}
            popularTagSuggestionLimit={appSettings.popularTagSuggestionLimit}
            showSettings={showSettings}
          />
        )}
      </div>
      {showSettings && appSettingsLoaded && (
        <SettingsModal
          allTags={allTags}
          onClose={() => { setShowSettings(false); }}
          autoApplyActiveTag={autoApplyActiveTag}
          onAutoApplyActiveTagChange={handleAutoApplyActiveTagChange}
          extensionTitleMaxLength={appSettings.extensionTitleMaxLength}
          extensionBadgeEnabled={appSettings.extensionBadgeEnabled}
          linkPreviewFetchEnabled={appSettings.linkPreviewFetchEnabled}
          linkPreviewDisplayEnabled={appSettings.linkPreviewDisplayEnabled}
          popularTagSuggestionsEnabled={appSettings.popularTagSuggestionsEnabled}
          popularTagSuggestionLimit={appSettings.popularTagSuggestionLimit}
          onAppSettingsChange={onAppSettingsChange}
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
  const isInboxView = activeFilter.type === 'all';
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
    inboxNotes: dbNotes,
    isTrashView,
    restoreNotes,
    runAutoTagRules: db.runAutoTagRules,
    trashNotes,
  });
  const { handleBulkDelete, selectedNoteIds, selectedNotes, setSelectedNoteIds } = bulkActions;
  useWebShareTarget({ createNote: createSharedNote });

  const handleSidebarClose = () => { setSidebarOpen(false); };

  return (
    <div className={styles.app}>
      <AppHeader
        allTags={db.allTags}
        bulkActions={bulkActions}
        isArchiveView={isArchiveView}
        isInboxView={isInboxView}
        isMobile={isMobile}
        isTrashView={isTrashView}
        onAddTagToNotes={db.addTagToNotes}
        onOpenExport={() => { setShowExportModal(true); }}
        onRemoveTagFromNotes={db.removeTagFromNotes}
        onToggleSidebar={() => { setSidebarOpen((v) => !v); }}
      />
      <main className={styles.main}>
        <Suspense fallback={<p className={styles.loading}>Loading...</p>}>
          <AppContent
            allTags={db.allTags}
            notes={db.notes}
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
