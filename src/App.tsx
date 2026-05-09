import { Suspense, useState } from 'react';
import styles from './App.module.css';
import {
  useAppSettings,
  useDisplayedNotes,
  useExtensionEvents,
  useInboxNotes,
  useNoteMutations,
  useTags,
} from './hooks/useKeeperQuery.ts';
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
  const { data: inboxNotes } = useInboxNotes();
  const { data: allTags } = useTags();
  const noteMutations = useNoteMutations();
  const extensionNoteCreatedCount = useExtensionEvents();
  const [activeFilter, setActiveFilter] = useState<FilterType>({ type: 'all' });
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoApplyActiveTag, setAutoApplyActiveTagState] = useState(getAutoApplyActiveTag);
  const appSettings = useAppSettings();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useExtensionBadge({
    enabled: appSettings.extensionBadgeEnabled,
    extensionNoteCreatedCount,
  });

  const isArchiveView = activeFilter.type === 'archive';
  const isInboxView = activeFilter.type === 'all';
  const isTrashView = activeFilter.type === 'trash';
  const displayedNotes = useDisplayedNotes(activeFilter, searchQuery);
  const bulkActions = useBulkNoteActions({
    archiveNotes: noteMutations.archiveNotes,
    deleteNotes: noteMutations.deleteNotes,
    displayedNotes,
    inboxNotes,
    isTrashView,
    restoreNotes: noteMutations.restoreNotes,
    runAutoTagRules: noteMutations.runAutoTagRules,
    trashNotes: noteMutations.trashNotes,
  });
  const { handleBulkDelete, selectedNoteIds, selectedNotes, setSelectedNoteIds } = bulkActions;
  useWebShareTarget({ createNote: noteMutations.createNote });

  const handleSidebarClose = () => { setSidebarOpen(false); };
  const handleAutoApplyActiveTagChange = (enabled: boolean) => {
    setAutoApplyActiveTag(enabled);
    setAutoApplyActiveTagState(enabled);
  };
  const clearSelectedNotes = () => { setSelectedNoteIds(new Set()); };

  return (
    <div className={styles.app}>
      <AppHeader
        allTags={allTags}
        bulkActions={bulkActions}
        isArchiveView={isArchiveView}
        isInboxView={isInboxView}
        isMobile={isMobile}
        isTrashView={isTrashView}
        onAddTagToNotes={noteMutations.addTagToNotes}
        onOpenExport={() => { setShowExportModal(true); }}
        onRemoveTagFromNotes={noteMutations.removeTagFromNotes}
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
                allTags={allTags}
                activeFilter={activeFilter}
                setActiveFilter={setActiveFilter}
                clearSelectedNotes={clearSelectedNotes}
                isMobile={isMobile}
                onOpenSettings={() => { setShowSettings(true); }}
                onSidebarClose={handleSidebarClose}
                sidebarOpen={sidebarOpen}
              />
            )}
            settingsModal={showSettings && (
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
              />
            )}
          >
            <WorkspaceContent
              allTags={allTags}
              inboxNotes={inboxNotes}
              noteMutations={noteMutations}
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
