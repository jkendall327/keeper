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

const markdownOptions = {
  breaks: true,
  linkTarget: '_blank',
  gfm: true,
} as const;

function taskCheckboxMarkers(content: string): TaskCheckboxMarker[] {
  const candidates: TaskCheckboxMarker[] = [];
  const checkboxPattern = /\[( |x|X)\](?=[ \t]+\S)/g;
  let match: RegExpExecArray | null;
  while ((match = checkboxPattern.exec(content)) !== null) {
    candidates.push({ index: match.index, checked: match[1] !== ' ' });
  }

  if (candidates.length === 0) return [];

  let markerPrefix = 'KEEPERTASKMARKER';
  while (content.includes(markerPrefix)) markerPrefix += 'X';

  let markedContent = content;
  for (const [candidateIndex, candidate] of [...candidates.entries()].reverse()) {
    const insertionIndex = candidate.index + 4;
    markedContent =
      markedContent.slice(0, insertionIndex) +
      `${markerPrefix}${String(candidateIndex)}END` +
      markedContent.slice(insertionIndex);
  }

  let markedHtml: string;
  try {
    markedHtml = markdown(markedContent, markdownOptions);
  } catch {
    return [];
  }

  const template = document.createElement('template');
  template.innerHTML = markedHtml;
  const markerPattern = new RegExp(`${markerPrefix}(\\d+)END`);

  return Array.from(template.content.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).flatMap(
    (checkbox) => {
      const markerMatch = checkbox.closest('li')?.textContent.match(markerPattern);
      if (markerMatch?.[1] === undefined) return [];
      const candidate = candidates[Number(markerMatch[1])];
      return candidate === undefined ? [] : [candidate];
    },
  );
}

export function MarkdownPreview({
  content,
  onCheckboxToggle,
  className = '',
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  let rawHtml: string;
  try {
    rawHtml = markdown(content, markdownOptions);
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
    const markers = taskCheckboxMarkers(content);

    const handleCheckboxClick = (index: number) => {
      const targetMatch = markers[index] ?? null;

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
