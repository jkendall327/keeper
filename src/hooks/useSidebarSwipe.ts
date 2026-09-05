import { useRef, useState, type PointerEvent, type MouseEvent } from 'react';

interface Swipe {
  pointerId: number;
  x: number;
  y: number;
  startedAt: number;
  width: number;
  wasOpen: boolean;
  dragging: boolean;
  distance: number;
}

export function useSidebarSwipe(isMobile: boolean, isOpen: boolean, setOpen: (open: boolean) => void) {
  const swipe = useRef<Swipe | null>(null);
  const suppressClickUntil = useRef(0);
  const [drag, setDrag] = useState<{ offset: number; progress: number } | null>(null);

  const reset = () => {
    swipe.current = null;
    setDrag(null);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // A second finger cancels the drawer gesture so pinch zoom can take over.
    if (swipe.current !== null) {
      reset();
      return;
    }
    if (!isMobile || event.pointerType !== 'touch' || !event.isPrimary) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"]') !== null) return;
    if (event.currentTarget.querySelector('[role="dialog"]') !== null) return;
    if (!isOpen && event.clientX > Math.min(window.innerWidth * 0.25, 120)) return;
    const sidebar = event.currentTarget.querySelector('[aria-label="Sidebar"]');
    const width = sidebar?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    swipe.current = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      startedAt: event.timeStamp, width, wasOpen: isOpen, dragging: false, distance: 0,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    if (start?.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.dragging) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.5 || (start.wasOpen ? dx >= 0 : dx <= 0)) {
        reset();
        return;
      }
      start.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    start.distance = Math.max(0, Math.min(start.width, start.wasOpen ? -dx : dx));
    const visible = start.wasOpen ? start.width - start.distance : start.distance;
    setDrag({ offset: visible - start.width, progress: visible / start.width });
  };

  const finish = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const start = swipe.current;
    if (start?.pointerId !== event.pointerId) return;
    if (start.dragging) {
      suppressClickUntil.current = Date.now() + 400;
      const elapsed = Math.max(1, event.timeStamp - start.startedAt);
      const committed = start.distance >= start.width * 0.25 ||
        (start.distance >= 24 && start.distance / elapsed >= 0.5);
      if (!cancelled && committed) setOpen(!start.wasOpen);
    }
    reset();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressClickUntil.current && event.detail !== 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return {
    drag,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => { finish(event, false); },
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => { finish(event, true); },
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => {
        // Touch starts with implicit capture on the original child. Its loss
        // bubbles here when we transfer capture to the app for the drag.
        if (event.target === event.currentTarget) finish(event, true);
      },
      onClickCapture,
    },
  };
}
