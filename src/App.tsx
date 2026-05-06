import { Suspense, useState, type ReactNode } from 'react';
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
import type { AppSettings, NoteId, NoteWithTags } from './db/types.ts';

type DB = ReturnType<typeof useDB>;

type SidebarDb = Pick<
  DB,
  'allTags' | 'renameTag' | 'updateTagIcon' | 'deleteTag'
>;

type NotesDb = Pick<
  DB,
  | 'allTags'
  | 'notes'
  | 'createNote'
  | 'updateNote'
  | 'deleteNote'
  | 'togglePinNote'
  | 'addTag'
  | 'removeTag'
  | 'toggleArchiveNote'
  | 'trashNote'
  | 'restoreNote'
>;

interface NoteViewState {
  activeFilter: FilterType;
  setActiveFilter: React.Dispatch<React.SetStateAction<FilterType>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  displayedNotes: NoteWithTags[];
  selectedNoteIds: Set<NoteId>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<NoteId>>>;
}

interface NotesPanelSettings extends Pick<
  AppSettings,
  'linkPreviewDisplayEnabled' | 'popularTagSuggestionsEnabled' | 'popularTagSuggestionLimit'
> {
  autoApplyActiveTag: boolean;
  showSettings: boolean;
}

interface AppLayoutProps {
  children: ReactNode;
  sidebarOpen: boolean;
  onSidebarClose: () => void;
  isMobile: boolean;
  settingsModal: ReactNode;
  sidebar: ReactNode;
}

function filterKey(filter: FilterType) {
  return filter.type === 'tag' ? `tag:${String(filter.tagId)}` : filter.type;
}

function AppLayout({
  children,
  isMobile,
  onSidebarClose,
  settingsModal,
  sidebar,
  sidebarOpen,
}: AppLayoutProps) {
  return (
    <div className={styles.layout}>
      {isMobile && sidebarOpen && (
        <div className={styles.sidebarOverlay} onClick={onSidebarClose} />
      )}
      {sidebar}
      <div className={styles.content}>{children}</div>
      {settingsModal}
    </div>
  );
}

interface SidebarContainerProps {
  activeFilter: FilterType;
  clearSelectedNotes: () => void;
  db: SidebarDb;
  isMobile: boolean;
  onOpenSettings: () => void;
  onSidebarClose: () => void;
  setActiveFilter: React.Dispatch<React.SetStateAction<FilterType>>;
  sidebarOpen: boolean;
}

function SidebarContainer({
  activeFilter,
  clearSelectedNotes,
  db,
  isMobile,
  onOpenSettings,
  onSidebarClose,
  setActiveFilter,
  sidebarOpen,
}: SidebarContainerProps) {
  return (
    <Sidebar
      tags={db.allTags}
      activeFilter={activeFilter}
      onFilterChange={(filter) => {
        setActiveFilter(filter);
        clearSelectedNotes();
        if (isMobile) onSidebarClose();
      }}
      onRenameTag={(old, new_) => {
        db.renameTag(old, new_).catch((err: unknown) => {
          console.error('Failed to rename tag:', err);
        });
      }}
      onDeleteTag={(id) => {
        // Reset filter if the deleted tag is the active filter
        if (activeFilter.type === 'tag' && activeFilter.tagId === id) {
          setActiveFilter({ type: 'all' });
        }
        db.deleteTag(id).catch((err: unknown) => {
          console.error('Failed to delete tag:', err);
        });
      }}
      onUpdateTagIcon={(id, icon) => {
        db.updateTagIcon(id, icon).catch((err: unknown) => {
          console.error('Failed to update tag icon:', err);
        });
      }}
      onOpenSettings={() => {
        onOpenSettings();
        if (isMobile) onSidebarClose();
      }}
      isOpen={sidebarOpen}
    />
  );
}

interface NotesPanelContainerProps {
  db: NotesDb;
  settings: NotesPanelSettings;
  view: NoteViewState;
}

function NotesPanelContainer({
  db,
  settings,
  view,
}: NotesPanelContainerProps) {
  return (
    <NotesPanel
      key={filterKey(view.activeFilter)}
      allTags={db.allTags}
      notes={db.notes}
      createNote={db.createNote}
      updateNote={db.updateNote}
      deleteNote={db.deleteNote}
      togglePinNote={db.togglePinNote}
      addTag={db.addTag}
      removeTag={db.removeTag}
      toggleArchiveNote={db.toggleArchiveNote}
      trashNote={db.trashNote}
      restoreNote={db.restoreNote}
      activeFilter={view.activeFilter}
      setActiveFilter={view.setActiveFilter}
      searchQuery={view.searchQuery}
      setSearchQuery={view.setSearchQuery}
      displayedNotes={view.displayedNotes}
      selectedNoteIds={view.selectedNoteIds}
      setSelectedNoteIds={view.setSelectedNoteIds}
      autoApplyActiveTag={settings.autoApplyActiveTag}
      linkPreviewDisplayEnabled={settings.linkPreviewDisplayEnabled}
      popularTagSuggestionsEnabled={settings.popularTagSuggestionsEnabled}
      popularTagSuggestionLimit={settings.popularTagSuggestionLimit}
      showSettings={settings.showSettings}
    />
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
  const [showSettings, setShowSettings] = useState(false);
  const [autoApplyActiveTag, setAutoApplyActiveTagState] = useState(getAutoApplyActiveTag);
  const { appSettings, appSettingsLoaded, onAppSettingsChange } = useAppSettings();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useExtensionBadge({
    enabled: appSettings.extensionBadgeEnabled,
    extensionNoteCreatedCount: db.extensionNoteCreatedCount,
  });

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
  const handleAutoApplyActiveTagChange = (enabled: boolean) => {
    setAutoApplyActiveTag(enabled);
    setAutoApplyActiveTagState(enabled);
  };
  const clearSelectedNotes = () => { setSelectedNoteIds(new Set()); };

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
          <AppLayout
            sidebarOpen={sidebarOpen}
            onSidebarClose={handleSidebarClose}
            isMobile={isMobile}
            sidebar={(
              <SidebarContainer
                db={db}
                activeFilter={activeFilter}
                setActiveFilter={setActiveFilter}
                clearSelectedNotes={clearSelectedNotes}
                isMobile={isMobile}
                onOpenSettings={() => { setShowSettings(true); }}
                onSidebarClose={handleSidebarClose}
                sidebarOpen={sidebarOpen}
              />
            )}
            settingsModal={showSettings && appSettingsLoaded && (
              <SettingsModal
                allTags={db.allTags}
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
          >
            {activeFilter.type === 'chat' ? (
              <ChatPanel refresh={db.refresh} />
            ) : (
              <NotesPanelContainer
                db={db}
                view={{
                  activeFilter,
                  setActiveFilter,
                  searchQuery,
                  setSearchQuery,
                  displayedNotes,
                  selectedNoteIds,
                  setSelectedNoteIds,
                }}
                settings={{
                  autoApplyActiveTag,
                  linkPreviewDisplayEnabled: appSettings.linkPreviewDisplayEnabled,
                  popularTagSuggestionsEnabled: appSettings.popularTagSuggestionsEnabled,
                  popularTagSuggestionLimit: appSettings.popularTagSuggestionLimit,
                  showSettings,
                }}
              />
            )}
          </AppLayout>
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
