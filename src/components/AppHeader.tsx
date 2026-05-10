import { useRef, useState, type RefObject } from 'react';
import { clsx } from 'clsx';
import type { Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { SearchBar } from './SearchBar.tsx';
import { TagApplier } from './TagApplier.tsx';
import type { useBulkNoteActions } from '../hooks/useBulkNoteActions.ts';
import { useKeeperRouteState } from '../hooks/useKeeperRouteState.ts';
import type { NoteId } from '../db/types.ts';
import styles from './AppHeader.module.css';

interface AppHeaderProps {
  allTags: Tag[];
  bulkActions: ReturnType<typeof useBulkNoteActions>;
  isMobile: boolean;
  onAddTagToNotes: (noteIds: NoteId[], tagName: string) => Promise<void>;
  onOpenExport: () => void;
  onRemoveTagFromNotes: (noteIds: NoteId[], tagName: string) => Promise<void>;
  onToggleSidebar: () => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

export function AppHeader({
  allTags,
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
  const { activeFilter, searchQuery, setSearchQuery } = useKeeperRouteState();
  const isArchiveView = activeFilter.type === 'archive';
  const isInboxView = activeFilter.type === 'all';
  const isTrashView = activeFilter.type === 'trash';
  const {
    autoTagStatus,
    bulkAppliedTags,
    bulkIndeterminateTags,
    displayedNoteIds,
    handleArchiveTaggedInboxNotes,
    handleBulkArchive,
    handleBulkDelete,
    handleBulkRestore,
    handleRunAutoTagRules,
    handleSelectAll,
    selectedNoteIds,
    taggedInboxNoteIds,
  } = bulkActions;
  const displayedNoteCount = displayedNoteIds.length;
  const allDisplayedSelected = selectedNoteIds.size === displayedNoteCount && displayedNoteCount > 0;

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
        <SearchBar ref={searchInputRef} value={searchQuery} onChange={setSearchQuery} />
      </div>
      <div className={styles.actions}>
        {selectedNoteIds.size > 0 && (
          <span className={styles.bulkCount}>{selectedNoteIds.size} selected</span>
        )}
        {autoTagStatus !== '' && (
          <span className={styles.status} role="status">{autoTagStatus}</span>
        )}
        <button
          className={styles.actionButton}
          onClick={() => { void handleRunAutoTagRules(); }}
          title="Run autotag rules"
          aria-label="Run autotag rules"
        >
          <Icon name="auto_mode" size={20} />
        </button>
        {isInboxView && (
          <button
            className={styles.actionButton}
            onClick={() => { void handleArchiveTaggedInboxNotes(); }}
            title="Archive tagged notes"
            aria-label="Archive tagged notes"
            disabled={taggedInboxNoteIds.length === 0}
          >
            {isMobile ? <Icon name="archive" size={20} /> : 'Archive tagged'}
          </button>
        )}
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
                    onAddTag={onAddTagToNotes}
                    onRemoveTag={onRemoveTagFromNotes}
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
