import { useEffect, useRef } from 'react';

interface UseExtensionBadgeOptions {
  enabled: boolean;
  extensionNoteCreatedCount: number;
}

export function useExtensionBadge({
  enabled,
  extensionNoteCreatedCount,
}: UseExtensionBadgeOptions) {
  const titleBase = useRef(document.title);
  const enabledRef = useRef(enabled);
  const currentCountRef = useRef(extensionNoteCreatedCount);
  const previousCountRef = useRef(extensionNoteCreatedCount);
  const unseenCountRef = useRef(0);

  useEffect(() => {
    const updateTitle = () => {
      if (!enabledRef.current || unseenCountRef.current === 0) {
        document.title = titleBase.current;
        return;
      }
      document.title = `(${String(unseenCountRef.current)}) ${titleBase.current}`;
    };

    enabledRef.current = enabled;
    currentCountRef.current = extensionNoteCreatedCount;

    if (!enabled) {
      unseenCountRef.current = 0;
      previousCountRef.current = extensionNoteCreatedCount;
      updateTitle();
      return;
    }

    const delta = extensionNoteCreatedCount - previousCountRef.current;
    previousCountRef.current = extensionNoteCreatedCount;

    if (document.visibilityState === 'visible' && document.hasFocus()) {
      unseenCountRef.current = 0;
    } else if (delta > 0) {
      unseenCountRef.current += delta;
    }

    updateTitle();
  }, [enabled, extensionNoteCreatedCount]);

  useEffect(() => {
    const clearIfFocused = () => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
      unseenCountRef.current = 0;
      previousCountRef.current = currentCountRef.current;
      document.title = titleBase.current;
    };

    window.addEventListener('focus', clearIfFocused);
    document.addEventListener('visibilitychange', clearIfFocused);
    return () => {
      window.removeEventListener('focus', clearIfFocused);
      document.removeEventListener('visibilitychange', clearIfFocused);
    };
  }, []);
}
