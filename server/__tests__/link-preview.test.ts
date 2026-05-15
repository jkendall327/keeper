import { afterEach, describe, it, expect, vi } from 'vitest';
import { extractLinkMetadata, extractOgImage, fetchLinkMetadata } from '../link-preview.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('extracts rich Open Graph metadata', () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Example title">
          <meta property="og:site_name" content="Example Site">
          <meta property="og:url" content="/canonical">
          <meta property="og:type" content="article">
          <meta property="og:image" content="/images/preview.jpg">
          <meta property="og:image:alt" content="Preview alt">
          <meta property="og:image:width" content="1200">
          <meta property="og:image:height" content="630">
        </head>
      </html>
    `;

    expect(extractLinkMetadata(html, 'https://example.com/post/1')).toMatchObject({
      url: 'https://example.com/post/1',
      status: 'found',
      image_url: 'https://example.com/images/preview.jpg',
      image_alt: 'Preview alt',
      image_width: 1200,
      image_height: 630,
      title: 'Example title',
      site_name: 'Example Site',
      canonical_url: 'https://example.com/canonical',
      type: 'article',
    });
  });

  it('prefers Open Graph images over Twitter images', () => {
    const html = `
      <meta name="twitter:image" content="/twitter.jpg">
      <meta property="og:image" content="/og.jpg">
    `;
    expect(extractLinkMetadata(html, 'https://example.com/post/1').image_url).toBe(
      'https://example.com/og.jpg',
    );
  });

  it('falls back to Twitter image and page title', () => {
    const html = `
      <html>
        <head>
          <title>Fallback title</title>
          <meta name="twitter:image:src" content="/twitter.jpg">
        </head>
      </html>
    `;
    expect(extractLinkMetadata(html, 'https://example.com/post/1')).toMatchObject({
      status: 'found',
      image_url: 'https://example.com/twitter.jpg',
      title: 'Fallback title',
    });
  });
});

describe('fetchLinkMetadata', () => {
  it('rejects redirects to private network URLs before following them', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('', {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLinkMetadata('http://93.184.216.34/start');

    expect(result).toMatchObject({
      url: 'http://93.184.216.34/start',
      status: 'error',
      image_url: null,
      failure_reason: 'Private IPs cannot be previewed',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toHaveProperty('href', 'http://93.184.216.34/start');
  });

  it('follows public redirects and resolves metadata against the final URL', async () => {
    const html = '<meta property="og:image" content="/final-image.jpg">';
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('', {
          status: 302,
          headers: { location: '/redirected/post' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(html, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLinkMetadata('http://93.184.216.34/start');

    expect(result).toMatchObject({
      url: 'http://93.184.216.34/start',
      status: 'found',
      image_url: 'http://93.184.216.34/final-image.jpg',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toHaveProperty('href', 'http://93.184.216.34/redirected/post');
  });
});
