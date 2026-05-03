import { describe, it, expect, beforeEach } from 'vitest';
import { createKeeperDB } from '../db-impl.ts';
import { createTestDb } from './test-db.ts';
import type { KeeperDB } from '../types.ts';

describe('Link previews', () => {
  let api: KeeperDB;
  let idCounter: number;
  let timeCounter: number;

  beforeEach(() => {
    idCounter = 0;
    timeCounter = 0;
    api = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${String(++idCounter)}`,
      now: () => `2025-01-15 12:00:${String(timeCounter++).padStart(2, '0')}`,
    });
  });

  it('stores and updates previews by URL', async () => {
    const url = 'https://example.com/post/1';

    const created = await api.upsertLinkPreview({
      url,
      image_url: 'https://example.com/preview.jpg',
      status: 'found',
    });
    expect(created).toMatchObject({
      url,
      image_url: 'https://example.com/preview.jpg',
      status: 'found',
    });

    const updated = await api.upsertLinkPreview({
      url,
      image_url: null,
      status: 'missing',
    });
    expect(updated).toMatchObject({ url, image_url: null, status: 'missing' });
  });

  it('attaches previews to notes whose body is exactly the preview URL', async () => {
    const url = 'https://example.com/post/1';
    await api.upsertLinkPreview({
      url,
      image_url: 'https://example.com/preview.jpg',
      status: 'found',
    });

    const exact = await api.createNote({ body: url });
    const embedded = await api.createNote({ body: `look ${url}` });

    expect(exact.link_preview?.image_url).toBe('https://example.com/preview.jpg');
    expect(embedded.link_preview).toBe(null);

    const notes = await api.getAllNotes();
    expect(notes.find((note) => note.id === exact.id)?.link_preview?.status).toBe('found');
    expect(notes.find((note) => note.id === embedded.id)?.link_preview).toBe(null);
  });

  it('persists link preview settings', async () => {
    await expect(api.getAppSettings()).resolves.toMatchObject({
      extensionBadgeEnabled: true,
      linkPreviewFetchEnabled: true,
      linkPreviewDisplayEnabled: true,
    });

    await api.updateAppSettings({
      extensionBadgeEnabled: false,
      linkPreviewFetchEnabled: false,
      linkPreviewDisplayEnabled: false,
    });

    await expect(api.getAppSettings()).resolves.toMatchObject({
      extensionBadgeEnabled: false,
      linkPreviewFetchEnabled: false,
      linkPreviewDisplayEnabled: false,
    });
  });
});
