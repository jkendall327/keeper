import { Suspense, useState } from 'react';
import styles from './App.module.css';
import { useDB } from './hooks/useDB.ts';
import { useAppSettings } from './hooks/useAppSettings.ts';
import { useDisplayedNotes } from './hooks/useDisplayedNotes.ts';
import { useBulkNoteActions } from './hooks/useBulkNoteActions.ts';
import { useExtensionBadge } from './hooks/useExtensionBadge.ts';
import { useIsMobile } from './hooks/useIsMobile.ts';
import { useWebShareTarget } from './hooks/useWebShareTarget.ts';
import { AppHeader } from './components/AppHeader.tsx';
import { AppLayout } from './components/app/AppLayout.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { SidebarContainer } from './components/app/SidebarContainer.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { WorkspaceContent } from './components/app/WorkspaceContent.tsx';
import { getAutoApplyActiveTag, setAutoApplyActiveTag } from './settings.ts';
import type { FilterType } from './components/Sidebar.tsx';

function KeeperApp() {
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
            <WorkspaceContent
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

function App() {
  return (
    <Suspense fallback={<p className={styles.loading}>Loading...</p>}>
      <KeeperApp />
    </Suspense>
  );
}

export default App;
