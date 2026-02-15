import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';

describe('Smart Views', () => {
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

  describe('getUntaggedNotes', () => {
    it('returns notes with no tags', async () => {
      const note1 = await api.createNote({ body: 'untagged' });
      const note2 = await api.createNote({ body: 'also untagged' });
      await api.createNote({ body: 'tagged' });
      await api.addTag('test-id-3', 'tag1');

      const untagged = await api.getUntaggedNotes();
      expect(untagged.map((n) => n.id)).toEqual([note2.id, note1.id]);
    });

    it('excludes notes with at least one tag', async () => {
      const note1 = await api.createNote({ body: 'untagged' });
      const note2 = await api.createNote({ body: 'has tag' });
      await api.addTag(note2.id, 'tag1');

      const untagged = await api.getUntaggedNotes();
      expect(untagged.map((n) => n.id)).toEqual([note1.id]);
    });

    it('returns in updated_at DESC order', async () => {
      // Create notes with different timestamps
      let time = 0;
      const apiWithTime = createKeeperDB({
        db: createTestDb(),
        generateId: () => `test-id-${String(++idCounter)}`,
        now: () => `2025-01-15 12:00:${String(time++).padStart(2, '0')}`,
      });

      const note1 = await apiWithTime.createNote({ body: 'first' });
      const note2 = await apiWithTime.createNote({ body: 'second' });
      const note3 = await apiWithTime.createNote({ body: 'third' });

      const untagged = await apiWithTime.getUntaggedNotes();
      expect(untagged.map((n) => n.id)).toEqual([note3.id, note2.id, note1.id]);
    });

    it('note moves out of untagged view after addTag', async () => {
      const note = await api.createNote({ body: 'test' });

      const beforeTag = await api.getUntaggedNotes();
      expect(beforeTag.map((n) => n.id)).toContain(note.id);

      await api.addTag(note.id, 'tag1');

      const afterTag = await api.getUntaggedNotes();
      expect(afterTag.map((n) => n.id)).not.toContain(note.id);
    });

    it('note returns to untagged view after removing all tags', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'tag1');

      const beforeRemove = await api.getUntaggedNotes();
      expect(beforeRemove.map((n) => n.id)).not.toContain(note.id);

      await api.removeTag(note.id, 'tag1');

      const afterRemove = await api.getUntaggedNotes();
      expect(afterRemove.map((n) => n.id)).toContain(note.id);
    });
  });

  describe('getLinkedNotes', () => {
    it('returns notes where has_links is true', async () => {
      const note1 = await api.createNote({ body: 'Check out https://example.com' });
      await api.createNote({ body: 'No links here' });
      const note3 = await api.createNote({ body: 'Another link http://test.com' });

      const linked = await api.getLinkedNotes();
      expect(linked.map((n) => n.id)).toEqual([note3.id, note1.id]);
    });

    it('excludes notes without links', async () => {
      const note1 = await api.createNote({ body: 'Plain text' });
      const note2 = await api.createNote({ body: 'More text' });
      const allNotes = await api.getAllNotes();
      expect(allNotes.length).toBe(2);
      expect(allNotes.some(n => n.id === note1.id)).toBe(true);
      expect(allNotes.some(n => n.id === note2.id)).toBe(true);

      const linked = await api.getLinkedNotes();
      expect(linked).toEqual([]);
      // Positive case: adding a URL makes a note appear in linked view
      await api.updateNote({ id: note1.id, body: 'Visit https://example.com' });
      const afterLink = await api.getLinkedNotes();
      expect(afterLink).toHaveLength(1);
      expect(afterLink[0]?.id).toBe(note1.id);
    });

    it('note appears after update adds URL to body', async () => {
      const note = await api.createNote({ body: 'Plain text' });

      const beforeUpdate = await api.getLinkedNotes();
      expect(beforeUpdate.map((n) => n.id)).not.toContain(note.id);

      await api.updateNote({ id: note.id, body: 'Now with https://example.com' });

      const afterUpdate = await api.getLinkedNotes();
      expect(afterUpdate.map((n) => n.id)).toContain(note.id);
    });

    it('note disappears after update removes URL from body', async () => {
      const note = await api.createNote({ body: 'Visit https://example.com' });

      const beforeUpdate = await api.getLinkedNotes();
      expect(beforeUpdate.map((n) => n.id)).toContain(note.id);

      await api.updateNote({ id: note.id, body: 'No more links' });

      const afterUpdate = await api.getLinkedNotes();
      expect(afterUpdate.map((n) => n.id)).not.toContain(note.id);
    });

    it('detects http:// links', async () => {
      const note = await api.createNote({ body: 'Visit http://example.com' });
      const linked = await api.getLinkedNotes();
      expect(linked.map((n) => n.id)).toContain(note.id);
    });

    it('detects https:// links', async () => {
      const note = await api.createNote({ body: 'Visit https://example.com' });
      const linked = await api.getLinkedNotes();
      expect(linked.map((n) => n.id)).toContain(note.id);
    });

    it('includes tags on linked notes', async () => {
      const note = await api.createNote({ body: 'Link: https://example.com' });
      await api.addTag(note.id, 'resource');

      const linked = await api.getLinkedNotes();
      expect(linked[0]?.tags).toEqual([{ id: 1, name: 'resource' }]);
    });
  });
});
