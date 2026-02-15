import { useMemo, useRef, useEffect } from 'react';
import MarkdownIt from 'markdown-it';

interface MarkdownPreviewProps {
  content: string;
  onCheckboxToggle?: (newContent: string) => void;
  className?: string;
}

const md = MarkdownIt({
  html: false, // Disable HTML tags for security
  breaks: true, // Convert \n to <br>
  linkify: true, // Auto-detect URLs
});

export function MarkdownPreview({
  content,
  onCheckboxToggle,
  className = '',
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Render markdown to HTML
  const html = useMemo(() => {
    return md.render(content);
  }, [content]);

  // Add checkbox interactivity
  useEffect(() => {
    if (!containerRef.current || !onCheckboxToggle) return;

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

      if (targetMatch) {
        // Toggle the checkbox in the markdown
        const newContent =
          content.slice(0, targetMatch.index) +
          (targetMatch.checked ? '[ ]' : '[x]') +
          content.slice(targetMatch.index + 3);
        onCheckboxToggle(newContent);
      }
    };

    // Attach click handlers
    const handlers: Array<() => void> = [];
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
