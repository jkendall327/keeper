import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';
import type { SqliteDb } from '../sqlite-db.ts';

describe('Media', () => {
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

  describe('getMediaForNote', () => {
    it('returns empty array when note has no media', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.body).toBe('test');
      const media = await api.getMediaForNote(note.id);
      expect(media).toHaveLength(0);
      // Positive case: adding media makes it non-empty
      db.run(
        'INSERT INTO media (id, note_id, mime_type, filename, created_at) VALUES (?, ?, ?, ?, ?)',
        ['media-pos', note.id, 'image/png', 'media-pos.png', '2025-01-15 12:01:00'],
      );
      const mediaAfter = await api.getMediaForNote(note.id);
      expect(mediaAfter).toHaveLength(1);
      expect(mediaAfter[0]?.id).toBe('media-pos');
    });

    it('returns media records with correct fields', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.body).toBe('test');

      // Insert media directly (storeMedia is worker-only)
      db.run(
        'INSERT INTO media (id, note_id, mime_type, filename, created_at) VALUES (?, ?, ?, ?, ?)',
        ['media-1', note.id, 'image/png', 'media-1.png', '2025-01-15 12:01:00'],
      );

      const media = await api.getMediaForNote(note.id);
      expect(media).toHaveLength(1);
      expect(media[0]).toEqual({
        id: 'media-1',
        note_id: note.id,
        mime_type: 'image/png',
        filename: 'media-1.png',
        created_at: '2025-01-15 12:01:00',
      });
    });

    it('returns media ordered by created_at', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.body).toBe('test');

      // Insert media in reverse chronological order
      db.run(
        'INSERT INTO media (id, note_id, mime_type, filename, created_at) VALUES (?, ?, ?, ?, ?)',
        ['media-2', note.id, 'image/jpeg', 'media-2.jpg', '2025-01-15 12:02:00'],
      );
      db.run(
        'INSERT INTO media (id, note_id, mime_type, filename, created_at) VALUES (?, ?, ?, ?, ?)',
        ['media-1', note.id, 'image/png', 'media-1.png', '2025-01-15 12:01:00'],
      );

      const media = await api.getMediaForNote(note.id);
      expect(media).toHaveLength(2);
      // Should be ordered by created_at ASC
      expect(media[0]?.id).toBe('media-1');
      expect(media[1]?.id).toBe('media-2');
    });

    it('only returns media for the specified note', async () => {
      const note1 = await api.createNote({ body: 'first' });
      const note2 = await api.createNote({ body: 'second' });
      expect(note1.body).toBe('first');
      expect(note2.body).toBe('second');

      db.run(
        'INSERT INTO media (id, note_id, mime_type, filename, created_at) VALUES (?, ?, ?, ?, ?)',
        ['media-1', note1.id, 'image/png', 'media-1.png', '2025-01-15 12:01:00'],
      );
      db.run(
        'INSERT INTO media (id, note_id, mime_type, filename, created_at) VALUES (?, ?, ?, ?, ?)',
        ['media-2', note2.id, 'image/jpeg', 'media-2.jpg', '2025-01-15 12:02:00'],
      );

      const media1 = await api.getMediaForNote(note1.id);
      expect(media1).toHaveLength(1);
      expect(media1[0]?.id).toBe('media-1');

      const media2 = await api.getMediaForNote(note2.id);
      expect(media2).toHaveLength(1);
      expect(media2[0]?.id).toBe('media-2');
    });

    it('media is cascade-deleted when note is deleted', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.body).toBe('test');

      db.run(
        'INSERT INTO media (id, note_id, mime_type, filename, created_at) VALUES (?, ?, ?, ?, ?)',
        ['media-1', note.id, 'image/png', 'media-1.png', '2025-01-15 12:01:00'],
      );

      const mediaBefore = await api.getMediaForNote(note.id);
      expect(mediaBefore).toHaveLength(1);
      expect(mediaBefore[0]?.id).toBe('media-1');

      await api.deleteNote(note.id);

      // Media rows are cascade-deleted with the note
      const mediaAfter = await api.getMediaForNote(note.id);
      expect(mediaAfter).toHaveLength(0);
    });
  });

  describe('storeMedia (base implementation)', () => {
    it('throws because it requires worker OPFS access', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.body).toBe('test');
      await expect(
        api.storeMedia({ noteId: note.id, mimeType: 'image/png', data: new ArrayBuffer(0) }),
      ).rejects.toThrow('must be implemented by worker');
    });
  });

  describe('getMedia (base implementation)', () => {
    it('throws because it requires worker OPFS access', async () => {
      await expect(api.getMedia('any-id')).rejects.toThrow('must be implemented by worker');
    });
  });

  describe('deleteMedia (base implementation)', () => {
    it('throws because it requires worker OPFS access', async () => {
      await expect(api.deleteMedia('any-id')).rejects.toThrow('must be implemented by worker');
    });
  });
});
