import { useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { markdown } from '@motioneffector/markdown';
import { escapeHtml } from '../utils/html.ts';
import styles from './MarkdownPreview.module.css';

interface MarkdownPreviewProps {
  content: string;
  onCheckboxToggle?: (newContent: string) => void;
  className?: string;
}

interface TaskCheckboxMarker {
  index: number;
  checked: boolean;
}

function taskCheckboxMarkers(content: string): TaskCheckboxMarker[] {
  const markers: TaskCheckboxMarker[] = [];
  let lineStart = 0;
  let activeFence: { character: string; length: number } | null = null;

  for (const line of content.split('\n')) {
    const withoutQuotePrefix = line.replace(/^(?: {0,3}>[ \t]?)+/, '');
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(withoutQuotePrefix);

    if (fenceMatch !== null) {
      const fence = fenceMatch[1];
      const trailing = fenceMatch[2];
      if (fence !== undefined && trailing !== undefined) {
        if (activeFence === null) {
          activeFence = { character: fence.startsWith('`') ? '`' : '~', length: fence.length };
        } else if (
          fence.startsWith(activeFence.character) &&
          fence.length >= activeFence.length &&
          trailing.trim() === ''
        ) {
          activeFence = null;
        }
      }
      lineStart += line.length + 1;
      continue;
    }

    if (activeFence === null) {
      const taskMatch = /^(?: {0,3}>[ \t]?)*[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+\[( |x|X)\](?=[ \t]|$)/.exec(line);
      if (taskMatch !== null) {
        const bracketOffset = taskMatch[0].lastIndexOf('[');
        markers.push({
          index: lineStart + bracketOffset,
          checked: taskMatch[1] !== ' ',
        });
      }
    }

    lineStart += line.length + 1;
  }

  return markers;
}

export function MarkdownPreview({
  content,
  onCheckboxToggle,
  className = '',
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  let rawHtml: string;
  try {
    rawHtml = markdown(content, {
      breaks: true,
      linkTarget: '_blank',
      gfm: true,
    });
  } catch (err: unknown) {
    console.warn('Markdown rendering failed, showing raw content:', err);
    rawHtml = escapeHtml(content);
  }

  let html = rawHtml.replaceAll(
    /media:\/\/([a-f0-9-]+)/gi,
    '/api/media/$1',
  );
  // Ensure all links open in a new tab with safe rel.
  // First strip any target the library already added, then add uniformly.
  html = html.replaceAll(' target="_blank"', '');
  html = html.replaceAll('<a href=', '<a target="_blank" rel="noopener noreferrer" href=');

  // Add checkbox interactivity
  useEffect(() => {
    if (containerRef.current === null || onCheckboxToggle === undefined) return;

    const container = containerRef.current;
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );

    const handleCheckboxClick = (index: number) => {
      const targetMatch = taskCheckboxMarkers(content)[index] ?? null;

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
      className={clsx(styles.root, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
