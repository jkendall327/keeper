import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkdownPreview } from '../components/MarkdownPreview.tsx';
import { renderMarkdownSafe } from '../components/chat/chat-markdown.ts';

vi.mock('@motioneffector/markdown', () => ({
  markdown: vi.fn(() => {
    throw new Error('markdown failed');
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('markdown fallback escaping', () => {
  it('renders note preview fallback as escaped text', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(<MarkdownPreview content={'<img src=x onerror="alert(1)">'} />);

    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('renders chat fallback as escaped text', () => {
    const html = renderMarkdownSafe('<script>alert(1)</script>');

    expect(html).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
