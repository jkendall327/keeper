import { useRef, useState } from 'react';
import type { Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { TagApplier } from './TagApplier.tsx';
import type { useDB } from '../hooks/useDB.ts';
import type { useBulkNoteActions } from '../hooks/useBulkNoteActions.ts';

type DB = ReturnType<typeof useDB>;

interface AppHeaderProps {
  allTags: Tag[];
  bulkActions: ReturnType<typeof useBulkNoteActions>;
  isArchiveView: boolean;
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
  isMobile,
  isTrashView,
  onAddTagToNotes,
  onOpenExport,
  onRemoveTagFromNotes,
  onToggleSidebar,
}: AppHeaderProps) {
  const [showBulkTagApplier, setShowBulkTagApplier] = useState(false);
  const bulkTagBtnRef = useRef<HTMLButtonElement>(null);
  const {
    autoTagStatus,
    bulkAppliedTags,
    bulkIndeterminateTags,
    displayedNoteIds,
    handleBulkArchive,
    handleBulkDelete,
    handleBulkRestore,
    handleRunAutoTagRules,
    handleSelectAll,
    selectedNoteIds,
  } = bulkActions;
  const displayedNoteCount = displayedNoteIds.length;
  const allDisplayedSelected = selectedNoteIds.size === displayedNoteCount && displayedNoteCount > 0;

  return (
    <header className="app-header">
      <div className="app-header-left">
        {isMobile && (
          <button
            className="hamburger-btn"
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
          >
            <Icon name="menu" size={24} />
          </button>
        )}
        {!isMobile && <h1>Keeper</h1>}
      </div>
      <div className="app-header-actions">
        {autoTagStatus !== '' && (
          <span className="autotag-run-status" role="status">{autoTagStatus}</span>
        )}
        <button
          className="bulk-action-btn autotag-run-btn"
          onClick={() => { void handleRunAutoTagRules(); }}
          title="Run autotag rules"
          aria-label="Run autotag rules"
        >
          <Icon name="auto_mode" size={20} />
        </button>
        {displayedNoteCount > 0 && (
          <button
            className="bulk-action-btn select-all-btn"
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
          <div className="bulk-actions">
            <span className="bulk-count">{selectedNoteIds.size} selected</span>
            {isTrashView && (
              <button
                className="bulk-action-btn bulk-archive-btn"
                onClick={() => { void handleBulkRestore(); }}
                title="Restore"
              >
                {isMobile ? <Icon name="restore_from_trash" size={20} /> : 'Restore'}
              </button>
            )}
            {!isTrashView && (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  ref={bulkTagBtnRef}
                  className="bulk-action-btn"
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
                className="bulk-action-btn bulk-archive-btn"
                onClick={() => { void handleBulkArchive(); }}
                title="Archive"
              >
                {isMobile ? <Icon name="archive" size={20} /> : 'Archive'}
              </button>
            )}
            {!isMobile && (
              <button
                className="bulk-action-btn bulk-export-btn"
                onClick={onOpenExport}
              >
                Export
              </button>
            )}
            <button
              className="bulk-action-btn bulk-delete-btn"
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
