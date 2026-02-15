import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';

describe('Note archiving', () => {
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

  it('should create notes as unarchived by default', async () => {
    const note = await api.createNote({ body: 'Test note' });
    expect(note.archived).toBe(false);
  });

  it('should toggle archive status', async () => {
    const note = await api.createNote({ body: 'Test note' });

    const archived = await api.toggleArchiveNote(note.id);
    expect(archived.archived).toBe(true);

    const unarchived = await api.toggleArchiveNote(note.id);
    expect(unarchived.archived).toBe(false);
  });

  it('should exclude archived notes from getAllNotes', async () => {
    const note1 = await api.createNote({ body: 'Note 1' });
    const note2 = await api.createNote({ body: 'Note 2' });

    await api.toggleArchiveNote(note1.id);

    const allNotes = await api.getAllNotes();
    expect(allNotes.length).toBe(1);
    expect(allNotes[0]?.id).toBe(note2.id);
  });

  it('should exclude archived notes from getUntaggedNotes', async () => {
    const note1 = await api.createNote({ body: 'Note 1' });
    await api.createNote({ body: 'Note 2' });

    await api.toggleArchiveNote(note1.id);

    const untagged = await api.getUntaggedNotes();
    expect(untagged.every((n) => n.id !== note1.id)).toBe(true);
  });

  it('should exclude archived notes from getLinkedNotes', async () => {
    const note1 = await api.createNote({ body: 'Check https://example.com' });
    await api.createNote({ body: 'Check https://other.com' });

    await api.toggleArchiveNote(note1.id);

    const linked = await api.getLinkedNotes();
    expect(linked.every((n) => n.id !== note1.id)).toBe(true);
  });

  it('should exclude archived notes from getNotesForTag', async () => {
    const note1 = await api.createNote({ body: 'Note 1' });
    await api.addTag(note1.id, 'work');

    const note2 = await api.createNote({ body: 'Note 2' });
    await api.addTag(note2.id, 'work');

    await api.toggleArchiveNote(note1.id);

    const tags = await api.getAllTags();
    const workTag = tags.find((t) => t.name === 'work');
    if (workTag === undefined) throw new Error('work tag not found');

    const notesForTag = await api.getNotesForTag(workTag.id);
    expect(notesForTag.length).toBe(1);
    expect(notesForTag[0]?.id).toBe(note2.id);
  });

  it('should include archived notes in search results', async () => {
    const note1 = await api.createNote({ body: 'Unique search term alpha' });
    await api.toggleArchiveNote(note1.id);

    const results = await api.search('alpha');
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe(note1.id);
  });

  it('should sort archived notes below non-archived in search', async () => {
    await api.createNote({ body: 'Search keyword beta' });
    const note2 = await api.createNote({ body: 'Search keyword beta archived' });
    await api.toggleArchiveNote(note2.id);

    const results = await api.search('beta');
    expect(results.length).toBe(2);
    // Non-archived should come first
    expect(results[0]?.archived).toBe(false);
    expect(results[1]?.archived).toBe(true);
  });

  it('should return only archived notes from getArchivedNotes', async () => {
    const note1 = await api.createNote({ body: 'Note 1' });
    await api.createNote({ body: 'Note 2' });
    const note3 = await api.createNote({ body: 'Note 3' });

    await api.toggleArchiveNote(note1.id);
    await api.toggleArchiveNote(note3.id);

    const archived = await api.getArchivedNotes();
    expect(archived.length).toBe(2);
    expect(archived.every((n) => n.archived)).toBe(true);
  });

  it('should throw error when toggling archive on non-existent note', async () => {
    await expect(api.toggleArchiveNote('non-existent-id')).rejects.toThrow('Note not found');
  });

  describe('archiveNotes (batch)', () => {
    it('archives multiple notes at once', async () => {
      const note1 = await api.createNote({ body: 'Note 1' });
      const note2 = await api.createNote({ body: 'Note 2' });
      const note3 = await api.createNote({ body: 'Note 3' });

      // Before: all visible in getAllNotes
      const before = await api.getAllNotes();
      expect(before).toHaveLength(3);
      expect(before.map((n) => n.body).sort()).toEqual(['Note 1', 'Note 2', 'Note 3']);

      await api.archiveNotes([note1.id, note3.id]);

      // After: only note2 in getAllNotes
      const after = await api.getAllNotes();
      expect(after).toHaveLength(1);
      expect(after[0]?.id).toBe(note2.id);

      // Archived notes appear in getArchivedNotes
      const archived = await api.getArchivedNotes();
      expect(archived).toHaveLength(2);
      const archivedIds = archived.map((n) => n.id).sort();
      expect(archivedIds).toEqual([note1.id, note3.id].sort());
    });

    it('handles empty array without error', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.body).toBe('test');
      await api.archiveNotes([]);
      // Note is still visible
      const notes = await api.getAllNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0]?.id).toBe(note.id);
    });
  });
});
