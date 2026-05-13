import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useNoteModalInitialFocus(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      panelRef.current?.focus();
      return;
    }

    const textarea = textareaRef.current;
    if (textarea !== null) {
      textarea.focus();
      const len = textarea.value.length;
      textarea.setSelectionRange(len, len);
      return;
    }

    panelRef.current?.focus();
  }, [panelRef, textareaRef]);
}
