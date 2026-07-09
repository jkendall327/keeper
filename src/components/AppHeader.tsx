import { useRef, useState, type RefObject } from 'react';
import { clsx } from 'clsx';
import { Icon } from './Icon.tsx';
import { SearchBar } from './SearchBar.tsx';
import { TagApplier } from './TagApplier.tsx';
import type { useBulkNoteActions } from '../hooks/useBulkNoteActions.ts';
import { useKeeperRouteState } from '../hooks/useKeeperRouteState.ts';
import { useTags } from '../hooks/useKeeperQuery.ts';
import type { NoteId } from '../db/types.ts';
import styles from './AppHeader.module.css';

interface AppHeaderProps {
  bulkActions: ReturnType<typeof useBulkNoteActions>;
  isMobile: boolean;
  onAddTagToNotes: (noteIds: NoteId[], tagName: string) => Promise<void>;
  onOpenExport: () => void;
  onRemoveTagFromNotes: (noteIds: NoteId[], tagName: string) => Promise<void>;
  onToggleSidebar: () => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

export function AppHeader({
  bulkActions,
  isMobile,
  onAddTagToNotes,
  onOpenExport,
  onRemoveTagFromNotes,
  onToggleSidebar,
  searchInputRef,
}: AppHeaderProps) {
  const [showBulkTagApplier, setShowBulkTagApplier] = useState(false);
  const bulkTagBtnRef = useRef<HTMLButtonElement>(null);
  const { data: allTags } = useTags();
  const { activeFilter, searchQuery, setSearchQuery } = useKeeperRouteState();
  const isArchiveView = activeFilter.type === 'archive';
  const isTrashView = activeFilter.type === 'trash';
  const {
    bulkAppliedTags,
    bulkIndeterminateTags,
    clearSelection,
    cleanupEnabled,
    cleanupStatus,
    displayedNoteIds,
    handleBulkArchive,
    handleBulkDelete,
    handleBulkRestore,
    handleRunCleanupActions,
    handleSelectAll,
    selectedNoteIds,
  } = bulkActions;
  const displayedNoteCount = displayedNoteIds.length;
  const allDisplayedSelected = selectedNoteIds.size === displayedNoteCount && displayedNoteCount > 0;
  const handleAddTagToSelectedNotes = async (noteIds: NoteId[], tagName: string) => {
    await onAddTagToNotes(noteIds, tagName);
    clearSelection();
  };
  const handleRemoveTagFromSelectedNotes = async (noteIds: NoteId[], tagName: string) => {
    await onRemoveTagFromNotes(noteIds, tagName);
    clearSelection();
  };

  return (
    <header className={styles.header}>
      {isMobile && (
        <button
          className={styles.hamburgerButton}
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <Icon name="menu" size={24} />
        </button>
      )}
      <div className={styles.search}>
        <SearchBar ref={searchInputRef} isMobile={isMobile} value={searchQuery} onChange={setSearchQuery} />
      </div>
      <div className={styles.actions}>
        {selectedNoteIds.size > 0 && (
          <span className={styles.bulkCount}>{selectedNoteIds.size} selected</span>
        )}
        {cleanupStatus !== '' && (
          <span className={styles.status} role="status">{cleanupStatus}</span>
        )}
        <button
          className={styles.actionButton}
          onClick={() => { void handleRunCleanupActions(); }}
          title="Clean up notes"
          aria-label="Clean up notes"
          disabled={!cleanupEnabled}
        >
          <Icon name="auto_mode" size={20} />
        </button>
        {displayedNoteCount > 0 && (
          <button
            className={styles.actionButton}
            onClick={handleSelectAll}
            title={allDisplayedSelected ? 'Deselect All' : 'Select All'}
          >
            {isMobile
              ? <Icon name={allDisplayedSelected ? 'deselect' : 'select_all'} size={20} />
              : allDisplayedSelected
                ? 'Deselect All'
                : 'Select All'}
          </button>
        )}
        {selectedNoteIds.size > 0 && (
          <div className={styles.bulkActions}>
            {isTrashView && (
              <button
                className={styles.actionButton}
                onClick={() => { void handleBulkRestore(); }}
                title="Restore"
              >
                {isMobile ? <Icon name="restore_from_trash" size={20} /> : 'Restore'}
              </button>
            )}
            {!isTrashView && (
              <div className={styles.tagButtonWrap}>
                <button
                  ref={bulkTagBtnRef}
                  className={styles.actionButton}
                  onClick={() => { setShowBulkTagApplier((v) => !v); }}
                  title="Label"
                >
                  {isMobile ? <Icon name="label" size={20} /> : 'Label'}
                </button>
                {showBulkTagApplier && (
                  <TagApplier
                    noteIds={Array.from(selectedNoteIds)}
                    appliedTags={bulkAppliedTags}
                    indeterminateTags={bulkIndeterminateTags}
                    allTags={allTags}
                    onAddTag={handleAddTagToSelectedNotes}
                    onRemoveTag={handleRemoveTagFromSelectedNotes}
                    onClose={() => { setShowBulkTagApplier(false); }}
                    anchorRef={bulkTagBtnRef}
                    direction="down"
                  />
                )}
              </div>
            )}
            {!isArchiveView && !isTrashView && (
              <button
                className={styles.actionButton}
                onClick={() => { void handleBulkArchive(); }}
                title="Archive"
              >
                {isMobile ? <Icon name="archive" size={20} /> : 'Archive'}
              </button>
            )}
            {!isMobile && (
              <button
                className={styles.actionButton}
                onClick={onOpenExport}
              >
                Export
              </button>
            )}
            <button
              className={clsx(styles.actionButton, styles.deleteButton)}
              onClick={() => { void handleBulkDelete(); }}
              title="Delete"
            >
              {isMobile ? <Icon name="delete" size={20} /> : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
