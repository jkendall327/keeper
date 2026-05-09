import { Suspense, useRef, useState } from 'react';
import {
  Navigate,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useRouterState,
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
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchQuery = useRouterState({
    select: (state) => typeof state.location.search.q === 'string' ? state.location.search.q : '',
  });
  const activeFilter = filterFromPath(pathname);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoApplyActiveTag, setAutoApplyActiveTagState] = useState(getAutoApplyActiveTag);
  const searchInputRef = useRef<HTMLInputElement>(null);
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
  const navigateToFilter = (filter: FilterType) => {
    if (filter.type === 'tag') {
      void navigate({
        to: '/tag/$tagId',
        params: { tagId: String(filter.tagId) },
        search: (previousSearch) => previousSearch,
      });
      return;
    }

    void navigate({
      to: filterToPath(filter),
      search: (previousSearch) => previousSearch,
    });
  };
  const setSearchQuery = (query: string) => {
    void navigate({
      to: '.',
      search: (previousSearch) => query === '' ? {} : { ...previousSearch, q: query },
      replace: true,
    });
  };
  const handleAutoApplyActiveTagChange = (enabled: boolean) => {
    setAutoApplyActiveTag(enabled);
    setAutoApplyActiveTagState(enabled);
  };
  const clearSelectedNotes = () => { setSelectedNoteIds(new Set()); };

  if (activeFilter.type === 'tag' && !allTags.some((tag) => tag.id === activeFilter.tagId)) {
    return <Navigate to="/inbox" replace search={{}} />;
  }

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
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
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
                navigateToFilter={navigateToFilter}
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
                navigateToFilter,
                searchQuery,
                searchInputRef,
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

function filterFromPath(pathname: string): FilterType {
  if (pathname.startsWith('/tag/')) {
    return { type: 'tag', tagId: Number(pathname.slice('/tag/'.length)) };
  }

  switch (pathname) {
    case '/archive':
      return { type: 'archive' };
    case '/chat':
      return { type: 'chat' };
    case '/links':
      return { type: 'links' };
    case '/trash':
      return { type: 'trash' };
    case '/untagged':
      return { type: 'untagged' };
    case '/inbox':
    default:
      return { type: 'all' };
  }
}

function filterToPath(filter: Exclude<FilterType, { type: 'tag' }>) {
  switch (filter.type) {
    case 'all':
      return '/inbox';
    case 'archive':
      return '/archive';
    case 'chat':
      return '/chat';
    case 'links':
      return '/links';
    case 'trash':
      return '/trash';
    case 'untagged':
      return '/untagged';
  }
}

export default App;
