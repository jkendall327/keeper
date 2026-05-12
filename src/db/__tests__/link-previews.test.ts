import { describe, it, expect, beforeEach } from 'vitest';
import { createKeeperDB } from '../db-impl.ts';
import { createTestDb } from './test-db.ts';
import type { KeeperDB } from '../types.ts';
import type { SqliteDb } from '../sqlite-db.ts';

describe('Link metadata', () => {
  let api: KeeperDB;
  let db: SqliteDb;
  let idCounter: number;
  let timeCounter: number;

  beforeEach(() => {
    idCounter = 0;
    timeCounter = 0;
    db = createTestDb();
    api = createKeeperDB({
      db,
      generateId: () => `test-id-${String(++idCounter)}`,
      now: () => `2025-01-15 12:00:${String(timeCounter++).padStart(2, '0')}`,
    });
  });

  it('stores and updates metadata by URL', async () => {
    const url = 'https://example.com/post/1';

    const created = await api.upsertLinkMetadata({
      url,
      image_url: 'https://example.com/preview.jpg',
      status: 'found',
      title: 'Example',
      site_name: 'Example Site',
    });
    expect(created).toMatchObject({
      url,
      image_url: 'https://example.com/preview.jpg',
      status: 'found',
      title: 'Example',
      site_name: 'Example Site',
    });

    const updated = await api.upsertLinkMetadata({
      url,
      image_url: null,
      status: 'missing',
    });
    expect(updated).toMatchObject({ url, image_url: null, status: 'missing' });
  });

  it('attaches metadata to notes with embedded URLs in note order', async () => {
    const url = 'https://example.com/post/1';
    const secondUrl = 'https://example.com/post/2';
    await api.upsertLinkMetadata({
      url,
      image_url: 'https://example.com/preview.jpg',
      status: 'found',
    });
    await api.upsertLinkMetadata({
      url: secondUrl,
      image_url: 'https://example.com/second.jpg',
      status: 'found',
    });

    const note = await api.createNote({ body: `look ${secondUrl} and then ${url}` });

    expect(note.link_metadata.map((metadata) => metadata.url)).toEqual([secondUrl, url]);
    expect(note.link_metadata[0]?.image_url).toBe('https://example.com/second.jpg');

    const notes = await api.getAllNotes();
    expect(notes.find((item) => item.id === note.id)?.link_metadata.map((metadata) => metadata.url)).toEqual([
      secondUrl,
      url,
    ]);
  });

  it('syncs note links when note bodies change', async () => {
    const oldUrl = 'https://example.com/old';
    const newUrl = 'https://example.com/new';
    await api.upsertLinkMetadata({ url: oldUrl, image_url: 'https://example.com/old.jpg', status: 'found' });
    await api.upsertLinkMetadata({ url: newUrl, image_url: 'https://example.com/new.jpg', status: 'found' });

    const note = await api.createNote({ body: oldUrl });
    expect(note.link_metadata.map((metadata) => metadata.url)).toEqual([oldUrl]);

    const updated = await api.updateNote({ id: note.id, body: newUrl });
    expect(updated.link_metadata.map((metadata) => metadata.url)).toEqual([newUrl]);
  });

  it('rejects malformed link metadata statuses from stored rows', async () => {
    const url = 'https://example.com/bad-status';
    db.run('PRAGMA ignore_check_constraints = ON');
    db.run(
      `INSERT INTO link_metadata (url, status, fetched_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [url, 'surprising', '2025-01-15 12:00:00', '2025-01-15 12:00:00'],
    );

    await expect(Promise.resolve().then(() => api.getLinkMetadata(url))).rejects.toThrow(
      'Expected status to be one of found, missing, error',
    );
  });

  it('enqueues missing metadata jobs from existing note links', async () => {
    await api.createNote({ body: 'Read https://example.com/one and https://example.com/two' });

    await expect(api.enqueueMissingLinkMetadataJobs()).resolves.toBe(2);
    const first = await api.claimNextLinkMetadataJob('2025-01-15 12:10:00');
    expect(first?.url).toBe('https://example.com/one');
  });

  it('persists link preview settings', async () => {
    await expect(api.getAppSettings()).resolves.toMatchObject({
      extensionBadgeEnabled: true,
      linkPreviewFetchEnabled: true,
      linkPreviewDisplayEnabled: true,
      popularTagSuggestionsEnabled: true,
      popularTagSuggestionLimit: 5,
      quickAddAutofocusEnabled: true,
    });

    await api.updateAppSettings({
      extensionBadgeEnabled: false,
      linkPreviewFetchEnabled: false,
      linkPreviewDisplayEnabled: false,
      popularTagSuggestionsEnabled: false,
      popularTagSuggestionLimit: 7,
      quickAddAutofocusEnabled: false,
    });

    await expect(api.getAppSettings()).resolves.toMatchObject({
      extensionBadgeEnabled: false,
      linkPreviewFetchEnabled: false,
      linkPreviewDisplayEnabled: false,
      popularTagSuggestionsEnabled: false,
      popularTagSuggestionLimit: 7,
      quickAddAutofocusEnabled: false,
    });
  });
});
