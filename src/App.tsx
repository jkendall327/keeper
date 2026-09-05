import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  useReminderMutations,
  useReminders,
} from './hooks/useKeeperQuery.ts';
import { useBulkNoteActions } from './hooks/useBulkNoteActions.ts';
import { useExtensionBadge } from './hooks/useExtensionBadge.ts';
import { useSidebarSwipe } from './hooks/useSidebarSwipe.ts';
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
import type { NoteId, Reminder } from './db/types.ts';

const ChatPanel = lazy(async () => {
  const module = await import('./components/ChatPanel.tsx');
  return { default: module.ChatPanel };
});

function filterKey(filter: FilterType) {
  return filter.type === 'tag' ? `tag:${filter.tagName}` : filter.type;
}

const EMPTY_REMINDER_MAP = new Map<NoteId, Reminder>();

function KeeperApp() {
  const noteMutations = useNoteMutations();
  const { acknowledgeDue } = useReminderMutations();
  const { data: reminderEntries = [] } = useReminders();
  const extensionNoteCreatedCount = useExtensionEvents();
  const { activeFilter, searchQuery } = useKeeperRouteState();
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoApplyActiveTag] = useAutoApplyActiveTag();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const acknowledgedReminderSetRef = useRef('');
  const appSettings = useAppSettings();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarSwipe = useSidebarSwipe(isMobile, sidebarOpen, setSidebarOpen);
  useExtensionBadge({
    enabled: appSettings.extensionBadgeEnabled,
    extensionNoteCreatedCount,
  });

  const isChatView = activeFilter.type === 'chat';
  const isTrashView = activeFilter.type === 'trash';
  const displayedNotes = useDisplayedNotes(activeFilter, searchQuery, reminderEntries);
  const remindersByNoteId = useMemo(
    () => reminderEntries.length === 0
      ? EMPTY_REMINDER_MAP
      : new Map(reminderEntries.map((entry) => [entry.note_id, entry])),
    [reminderEntries],
  );
  const unreadReminderSet = reminderEntries
    .filter((entry) => entry.surfaced_at_utc_ms !== null && entry.acknowledged_at_utc_ms === null)
    .map((entry) => entry.id)
    .sort()
    .join(',');
  useEffect(() => {
    if (unreadReminderSet === '') {
      acknowledgedReminderSetRef.current = '';
      return;
    }
    if (
      activeFilter.type !== 'reminders' ||
      acknowledgedReminderSetRef.current === unreadReminderSet
    ) return;
    acknowledgedReminderSetRef.current = unreadReminderSet;
    void acknowledgeDue().catch(() => {
      acknowledgedReminderSetRef.current = '';
    });
  }, [acknowledgeDue, activeFilter.type, unreadReminderSet]);
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
  if (activeFilter.type === 'tag' && activeFilter.tagId === null) {
    return <Navigate to="/inbox" replace search={{}} />;
  }

  return (
    <div
      className={styles.app}
      {...sidebarSwipe.handlers}
      style={sidebarSwipe.drag === null ? undefined : {
        '--sidebar-drag-offset': `${String(sidebarSwipe.drag.offset)}px`,
        '--sidebar-drag-transition': 'none',
        '--sidebar-backdrop-opacity': sidebarSwipe.drag.progress,
      } as CSSProperties}
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
            sidebarOpen={sidebarOpen || sidebarSwipe.drag !== null}
            onSidebarClose={handleSidebarClose}
            isMobile={isMobile}
            sidebar={(
              <SidebarContainer
                advancedModeEnabled={appSettings.advancedModeEnabled}
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
              <ChatPanel advancedModeEnabled={appSettings.advancedModeEnabled} />
            ) : (
              <NotesPanel
                key={filterKey(activeFilter)}
                searchInputRef={searchInputRef}
                displayedNotes={displayedNotes}
                remindersByNoteId={remindersByNoteId}
                selectedNoteIds={selectedNoteIds}
                setSelectedNoteIds={setSelectedNoteIds}
                autoApplyActiveTag={autoApplyActiveTag}
                isMobile={isMobile}
                linkPreviewDisplayEnabled={appSettings.linkPreviewDisplayEnabled}
                quickAddAutofocusEnabled={appSettings.quickAddAutofocusEnabled}
                advancedModeEnabled={appSettings.advancedModeEnabled}
                showSettings={showSettings}
              />
            )}
          </AppLayout>
        </Suspense>
      </main>
      {showExportModal && selectedNoteIds.size > 0 && (
        <ExportModal
          notes={selectedNotes}
          deletesPermanently={isTrashView}
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
const remindersRoute = createRoute({ getParentRoute: () => rootRoute, path: 'reminders', component: KeeperApp });
const duplicatesRoute = createRoute({ getParentRoute: () => rootRoute, path: 'duplicates', component: KeeperApp });
const trashRoute = createRoute({ getParentRoute: () => rootRoute, path: 'trash', component: KeeperApp });
const shareRoute = createRoute({ getParentRoute: () => rootRoute, path: 'share', component: KeeperApp });
const tagRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'tag/$tagName',
  params: {
    parse: ({ tagName }) => {
      return tagName !== '' ? { tagName } : false;
    },
    stringify: ({ tagName }) => ({ tagName }),
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
  remindersRoute,
  duplicatesRoute,
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
