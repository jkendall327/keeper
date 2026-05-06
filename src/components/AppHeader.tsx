import { useRef, useState } from 'react';
import type { Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { TagApplier } from './TagApplier.tsx';
import type { useDB } from '../hooks/useDB.ts';
import type { useBulkNoteActions } from '../hooks/useBulkNoteActions.ts';
import styles from './AppHeader.module.css';

type DB = ReturnType<typeof useDB>;

interface AppHeaderProps {
  allTags: Tag[];
  bulkActions: ReturnType<typeof useBulkNoteActions>;
  isArchiveView: boolean;
  isInboxView: boolean;
  isMobile: boolean;
  isTrashView: boolean;
  onAddTagToNotes: DB['addTagToNotes'];
  onOpenExport: () => void;
  onRemoveTagFromNotes: DB['removeTagFromNotes'];
  onToggleSidebar: () => void;
}

export function AppHeader({
  allTags,
  bulkActions,
  isArchiveView,
  isInboxView,
  isMobile,
  isTrashView,
  onAddTagToNotes,
  onOpenExport,
  onRemoveTagFromNotes,
  onToggleSidebar,
}: AppHeaderProps) {
  const cx = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' ');
  const [showBulkTagApplier, setShowBulkTagApplier] = useState(false);
  const bulkTagBtnRef = useRef<HTMLButtonElement>(null);
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
      <div className={styles.left}>
        {isMobile && (
          <button
            className={styles.hamburgerButton}
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
          >
            <Icon name="menu" size={24} />
          </button>
        )}
        {!isMobile && <h1 className={styles.title}>Keeper</h1>}
      </div>
      <div className={styles.actions}>
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
            <span className={styles.bulkCount}>{selectedNoteIds.size} selected</span>
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
              className={cx(styles.actionButton, styles.deleteButton)}
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
