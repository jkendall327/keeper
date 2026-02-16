import { useRef, useState, useCallback, useEffect } from 'react';
import type { NoteWithTags, UpdateNoteInput } from '../db/types.ts';
import { NoteCard } from './NoteCard.tsx';

interface NoteGridProps {
  notes: NoteWithTags[];
  onSelect: (note: NoteWithTags) => void;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string) => Promise<void>;
  onToggleArchive: (id: string) => Promise<void>;
  previewMode: boolean;
  onUpdateNote: (input: UpdateNoteInput) => Promise<void>;
  selectedNoteIds: Set<string>;
  onBulkSelect: (ids: Set<string>) => void;
  onClearSelection: () => void;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const DRAG_THRESHOLD = 5;

export function NoteGrid({
  notes, onSelect, onDelete, onTogglePin, onToggleArchive,
  previewMode, onUpdateNote, selectedNoteIds, onBulkSelect, onClearSelection,
}: NoteGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const isDraggingRef = useRef(false);
  const [selRect, setSelRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only left button, and not on a note card or interactive element
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.note-card') !== null) return;

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
    };
    isDraggingRef.current = false;
  }, []);

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

        const matched = new Set<string>();
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
            if (id !== null) matched.add(id);
          }
        }
        if (matched.size > 0) {
          onBulkSelect(matched);
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

  const lastClickedRef = useRef<string | null>(null);

  if (notes.length === 0) {
    return null;
  }

  const pinnedNotes = notes.filter((note) => note.pinned && !note.archived);
  const regularNotes = notes.filter((note) => !note.pinned && !note.archived);
  const archivedNotes = notes.filter((note) => note.archived);
  const flatNotes = [...pinnedNotes, ...regularNotes, ...archivedNotes];

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

    // Plain click: clear selection, open modal
    lastClickedRef.current = note.id;
    onClearSelection();
    onSelect(note);
  };

  const renderGroup = (group: NoteWithTags[]) => (
    <div className="note-grid">
      {group.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onSelect={handleNoteClick}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
          onToggleArchive={onToggleArchive}
          previewMode={previewMode}
          onUpdate={onUpdateNote}
          isSelected={selectedNoteIds.has(note.id)}
        />
      ))}
    </div>
  );

  return (
    <div
      ref={wrapperRef}
      className="note-grid-wrapper"
      onMouseDown={handleMouseDown}
    >
      {pinnedNotes.length > 0 && renderGroup(pinnedNotes)}
      {pinnedNotes.length > 0 && regularNotes.length > 0 && (
        <div className="note-grid-divider" />
      )}
      {regularNotes.length > 0 && renderGroup(regularNotes)}
      {(pinnedNotes.length > 0 || regularNotes.length > 0) && archivedNotes.length > 0 && (
        <div className="note-grid-divider" />
      )}
      {archivedNotes.length > 0 && renderGroup(archivedNotes)}
      {selRect !== null && (
        <div
          className="selection-rectangle"
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
}
