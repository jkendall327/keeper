import { describe, it, expect } from 'vitest';
import { getImageUrl } from '../utils/image-url.ts';

describe('getImageUrl', () => {
  it('returns the URL for a bare image URL', () => {
    expect(getImageUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
  });

  it('handles all recognised extensions', () => {
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'];
    for (const ext of extensions) {
      expect(getImageUrl(`https://example.com/img.${ext}`)).toBe(`https://example.com/img.${ext}`);
    }
  });

  it('is case-insensitive for extensions', () => {
    expect(getImageUrl('https://example.com/photo.PNG')).toBe('https://example.com/photo.PNG');
    expect(getImageUrl('https://example.com/photo.JPG')).toBe('https://example.com/photo.JPG');
  });

  it('accepts image URLs with query strings', () => {
    const url = 'https://example.com/photo.jpg?v=123&size=large';
    expect(getImageUrl(url)).toBe(url);
  });

  it('trims leading and trailing whitespace before checking', () => {
    expect(getImageUrl('  https://example.com/photo.jpg  ')).toBe('https://example.com/photo.jpg');
  });

  it('rejects non-image extensions while accepting image ones at the same host', () => {
    expect(getImageUrl('https://example.com/page.png')).toBe('https://example.com/page.png');
    expect(getImageUrl('https://example.com/page.html')).toBe(null);
  });

  it('rejects plain text but accepts a proper image URL', () => {
    expect(getImageUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
    expect(getImageUrl('just some text')).toBe(null);
  });

  it('rejects an empty string but accepts a proper image URL', () => {
    expect(getImageUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
    expect(getImageUrl('')).toBe(null);
  });

  it('rejects multi-line bodies: single-line image URL is valid, adding a newline makes it invalid', () => {
    expect(getImageUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
    expect(getImageUrl('https://example.com/photo.jpg\nextra line')).toBe(null);
  });

  it('rejects non-http schemes: ftp is rejected while https is accepted', () => {
    expect(getImageUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
    expect(getImageUrl('ftp://example.com/photo.jpg')).toBe(null);
  });

  it('rejects image URLs embedded in surrounding text', () => {
    expect(getImageUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
    expect(getImageUrl('see https://example.com/photo.jpg here')).toBe(null);
  });
});
