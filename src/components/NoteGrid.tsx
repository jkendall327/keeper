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
    if (target.closest('.note-card')) return;

    const wrapper = wrapperRef.current;
    if (!wrapper) return;
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
      if (!drag) return;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;

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
      if (!drag) return;

      dragRef.current = null;
      isDraggingRef.current = false;
      setSelRect(null);
      document.body.classList.remove('is-drag-selecting');

      if (wasDragging) {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
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
            if (id) matched.add(id);
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

  const handleNoteSelect = useCallback((note: NoteWithTags) => {
    // If we just finished a drag, don't open the modal
    if (isDraggingRef.current) return;
    onSelect(note);
  }, [onSelect]);

  if (notes.length === 0) {
    return <p className="empty-state">No notes yet. Start typing above.</p>;
  }

  const pinnedNotes = notes.filter((note) => note.pinned && !note.archived);
  const regularNotes = notes.filter((note) => !note.pinned && !note.archived);
  const archivedNotes = notes.filter((note) => note.archived);

  const renderGroup = (group: NoteWithTags[]) => (
    <div className="note-grid">
      {group.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onSelect={handleNoteSelect}
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
      {selRect && (
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
