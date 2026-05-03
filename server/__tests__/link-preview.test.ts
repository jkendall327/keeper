import { describe, it, expect } from 'vitest';
import { extractOgImage } from '../link-preview.ts';

describe('extractOgImage', () => {
  it('extracts and resolves og:image content', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Example">
          <meta property="og:image" content="/images/preview.jpg?x=1&amp;y=2">
        </head>
      </html>
    `;

    expect(extractOgImage(html, 'https://example.com/posts/1')).toBe(
      'https://example.com/images/preview.jpg?x=1&y=2',
    );
  });

  it('handles attributes in either order', () => {
    const html = '<meta content="https://cdn.example.com/a.webp" property="og:image">';
    expect(extractOgImage(html, 'https://example.com')).toBe(
      'https://cdn.example.com/a.webp',
    );
  });

  it('ignores pages without og:image', () => {
    expect(extractOgImage('<meta property="og:title" content="Example">', 'https://example.com')).toBe(null);
  });
});
