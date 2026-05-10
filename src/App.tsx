import { Suspense, useRef, useState } from 'react';
import {
  Navigate,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
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
import { useKeeperRouteState } from './hooks/useKeeperRouteState.ts';
import { useWebShareTarget } from './hooks/useWebShareTarget.ts';
import { AppHeader } from './components/AppHeader.tsx';
import { AppLayout } from './components/app/AppLayout.tsx';
import { ExportModal } from './components/ExportModal.tsx';
import { SidebarContainer } from './components/app/SidebarContainer.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { WorkspaceContent } from './components/app/WorkspaceContent.tsx';
import { useAutoApplyActiveTag } from './settings.ts';

function KeeperApp() {
  const { data: inboxNotes } = useInboxNotes();
  const { data: allTags } = useTags();
  const noteMutations = useNoteMutations();
  const extensionNoteCreatedCount = useExtensionEvents();
  const { activeFilter, searchQuery } = useKeeperRouteState();
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoApplyActiveTag] = useAutoApplyActiveTag();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const appSettings = useAppSettings();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useExtensionBadge({
    enabled: appSettings.extensionBadgeEnabled,
    extensionNoteCreatedCount,
  });

  const isChatView = activeFilter.type === 'chat';
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
  const clearSelectedNotes = () => { setSelectedNoteIds(new Set()); };

  if (activeFilter.type === 'tag' && !allTags.some((tag) => tag.id === activeFilter.tagId)) {
    return <Navigate to="/inbox" replace search={{}} />;
  }

  return (
    <div className={styles.app}>
      {!isChatView && (
        <AppHeader
          bulkActions={bulkActions}
          isMobile={isMobile}
          onAddTagToNotes={noteMutations.addTagToNotes}
          onOpenExport={() => { setShowExportModal(true); }}
          onRemoveTagFromNotes={noteMutations.removeTagFromNotes}
          searchInputRef={searchInputRef}
          onToggleSidebar={() => { setSidebarOpen((v) => !v); }}
        />
      )}
      <main className={isChatView ? `${styles.main} ${styles.chatMain}` : styles.main}>
        <Suspense fallback={<p className={styles.loading}>Loading...</p>}>
          <AppLayout
            sidebarOpen={sidebarOpen}
            onSidebarClose={handleSidebarClose}
            isMobile={isMobile}
            sidebar={(
              <SidebarContainer
                clearSelectedNotes={clearSelectedNotes}
                isMobile={isMobile}
                onOpenSettings={() => { setShowSettings(true); }}
                onSidebarClose={handleSidebarClose}
                sidebarOpen={sidebarOpen}
              />
            )}
            settingsModal={showSettings && (
              <SettingsModal
                onClose={() => { setShowSettings(false); }}
              />
            )}
          >
            <WorkspaceContent
              view={{
                searchInputRef,
                displayedNotes,
                selectedNoteIds,
                setSelectedNoteIds,
              }}
              settings={{
                autoApplyActiveTag,
                linkPreviewDisplayEnabled: appSettings.linkPreviewDisplayEnabled,
                quickAddAutofocusEnabled: appSettings.quickAddAutofocusEnabled,
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
      <RouterProvider router={router} />
    </Suspense>
  );
}

interface KeeperSearch {
  q?: string;
}

function validateSearch(search: Record<string, unknown>): KeeperSearch {
  return typeof search['q'] === 'string' && search['q'] !== ''
    ? { q: search['q'] }
    : {};
}

const rootRoute = createRootRoute({
  component: Outlet,
  validateSearch,
  notFoundComponent: () => <Navigate to="/inbox" replace search={{}} />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <Navigate to="/inbox" replace search={{}} />,
});

const inboxRoute = createRoute({ getParentRoute: () => rootRoute, path: 'inbox', component: KeeperApp });
const untaggedRoute = createRoute({ getParentRoute: () => rootRoute, path: 'untagged', component: KeeperApp });
const archiveRoute = createRoute({ getParentRoute: () => rootRoute, path: 'archive', component: KeeperApp });
const linksRoute = createRoute({ getParentRoute: () => rootRoute, path: 'links', component: KeeperApp });
const trashRoute = createRoute({ getParentRoute: () => rootRoute, path: 'trash', component: KeeperApp });
const tagRoute = createRoute({ getParentRoute: () => rootRoute, path: 'tag/$tagId', component: KeeperApp });
const chatRoute = createRoute({ getParentRoute: () => rootRoute, path: 'chat', component: KeeperApp });

const routeTree = rootRoute.addChildren([
  indexRoute,
  inboxRoute,
  untaggedRoute,
  archiveRoute,
  linksRoute,
  trashRoute,
  tagRoute,
  chatRoute,
]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default App;
