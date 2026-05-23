import { lazy, Suspense, useRef, useState, type PointerEvent } from 'react';
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
import { NotesPanel } from './components/NotesPanel.tsx';
import { SidebarContainer } from './components/app/SidebarContainer.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import type { FilterType } from './components/Sidebar.tsx';
import { useAutoApplyActiveTag } from './settings.ts';

const ChatPanel = lazy(async () => {
  const module = await import('./components/ChatPanel.tsx');
  return { default: module.ChatPanel };
});

function filterKey(filter: FilterType) {
  return filter.type === 'tag' ? `tag:${String(filter.tagId)}` : filter.type;
}

const SIDEBAR_SWIPE_EDGE_WIDTH = 48;
const SIDEBAR_SWIPE_OPEN_DISTANCE = 48;
const SIDEBAR_SWIPE_VERTICAL_TOLERANCE = 1.5;

function KeeperApp() {
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
  const sidebarSwipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  useExtensionBadge({
    enabled: appSettings.extensionBadgeEnabled,
    extensionNoteCreatedCount,
  });

  const isChatView = activeFilter.type === 'chat';
  const isTrashView = activeFilter.type === 'trash';
  const displayedNotes = useDisplayedNotes(activeFilter, searchQuery);
  const bulkActions = useBulkNoteActions({
    archiveNotes: noteMutations.archiveNotes,
    archiveTaggedNotes: noteMutations.archiveTaggedNotes,
    cleanupArchiveTaggedEnabled: appSettings.cleanupArchiveTaggedEnabled,
    cleanupAutoTagRulesEnabled: appSettings.cleanupAutoTagRulesEnabled,
    deleteNotes: noteMutations.deleteNotes,
    displayedNotes,
    isTrashView,
    restoreNotes: noteMutations.restoreNotes,
    runAutoTagRules: noteMutations.runAutoTagRules,
    trashNotes: noteMutations.trashNotes,
  });
  const { handleBulkDelete, selectedNoteIds, selectedNotes, setSelectedNoteIds } = bulkActions;
  useWebShareTarget({ createNote: noteMutations.createNote });

  const handleSidebarClose = () => { setSidebarOpen(false); };
  const clearSelectedNotes = () => { setSelectedNoteIds(new Set()); };
  const resetSidebarSwipe = () => {
    sidebarSwipeStart.current = null;
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!isMobile || sidebarOpen || event.pointerType !== 'touch') return;
    if (event.clientX > SIDEBAR_SWIPE_EDGE_WIDTH) return;
    sidebarSwipeStart.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const swipeStart = sidebarSwipeStart.current;
    if (swipeStart?.pointerId !== event.pointerId) return;

    const dx = event.clientX - swipeStart.x;
    const dy = event.clientY - swipeStart.y;
    const isHorizontalSwipe = dx > SIDEBAR_SWIPE_OPEN_DISTANCE &&
      Math.abs(dx) > Math.abs(dy) * SIDEBAR_SWIPE_VERTICAL_TOLERANCE;

    if (isHorizontalSwipe) {
      setSidebarOpen(true);
      resetSidebarSwipe();
    } else if (Math.abs(dy) > SIDEBAR_SWIPE_OPEN_DISTANCE) {
      resetSidebarSwipe();
    }
  };

  if (activeFilter.type === 'tag' && !allTags.some((tag) => tag.id === activeFilter.tagId)) {
    return <Navigate to="/inbox" replace search={{}} />;
  }

  return (
    <div
      className={styles.app}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={resetSidebarSwipe}
      onPointerCancel={resetSidebarSwipe}
    >
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
            {isChatView ? (
              <ChatPanel />
            ) : (
              <NotesPanel
                key={filterKey(activeFilter)}
                searchInputRef={searchInputRef}
                displayedNotes={displayedNotes}
                selectedNoteIds={selectedNoteIds}
                setSelectedNoteIds={setSelectedNoteIds}
                autoApplyActiveTag={autoApplyActiveTag}
                isMobile={isMobile}
                linkPreviewDisplayEnabled={appSettings.linkPreviewDisplayEnabled}
                quickAddAutofocusEnabled={appSettings.quickAddAutofocusEnabled}
                showSettings={showSettings}
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
const shareRoute = createRoute({ getParentRoute: () => rootRoute, path: 'share', component: KeeperApp });
const tagRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tag/$tagId',
  params: {
    parse: ({ tagId }) => {
      const parsedTagId = Number(tagId);
      return Number.isSafeInteger(parsedTagId) && parsedTagId > 0 ? { tagId: parsedTagId } : false;
    },
    stringify: ({ tagId }) => ({ tagId: String(tagId) }),
  },
  component: KeeperApp,
});
const chatRoute = createRoute({ getParentRoute: () => rootRoute, path: 'chat', component: KeeperApp });

const routeTree = rootRoute.addChildren([
  indexRoute,
  inboxRoute,
  untaggedRoute,
  archiveRoute,
  linksRoute,
  trashRoute,
  shareRoute,
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
