import { useEffect } from 'react';
import type { RefObject } from 'react';

export function useAutosizingTextarea(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${String(textarea.scrollHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > textarea.clientHeight + 1 ? 'auto' : 'hidden';
  }, [textareaRef, value]);
}
