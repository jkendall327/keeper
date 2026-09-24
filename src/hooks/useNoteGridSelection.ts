import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { toNoteId, type NoteId } from '../db/types.ts';

interface DragState {
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  additive: boolean;
  initialSelectedNoteIds: Set<NoteId>;
}

const DRAG_THRESHOLD = 5;

export function useNoteGridSelection(
  selectedNoteIds: Set<NoteId>,
  onBulkSelect: (ids: Set<NoteId>) => void,
  onClearSelection: () => void,
) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rectangleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const isDraggingRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  const handleMouseDown = (event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-note-id], a, button, input, textarea, select, [contenteditable="true"]') !== null) return;
    const wrapper = wrapperRef.current;
    if (wrapper === null) return;
    const rect = wrapper.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX - rect.left + wrapper.scrollLeft,
      startY: event.clientY - rect.top + wrapper.scrollTop,
      clientX: event.clientX,
      clientY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      initialSelectedNoteIds: new Set(selectedNoteIds),
    };
    isDraggingRef.current = false;
  };

  useEffect(() => {
    const cancelFrame = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };

    const reset = () => {
      cancelFrame();
      dragRef.current = null;
      isDraggingRef.current = false;
      if (rectangleRef.current !== null) rectangleRef.current.hidden = true;
      document.body.classList.remove('is-drag-selecting');
    };

    const measure = () => {
      const drag = dragRef.current;
      const wrapper = wrapperRef.current;
      if (drag === null || wrapper === null) return null;
      const rect = wrapper.getBoundingClientRect();
      const originX = rect.left - wrapper.scrollLeft;
      const originY = rect.top - wrapper.scrollTop;
      const currentX = drag.clientX - originX;
      const currentY = drag.clientY - originY;
      const dx = currentX - drag.startX;
      const dy = currentY - drag.startY;
      if (!isDraggingRef.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return null;
      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        document.body.classList.add('is-drag-selecting');
      }
      return {
        left: originX + Math.min(drag.startX, currentX),
        top: originY + Math.min(drag.startY, currentY),
        width: Math.abs(dx),
        height: Math.abs(dy),
      };
    };

    const draw = () => {
      frameRef.current = null;
      const bounds = measure();
      const rectangle = rectangleRef.current;
      if (bounds === null || rectangle === null) return;
      rectangle.style.transform = `translate(${String(bounds.left)}px, ${String(bounds.top)}px)`;
      rectangle.style.width = `${String(bounds.width)}px`;
      rectangle.style.height = `${String(bounds.height)}px`;
      rectangle.hidden = false;
    };

    const scheduleDraw = () => {
      if (dragRef.current !== null && frameRef.current === null) {
        frameRef.current = requestAnimationFrame(draw);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (drag === null) return;
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      scheduleDraw();
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      const wrapper = wrapperRef.current;
      if (drag === null || wrapper === null) return;
      cancelFrame();
      // Use the latest pointer position even if mouseup precedes the next frame.
      const bounds = measure();
      const matched = new Set<NoteId>();
      if (bounds !== null) {
        const right = bounds.left + bounds.width;
        const bottom = bounds.top + bounds.height;
        // The only population-sized work happens once, when the drag finishes.
        for (const card of wrapper.querySelectorAll<HTMLElement>('[data-note-id]')) {
          const rect = card.getBoundingClientRect();
          if (bounds.left < rect.right && right > rect.left && bounds.top < rect.bottom && bottom > rect.top) {
            const id = card.getAttribute('data-note-id');
            if (id !== null) matched.add(toNoteId(id));
          }
        }
      }
      reset();
      if (bounds === null) {
        onClearSelection();
      } else if (matched.size > 0) {
        const nextSelection = drag.additive ? drag.initialSelectedNoteIds : new Set<NoteId>();
        for (const id of matched) nextSelection.add(id);
        onBulkSelect(nextSelection);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') reset();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    // Keep the starting point anchored to the notes if scrolling during a drag.
    document.addEventListener('scroll', scheduleDraw, true);
    window.addEventListener('blur', reset);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scroll', scheduleDraw, true);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, [onBulkSelect, onClearSelection]);

  return { wrapperRef, rectangleRef, isDraggingRef, handleMouseDown };
}
