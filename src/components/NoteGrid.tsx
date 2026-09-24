import { memo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNoteGridSelection } from '../hooks/useNoteGridSelection.ts';
import { type NoteId, type NoteWithTags, type Reminder, type Tag } from '../db/types.ts';
import { NoteCard } from './NoteCard.tsx';
import type { NoteCommands } from './note-commands.ts';
import styles from './NoteGrid.module.css';

interface NoteGridProps {
  notes: NoteWithTags[];
  remindersByNoteId: ReadonlyMap<NoteId, Reminder>;
  allTags: Tag[];
  searchQuery?: string;
  substringSearch?: boolean;
  onTagSelect?: (tag: Tag) => void;
  onSelect: (note: NoteWithTags) => void;
  noteCommands: NoteCommands;
  selectedNoteIds: Set<NoteId>;
  onBulkSelect: (ids: Set<NoteId>) => void;
  onClearSelection: () => void;
  showLinkPreviews: boolean;
  isMobile: boolean;
  isTrashView?: boolean;
  preserveOrder?: boolean;
  topContent?: ReactNode;
}

export const NoteGrid = memo(function NoteGrid({
  notes, remindersByNoteId, allTags, onSelect, noteCommands, selectedNoteIds, onBulkSelect, onClearSelection,
  showLinkPreviews, isMobile, isTrashView, preserveOrder = false, topContent, searchQuery = '', substringSearch = false, onTagSelect,
}: NoteGridProps) {
  const { wrapperRef, rectangleRef, isDraggingRef, handleMouseDown } = useNoteGridSelection(
    selectedNoteIds, onBulkSelect, onClearSelection,
  );

  const lastClickedRef = useRef<NoteId | null>(null);

  const pinnedNotes = preserveOrder ? [] : notes.filter((note) => note.pinned && !note.archived);
  const regularNotes = preserveOrder ? notes : notes.filter((note) => !note.pinned && !note.archived);
  const archivedNotes = preserveOrder ? [] : notes.filter((note) => note.archived);
  const flatNotes = preserveOrder ? notes : [...pinnedNotes, ...regularNotes, ...archivedNotes];

  const handleNoteClick = (note: NoteWithTags, e?: React.MouseEvent) => {
    // If we just finished a drag, don't do anything
    if (isDraggingRef.current) return;

    if (e?.shiftKey === true && lastClickedRef.current !== null) {
      // Shift-click: range select
      const lastIdx = flatNotes.findIndex((n) => n.id === lastClickedRef.current);
      const curIdx = flatNotes.findIndex((n) => n.id === note.id);
      if (lastIdx !== -1 && curIdx !== -1) {
        const start = Math.min(lastIdx, curIdx);
        const end = Math.max(lastIdx, curIdx);
        const rangeIds = new Set(selectedNoteIds);
        for (let i = start; i <= end; i++) {
          const n = flatNotes[i];
          if (n !== undefined) rangeIds.add(n.id);
        }
        onBulkSelect(rangeIds);
      }
      return;
    }

    if (e?.ctrlKey === true || e?.metaKey === true) {
      // Ctrl/Cmd-click: toggle single note
      const newSet = new Set(selectedNoteIds);
      if (newSet.has(note.id)) {
        newSet.delete(note.id);
      } else {
        newSet.add(note.id);
      }
      lastClickedRef.current = note.id;
      onBulkSelect(newSet);
      return;
    }

    // If already in selection mode, plain tap toggles selection
    if (selectedNoteIds.size > 0) {
      const newSet = new Set(selectedNoteIds);
      if (newSet.has(note.id)) {
        newSet.delete(note.id);
      } else {
        newSet.add(note.id);
      }
      lastClickedRef.current = note.id;
      if (newSet.size === 0) {
        onClearSelection();
      } else {
        onBulkSelect(newSet);
      }
      return;
    }

    // Plain click: clear selection, open modal
    lastClickedRef.current = note.id;
    onClearSelection();
    onSelect(note);
  };

  const handleLongPress = (note: NoteWithTags) => {
    const newSet = new Set(selectedNoteIds);
    if (newSet.has(note.id)) {
      newSet.delete(note.id);
    } else {
      newSet.add(note.id);
    }
    lastClickedRef.current = note.id;
    if (newSet.size === 0) {
      onClearSelection();
    } else {
      onBulkSelect(newSet);
    }
  };

  const renderGroup = (group: NoteWithTags[]) => (
    <div className={styles.grid}>
      {group.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          searchQuery={searchQuery}
          substringSearch={substringSearch}
          {...(onTagSelect === undefined ? {} : { onTagSelect })}
          reminder={remindersByNoteId.get(note.id) ?? null}
          allTags={allTags}
          onSelect={handleNoteClick}
          onSelectionToggle={handleLongPress}
          onLongPress={handleLongPress}
          noteCommands={noteCommands}
          isSelected={selectedNoteIds.has(note.id)}
          showLinkPreviews={showLinkPreviews}
          isMobile={isMobile}
          {...(isTrashView !== undefined ? { isTrashView } : {})}
        />
      ))}
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      onMouseDown={handleMouseDown}
    >
      <div className={styles.content}>
        {topContent}
        {pinnedNotes.length > 0 && renderGroup(pinnedNotes)}
        {pinnedNotes.length > 0 && regularNotes.length > 0 && (
          <div className={styles.divider} />
        )}
        {regularNotes.length > 0 && renderGroup(regularNotes)}
        {(pinnedNotes.length > 0 || regularNotes.length > 0) && archivedNotes.length > 0 && (
          <div className={styles.divider} />
        )}
        {archivedNotes.length > 0 && renderGroup(archivedNotes)}
      </div>
      {createPortal(
        <div ref={rectangleRef} className={styles.selectionRectangle} hidden aria-hidden="true" />,
        document.body,
      )}
    </div>
  );
}, noteGridPropsEqual);

function noteGridPropsEqual(previous: NoteGridProps, next: NoteGridProps) {
  return previous.substringSearch === next.substringSearch &&
    previous.searchQuery === next.searchQuery &&
    previous.onTagSelect === next.onTagSelect &&
    previous.notes === next.notes &&
    previous.remindersByNoteId === next.remindersByNoteId &&
    previous.allTags === next.allTags &&
    previous.onSelect === next.onSelect &&
    previous.onBulkSelect === next.onBulkSelect &&
    previous.onClearSelection === next.onClearSelection &&
    previous.showLinkPreviews === next.showLinkPreviews &&
    previous.isMobile === next.isMobile &&
    previous.isTrashView === next.isTrashView &&
    previous.preserveOrder === next.preserveOrder &&
    previous.topContent === next.topContent &&
    setsEqual(previous.selectedNoteIds, next.selectedNoteIds);
}

function setsEqual<T>(previous: Set<T>, next: Set<T>) {
  if (previous === next) return true;
  if (previous.size !== next.size) return false;
  for (const value of previous) {
    if (!next.has(value)) return false;
  }
  return true;
}
