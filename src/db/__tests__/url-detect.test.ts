import { describe, it, expect } from 'vitest';
import { containsUrl } from '../url-detect.ts';
import * as fc from 'fast-check';

describe('containsUrl', () => {
  describe('basic behavior', () => {
    it('returns false for null', () => {
      expect(containsUrl(null)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(containsUrl('')).toBe(false);
    });

    it('returns true for string with http:// URL', () => {
      expect(containsUrl('Check http://example.com')).toBe(true);
    });

    it('returns true for string with https:// URL', () => {
      expect(containsUrl('Check https://example.com')).toBe(true);
    });

    it('returns false for plain text without URLs', () => {
      expect(containsUrl('Just some plain text')).toBe(false);
    });

    it('returns true when URL is embedded in text', () => {
      expect(containsUrl('Before https://example.com after')).toBe(true);
    });

    it('returns true for URLs with paths', () => {
      expect(containsUrl('https://example.com/path/to/page')).toBe(true);
    });

    it('returns true for URLs with query params', () => {
      expect(containsUrl('https://example.com?foo=bar&baz=qux')).toBe(true);
    });

    it('returns true for URLs with fragments', () => {
      expect(containsUrl('https://example.com#section')).toBe(true);
    });

    it('returns false for incomplete URLs', () => {
      expect(containsUrl('example.com')).toBe(false);
      expect(containsUrl('www.example.com')).toBe(false);
    });
  });

  describe('property-based tests', () => {
    it('always true when string contains a valid URL', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.string(), fc.webUrl(), fc.string()),
          ([prefix, url, suffix]) => {
            const text = prefix + url + suffix;
            expect(containsUrl(text)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('always false for alphanumeric-only strings', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9 ]*$/),
          (text) => {
            // Skip if text accidentally contains 'http' or 'https'
            if (text.includes('http')) return;
            expect(containsUrl(text)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('detects http:// anywhere in the string', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.string(), fc.string()),
          ([before, after]) => {
            const text = before + 'http://example.com' + after;
            expect(containsUrl(text)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('detects https:// anywhere in the string', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.string(), fc.string()),
          ([before, after]) => {
            const text = before + 'https://example.com' + after;
            expect(containsUrl(text)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('false for strings with no protocol prefix', () => {
      fc.assert(
        fc.property(
          fc.domain(),
          (domain) => {
            // Plain domain without http:// or https://
            expect(containsUrl(domain)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('finds URLs regardless of surrounding whitespace', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          fc.nat(10),
          fc.nat(10),
          (url, spacesBefore, spacesAfter) => {
            const text = ' '.repeat(spacesBefore) + url + ' '.repeat(spacesAfter);
            expect(containsUrl(text)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
