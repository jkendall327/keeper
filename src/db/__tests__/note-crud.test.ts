import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';

describe('Note CRUD', () => {
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

  describe('createNote', () => {
    it('creates a note and returns it with correct fields', async () => {
      const note = await api.createNote({ title: 'Test', body: 'Content' });
      expect(note).toMatchObject({
        id: 'test-id-1',
        title: 'Test',
        body: 'Content',
        has_links: false,
        created_at: '2025-01-15 12:00:00',
        updated_at: '2025-01-15 12:00:00',
        tags: [],
      });
    });

    it('auto-generates empty title when title is omitted', async () => {
      const note = await api.createNote({ body: 'Just a body' });
      expect(note.title).toBe('');
    });

    it('sets has_links=true when body contains a URL', async () => {
      const note = await api.createNote({ body: 'Check out https://example.com' });
      expect(note.has_links).toBe(true);
    });

    it('sets has_links=false when body has no URL', async () => {
      const note = await api.createNote({ body: 'Plain text note' });
      expect(note.has_links).toBe(false);
    });

    it('starts with no tags, gains tags after addTag', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note).toMatchObject({
        body: 'test',
        id: 'test-id-1',
        tags: [],
      });
      // After addTag, exactly one tag present
      const tagged = await api.addTag(note.id, 'hello');
      expect(tagged.tags).toHaveLength(1);
      expect(tagged.tags[0]?.name).toBe('hello');
    });
  });

  describe('getNote', () => {
    it('returns note by id with tags', async () => {
      const created = await api.createNote({ body: 'test' });
      const retrieved = await api.getNote(created.id);
      expect(retrieved).toEqual(created);
    });

    it('returns null for nonexistent id', async () => {
      // Positive case: valid ID returns the note
      const created = await api.createNote({ body: 'test' });
      const fetched = await api.getNote(created.id);
      expect(fetched?.body).toBe('test');
      expect(fetched?.id).toBe(created.id);
      // Negative case: invalid ID returns null
      const result = await api.getNote('nonexistent');
      expect(result).toBe(null);
    });
  });

  describe('getAllNotes', () => {
    it('returns empty array when no notes exist', async () => {
      const notes = await api.getAllNotes();
      expect(notes).toEqual([]);
      // Positive case: adding a note makes it non-empty
      await api.createNote({ body: 'first' });
      const after = await api.getAllNotes();
      expect(after).toHaveLength(1);
      expect(after[0]?.body).toBe('first');
    });

    it('returns notes ordered by updated_at DESC', async () => {
      const note1 = await api.createNote({ body: 'first' });
      const note2 = await api.createNote({ body: 'second' });
      const note3 = await api.createNote({ body: 'third' });

      const notes = await api.getAllNotes();
      expect(notes.map((n) => n.id)).toEqual([note3.id, note2.id, note1.id]);
    });

    it('includes tags on each note', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'tag1');

      const notes = await api.getAllNotes();
      expect(notes[0]?.tags).toEqual([{ id: 1, name: 'tag1' }]);
    });
  });

  describe('updateNote', () => {
    it('updates title only, preserves body', async () => {
      const note = await api.createNote({ title: 'Old', body: 'Content' });
      const updated = await api.updateNote({ id: note.id, title: 'New' });
      expect(updated.title).toBe('New');
      expect(updated.body).toBe('Content');
    });

    it('updates body only, preserves title', async () => {
      const note = await api.createNote({ title: 'Title', body: 'Old content' });
      const updated = await api.updateNote({ id: note.id, body: 'New content' });
      expect(updated.title).toBe('Title');
      expect(updated.body).toBe('New content');
    });

    it('updates both title and body', async () => {
      const note = await api.createNote({ title: 'Old', body: 'Old' });
      const updated = await api.updateNote({ id: note.id, title: 'New', body: 'New' });
      expect(updated.title).toBe('New');
      expect(updated.body).toBe('New');
    });

    it('recalculates has_links when body changes (URL added)', async () => {
      const note = await api.createNote({ body: 'Plain text' });
      expect(note.has_links).toBe(false);

      const updated = await api.updateNote({ id: note.id, body: 'https://example.com' });
      expect(updated.has_links).toBe(true);
    });

    it('recalculates has_links when body changes (URL removed)', async () => {
      const note = await api.createNote({ body: 'https://example.com' });
      expect(note.has_links).toBe(true);

      const updated = await api.updateNote({ id: note.id, body: 'Plain text' });
      expect(updated.has_links).toBe(false);
    });

    it('throws for nonexistent note id', async () => {
      await expect(api.updateNote({ id: 'nonexistent', body: 'test' })).rejects.toThrow(
        'Note not found: nonexistent',
      );
    });

    it('updates updated_at timestamp', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.updated_at).toBe('2025-01-15 12:00:00');

      const updated = await api.updateNote({ id: note.id, body: 'updated' });
      expect(updated.updated_at).toBe('2025-01-15 12:00:01');
    });
  });

  describe('deleteNote', () => {
    it('deletes note by id', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.id).toBe('test-id-1');
      expect(note.body).toBe('test');
      await api.deleteNote(note.id);
      const retrieved = await api.getNote(note.id);
      expect(retrieved).toBeNull();
    });

    it('getNote returns null after delete', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.body).toBe('test');
      expect(note.id).toBe('test-id-1');
      await api.deleteNote(note.id);
      expect(await api.getNote(note.id)).toBeNull();
    });

    it('cascade deletes note_tags entries', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.body).toBe('test');
      await api.addTag(note.id, 'tag1');
      const noteWithTag = await api.getNote(note.id);
      expect(noteWithTag?.tags).toHaveLength(1);
      expect(noteWithTag?.tags[0]).toEqual({ id: 1, name: 'tag1' });

      // Verify note exists in getAllNotes before delete
      const allNotes = await api.getAllNotes();
      expect(allNotes).toHaveLength(1);
      expect(allNotes[0]?.id).toBe(note.id);

      await api.deleteNote(note.id);
      const remaining = await api.getAllNotes();
      expect(remaining).toHaveLength(0);
    });
  });

  describe('deleteNotes', () => {
    it('deletes multiple notes in one call', async () => {
      const note1 = await api.createNote({ body: 'first' });
      const note2 = await api.createNote({ body: 'second' });
      const note3 = await api.createNote({ body: 'third' });

      await api.deleteNotes([note1.id, note3.id]);

      const remaining = await api.getAllNotes();
      expect(remaining.map((n) => n.id)).toEqual([note2.id]);
    });

    it('handles empty array', async () => {
      await api.createNote({ body: 'test' });
      await api.deleteNotes([]);
      const notes = await api.getAllNotes();
      expect(notes.length).toBe(1);
      expect(notes[0]?.body).toBe('test');
    });
  });
});
