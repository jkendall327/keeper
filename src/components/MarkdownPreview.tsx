import { useMemo, useRef, useEffect, useState } from 'react';
import { markdown } from '@motioneffector/markdown';
import { getDB } from '../db/db-client.ts';

interface MarkdownPreviewProps {
  content: string;
  noteId?: string;
  onCheckboxToggle?: (newContent: string) => void;
  className?: string;
}

export function MarkdownPreview({
  content,
  noteId,
  onCheckboxToggle,
  className = '',
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  // Track URLs for cleanup without triggering re-renders
  const mediaUrlsRef = useRef<Map<string, string>>(new Map());

  // Load media and create blob URLs
  useEffect(() => {
    if (noteId === undefined) return;

    // Extract media IDs from markdown (inline to avoid React Compiler issues)
    const matches = content.matchAll(/media:\/\/([a-f0-9-]+)/gi);
    const mediaIds = Array.from(matches, (m) => m[1]).filter(
      (id): id is string => id !== undefined,
    );

    const createdUrls: string[] = [];

    const loadMedia = async () => {
      if (mediaIds.length === 0) {
        // Clean up any existing blob URLs if no media in content
        mediaUrlsRef.current.forEach((url) => { URL.revokeObjectURL(url); });
        mediaUrlsRef.current = new Map();
        setMediaUrls(new Map());
        return;
      }

      const db = getDB();
      const mediaList = await db.getMediaForNote(noteId);
      const blobUrlMap = new Map<string, string>();

      for (const mediaId of mediaIds) {
        const mediaItem = mediaList.find((m) => m.id === mediaId);
        if (mediaItem === undefined) continue;

        const buffer = await db.getMedia(mediaId);
        if (buffer !== null) {
          const blob = new Blob([buffer], { type: mediaItem.mime_type });
          const url = URL.createObjectURL(blob);
          blobUrlMap.set(mediaId, url);
          createdUrls.push(url);
        }
      }
      mediaUrlsRef.current = blobUrlMap;
      setMediaUrls(blobUrlMap);
    };

    void loadMedia();

    // CRITICAL: Cleanup to prevent memory leaks
    return () => {
      createdUrls.forEach((url) => { URL.revokeObjectURL(url); });
    };
  }, [content, noteId]);

  // Render markdown to HTML
  const rawHtml = useMemo(() => {
    try {
      return markdown(content, {
        breaks: true,
        linkTarget: '_blank',
        gfm: true,
      });
    } catch (err: unknown) {
      console.warn('Markdown rendering failed, showing raw content:', err);
      return content;
    }
  }, [content]);

  // Post-process HTML: replace media:// URLs and add rel attributes
  const html = useMemo(() => {
    let result = rawHtml;
    for (const [mediaId, blobUrl] of mediaUrls) {
      result = result.replaceAll(`media://${mediaId}`, blobUrl);
    }
    result = result.replaceAll('target="_blank"', 'target="_blank" rel="noopener noreferrer"');
    return result;
  }, [rawHtml, mediaUrls]);

  // Add checkbox interactivity
  useEffect(() => {
    if (containerRef.current === null || onCheckboxToggle === undefined) return;

    const container = containerRef.current;
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );

    const handleCheckboxClick = (index: number) => {
      // Find all checkbox patterns in the original markdown
      const checkboxPattern = /\[( |x|X)\]/g;
      let match;
      let currentIndex = 0;
      let targetMatch: { index: number; checked: boolean } | null = null;

      while ((match = checkboxPattern.exec(content)) !== null) {
        if (currentIndex === index) {
          targetMatch = {
            index: match.index,
            checked: match[1] !== ' ',
          };
          break;
        }
        currentIndex++;
      }

      if (targetMatch !== null) {
        // Toggle the checkbox in the markdown
        const newContent =
          content.slice(0, targetMatch.index) +
          (targetMatch.checked ? '[ ]' : '[x]') +
          content.slice(targetMatch.index + 3);
        onCheckboxToggle(newContent);
      }
    };

    // Attach click handlers — remove disabled attribute so clicks fire
    const handlers: (() => void)[] = [];
    checkboxes.forEach((checkbox, index) => {
      checkbox.removeAttribute('disabled');
      const handler = () => {
        handleCheckboxClick(index);
      };
      checkbox.addEventListener('click', handler);
      handlers.push(() => {
        checkbox.removeEventListener('click', handler);
      });
    });

    return () => {
      handlers.forEach((cleanup) => { cleanup(); });
    };
  }, [content, onCheckboxToggle]);

  return (
    <div
      ref={containerRef}
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
