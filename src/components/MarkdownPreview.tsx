import { useMemo, useRef, useEffect, useState } from 'react';
import MarkdownIt from 'markdown-it';
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

  // Load media and create blob URLs
  useEffect(() => {
    if (noteId === undefined) return;

    // Extract media IDs from markdown (inline to avoid React Compiler issues)
    const matches = content.matchAll(/media:\/\/([a-f0-9-]+)/gi);
    const mediaIds = Array.from(matches, (m) => m[1]).filter(
      (id): id is string => id !== undefined,
    );
    if (mediaIds.length === 0) {
      // Clean up any existing blob URLs if no media in content
      mediaUrls.forEach((url) => { URL.revokeObjectURL(url); });
      setMediaUrls(new Map());
      return;
    }

    const loadMedia = async () => {
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
        }
      }
      setMediaUrls(blobUrlMap);
    };

    void loadMedia();

    // CRITICAL: Cleanup to prevent memory leaks
    return () => {
      mediaUrls.forEach((url) => { URL.revokeObjectURL(url); });
    };
  }, [content, noteId]);

  // Configure markdown-it with custom image renderer
  const md = useMemo(() => {
    const mdInstance = MarkdownIt({
      html: false, // Disable HTML tags for security
      breaks: true, // Convert \n to <br>
      linkify: true, // Auto-detect URLs
    });

    // Open external links in new tab
    const defaultLinkOpen =
      mdInstance.renderer.rules['link_open'] ??
      ((tokens, idx, options, _env, self) =>
        self.renderToken(tokens, idx, options));

    mdInstance.renderer.rules['link_open'] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token !== undefined) {
        token.attrSet('target', '_blank');
        token.attrSet('rel', 'noopener noreferrer');
      }
      return defaultLinkOpen(tokens, idx, options, env, self);
    };

    // Override image renderer to handle media:// protocol
    const defaultImageRender =
      mdInstance.renderer.rules.image ??
      ((tokens, idx, options, _env, self) =>
        self.renderToken(tokens, idx, options));

    mdInstance.renderer.rules.image = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token === undefined) {
        return defaultImageRender(tokens, idx, options, env, self);
      }

      const srcIndex = token.attrIndex('src');
      if (srcIndex >= 0 && token.attrs !== null) {
        const src = token.attrs[srcIndex]?.[1];
        if (src?.startsWith('media://') === true) {
          const mediaId = src.replace('media://', '');
          const blobUrl = mediaUrls.get(mediaId);
          if (blobUrl !== undefined && token.attrs[srcIndex] !== undefined) {
            token.attrs[srcIndex][1] = blobUrl;
          }
        }
      }
      return defaultImageRender(tokens, idx, options, env, self);
    };

    return mdInstance;
  }, [mediaUrls]);

  // Render markdown to HTML
  const html = useMemo(() => {
    return md.render(content);
  }, [content, md]);

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

    // Attach click handlers
    const handlers: (() => void)[] = [];
    checkboxes.forEach((checkbox, index) => {
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
