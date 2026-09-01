import { memo, useRef, useState, useEffect, type ReactNode } from 'react';
import { toNoteId, type NoteId, type NoteWithTags, type Tag } from '../db/types.ts';
import { NoteCard } from './NoteCard.tsx';
import type { NoteCommands } from './note-commands.ts';
import styles from './NoteGrid.module.css';

interface NoteGridProps {
  notes: NoteWithTags[];
  allTags: Tag[];
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

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  initialSelectedNoteIds: Set<NoteId>;
}

const DRAG_THRESHOLD = 5;
const DEFER_RICH_PREVIEWS_THRESHOLD = 200;

export const NoteGrid = memo(function NoteGrid({
  notes, allTags, onSelect, noteCommands, selectedNoteIds, onBulkSelect, onClearSelection,
  showLinkPreviews, isMobile, isTrashView, preserveOrder = false, topContent,
}: NoteGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const isDraggingRef = useRef(false);
  const [selRect, setSelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only left button, and not on a note card or interactive element
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-note-id]') !== null) return;
    if (target.closest('a, button, input, textarea, select, [contenteditable="true"]') !== null) return;

    const wrapper = wrapperRef.current;
    if (wrapper === null) return;
    const rect = wrapper.getBoundingClientRect();
    const wx = e.clientX - rect.left + wrapper.scrollLeft;
    const wy = e.clientY - rect.top + wrapper.scrollTop;

    dragRef.current = {
      startX: wx,
      startY: wy,
      currentX: wx,
      currentY: wy,
      additive: e.ctrlKey || e.metaKey,
      initialSelectedNoteIds: new Set(selectedNoteIds),
    };
    isDraggingRef.current = false;
  };

  // Attach mousemove / mouseup on document so the selection rectangle
  // keeps tracking even when the pointer leaves the note grid wrapper.
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const wrapper = wrapperRef.current;
      if (wrapper === null) return;

      const rect = wrapper.getBoundingClientRect();
      drag.currentX = e.clientX - rect.left + wrapper.scrollLeft;
      drag.currentY = e.clientY - rect.top + wrapper.scrollTop;

      const dx = drag.currentX - drag.startX;
      const dy = drag.currentY - drag.startY;
      if (!isDraggingRef.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;

      isDraggingRef.current = true;
      document.body.classList.add('is-drag-selecting');
      setSelRect({
        x: Math.min(drag.startX, drag.currentX),
        y: Math.min(drag.startY, drag.currentY),
        w: Math.abs(dx),
        h: Math.abs(dy),
      });
    };

    const handleMouseUp = () => {
      const wasDragging = isDraggingRef.current;
      const drag = dragRef.current;

      // If no drag was initiated from the wrapper, ignore this mouseup
      // (e.g. clicks on header buttons should not clear selection).
      if (drag === null) return;

      dragRef.current = null;
      isDraggingRef.current = false;
      setSelRect(null);
      document.body.classList.remove('is-drag-selecting');

      if (wasDragging) {
        const wrapper = wrapperRef.current;
        if (wrapper === null) return;
        const wrapperRect = wrapper.getBoundingClientRect();

        const selLeft = Math.min(drag.startX, drag.currentX);
        const selTop = Math.min(drag.startY, drag.currentY);
        const selRight = Math.max(drag.startX, drag.currentX);
        const selBottom = Math.max(drag.startY, drag.currentY);

        const matched = new Set<NoteId>();
        const cards = wrapper.querySelectorAll<HTMLElement>('[data-note-id]');
        for (const card of cards) {
          const cardRect = card.getBoundingClientRect();
          const cardRel = {
            left: cardRect.left - wrapperRect.left + wrapper.scrollLeft,
            top: cardRect.top - wrapperRect.top + wrapper.scrollTop,
            right: cardRect.right - wrapperRect.left + wrapper.scrollLeft,
            bottom: cardRect.bottom - wrapperRect.top + wrapper.scrollTop,
          };
          if (selLeft < cardRel.right && selRight > cardRel.left && selTop < cardRel.bottom && selBottom > cardRel.top) {
            const id = card.getAttribute('data-note-id');
            if (id !== null) matched.add(toNoteId(id));
          }
        }
        if (matched.size > 0) {
          const nextSelection = drag.additive ? new Set(drag.initialSelectedNoteIds) : new Set<NoteId>();
          for (const id of matched) {
            nextSelection.add(id);
          }
          onBulkSelect(nextSelection);
        }
      } else {
        onClearSelection();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onBulkSelect, onClearSelection]);

  const lastClickedRef = useRef<NoteId | null>(null);

  const pinnedNotes = preserveOrder ? [] : notes.filter((note) => note.pinned && !note.archived);
  const regularNotes = preserveOrder ? notes : notes.filter((note) => !note.pinned && !note.archived);
  const archivedNotes = preserveOrder ? [] : notes.filter((note) => note.archived);
  const flatNotes = preserveOrder ? notes : [...pinnedNotes, ...regularNotes, ...archivedNotes];
  const deferRichPreviews = notes.length > DEFER_RICH_PREVIEWS_THRESHOLD;

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
          allTags={allTags}
          onSelect={handleNoteClick}
          onSelectionToggle={handleLongPress}
          onLongPress={handleLongPress}
          noteCommands={noteCommands}
          isSelected={selectedNoteIds.has(note.id)}
          showLinkPreviews={showLinkPreviews}
          deferRichPreview={deferRichPreviews}
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
      {selRect !== null && (
        <div
          className={styles.selectionRectangle}
          style={{
            left: selRect.x,
            top: selRect.y,
            width: selRect.w,
            height: selRect.h,
          }}
        />
      )}
    </div>
  );
}, noteGridPropsEqual);

function noteGridPropsEqual(previous: NoteGridProps, next: NoteGridProps) {
  return previous.notes === next.notes &&
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
