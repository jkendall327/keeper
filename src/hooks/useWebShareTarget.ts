import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { CreateNoteInput } from '../db/types.ts';

interface UseWebShareTargetOptions {
  createNote: (input: CreateNoteInput) => Promise<unknown>;
}

export function useWebShareTarget({ createNote }: UseWebShareTargetOptions) {
  const navigate = useNavigate();
  const processedShareUrl = useRef<string | null>(null);

  useEffect(() => {
    if (window.location.pathname !== '/share') return;
    const shareUrl = window.location.href;
    if (processedShareUrl.current === shareUrl) return;
    processedShareUrl.current = shareUrl;

    const params = new URLSearchParams(window.location.search);
    const title = params.get('title') ?? '';
    const text = params.get('text') ?? '';
    const url = params.get('url') ?? '';

    const parts: string[] = [];
    if (title !== '') parts.push(title);
    if (text !== '') parts.push(text);
    if (url !== '' && url !== text) parts.push(url);
    const body = parts.join('\n');

    void (async () => {
      if (body !== '') {
        await createNote({ body });
      }

      await navigate({ to: '/inbox', replace: true, search: {} });
    })();
  }, [createNote, navigate]);
}
