import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';

describe('Tags', () => {
  let api: KeeperDB;
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    api = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${++idCounter}`,
      now: () => '2025-01-15 12:00:00',
    });
  });

  describe('addTag', () => {
    it('adds a new tag to a note', async () => {
      const note = await api.createNote({ body: 'test' });
      const updated = await api.addTag(note.id, 'important');
      expect(updated.tags).toEqual([{ id: 1, name: 'important' }]);
    });

    it('creates the tag if it does not exist', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'newtag');
      const tags = await api.getAllTags();
      expect(tags).toContainEqual({ id: 1, name: 'newtag' });
    });

    it('is idempotent (adding same tag twice has no effect)', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'tag1');
      await api.addTag(note.id, 'tag1');
      const updated = await api.getNote(note.id);
      expect(updated?.tags).toEqual([{ id: 1, name: 'tag1' }]);
    });

    it('can add multiple different tags to one note', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'tag1');
      await api.addTag(note.id, 'tag2');
      await api.addTag(note.id, 'tag3');
      const updated = await api.getNote(note.id);
      expect(updated?.tags.map((t) => t.name)).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('can add same tag to multiple notes (shared tag row)', async () => {
      const note1 = await api.createNote({ body: 'first' });
      const note2 = await api.createNote({ body: 'second' });
      await api.addTag(note1.id, 'shared');
      await api.addTag(note2.id, 'shared');

      const tags = await api.getAllTags();
      expect(tags.filter((t) => t.name === 'shared')).toHaveLength(1);

      const n1 = await api.getNote(note1.id);
      const n2 = await api.getNote(note2.id);
      expect(n1?.tags).toContainEqual({ id: 1, name: 'shared' });
      expect(n2?.tags).toContainEqual({ id: 1, name: 'shared' });
    });

    it('throws for nonexistent note', async () => {
      await expect(api.addTag('nonexistent', 'tag')).rejects.toThrow('Note not found');
    });
  });

  describe('removeTag', () => {
    it('removes a tag from a note', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'tag1');
      await api.addTag(note.id, 'tag2');

      const updated = await api.removeTag(note.id, 'tag1');
      expect(updated.tags).toEqual([{ id: 2, name: 'tag2' }]);
    });

    it('does not delete the tag row itself (other notes may use it)', async () => {
      const note1 = await api.createNote({ body: 'first' });
      const note2 = await api.createNote({ body: 'second' });
      await api.addTag(note1.id, 'shared');
      await api.addTag(note2.id, 'shared');

      await api.removeTag(note1.id, 'shared');

      const tags = await api.getAllTags();
      expect(tags).toContainEqual({ id: 1, name: 'shared' });

      const n2 = await api.getNote(note2.id);
      expect(n2?.tags).toContainEqual({ id: 1, name: 'shared' });
    });

    it('no-op when tag was not on the note', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'tag1');
      await api.removeTag(note.id, 'tag2'); // non-existent tag
      const updated = await api.getNote(note.id);
      expect(updated?.tags).toEqual([{ id: 1, name: 'tag1' }]);
    });

    it('throws for nonexistent note', async () => {
      await expect(api.removeTag('nonexistent', 'tag')).rejects.toThrow('Note not found');
    });
  });

  describe('renameTag', () => {
    it('renames tag across all notes that use it', async () => {
      const note1 = await api.createNote({ body: 'first' });
      const note2 = await api.createNote({ body: 'second' });
      await api.addTag(note1.id, 'oldname');
      await api.addTag(note2.id, 'oldname');

      await api.renameTag('oldname', 'newname');

      const n1 = await api.getNote(note1.id);
      const n2 = await api.getNote(note2.id);
      expect(n1?.tags).toContainEqual({ id: 1, name: 'newname' });
      expect(n2?.tags).toContainEqual({ id: 1, name: 'newname' });
    });

    it('notes still have the tag (with new name) after rename', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'before');
      await api.renameTag('before', 'after');

      const updated = await api.getNote(note.id);
      expect(updated?.tags.length).toBe(1);
      expect(updated?.tags[0]?.name).toBe('after');
    });
  });

  describe('getAllTags', () => {
    it('returns empty array when no tags exist', async () => {
      const tags = await api.getAllTags();
      expect(tags).toEqual([]);
    });

    it('returns all tags sorted by name', async () => {
      const note1 = await api.createNote({ body: 'test1' });
      const note2 = await api.createNote({ body: 'test2' });
      await api.addTag(note1.id, 'zebra');
      await api.addTag(note2.id, 'apple');
      await api.addTag(note1.id, 'mango');

      const tags = await api.getAllTags();
      expect(tags.map((t) => t.name)).toEqual(['apple', 'mango', 'zebra']);
    });

    it('does not return duplicate tags', async () => {
      const note1 = await api.createNote({ body: 'test1' });
      const note2 = await api.createNote({ body: 'test2' });
      await api.addTag(note1.id, 'shared');
      await api.addTag(note2.id, 'shared');

      const tags = await api.getAllTags();
      expect(tags.filter((t) => t.name === 'shared')).toHaveLength(1);
    });
  });
});
