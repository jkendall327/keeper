import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useNoteModalInitialFocus(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
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
