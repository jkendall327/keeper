import { useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { markdown } from '@motioneffector/markdown';
import styles from './MarkdownPreview.module.css';

interface MarkdownPreviewProps {
  content: string;
  onCheckboxToggle?: (newContent: string) => void;
  className?: string;
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
    rawHtml = content;
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
      className={clsx(styles.root, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
