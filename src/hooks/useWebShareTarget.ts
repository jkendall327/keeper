import { useEffect } from 'react';
import type { CreateNoteInput } from '../db/types.ts';

interface UseWebShareTargetOptions {
  createNote: (input: CreateNoteInput) => Promise<unknown>;
}

export function useWebShareTarget({ createNote }: UseWebShareTargetOptions) {
  useEffect(() => {
    if (window.location.pathname !== '/share') return;
    const params = new URLSearchParams(window.location.search);
    const title = params.get('title') ?? '';
    const text = params.get('text') ?? '';
    const url = params.get('url') ?? '';

    const parts: string[] = [];
    if (title !== '') parts.push(title);
    if (text !== '') parts.push(text);
    if (url !== '' && url !== text) parts.push(url);
    const body = parts.join('\n');

    if (body !== '') {
      void createNote({ body });
    }
    window.history.replaceState(null, '', '/');
  }, [createNote]);
}
