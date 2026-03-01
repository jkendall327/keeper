import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';

describe('Note trashing', () => {
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

  it('should create notes as non-trashed by default', async () => {
    const note = await api.createNote({ body: 'Test note' });
    expect(note.trashed).toBe(false);
  });

  it('should trash a note', async () => {
    const note = await api.createNote({ body: 'Test note' });
    await api.trashNote(note.id);

    const fetched = await api.getNote(note.id);
    expect(fetched?.trashed).toBe(true);
  });

  it('should restore a trashed note', async () => {
    const note = await api.createNote({ body: 'Test note' });
    await api.trashNote(note.id);
    await api.restoreNote(note.id);

    const fetched = await api.getNote(note.id);
    expect(fetched?.trashed).toBe(false);
  });

  it('should exclude trashed notes from getAllNotes', async () => {
    const note1 = await api.createNote({ body: 'Note 1' });
    const note2 = await api.createNote({ body: 'Note 2' });

    await api.trashNote(note1.id);

    const allNotes = await api.getAllNotes();
    expect(allNotes.length).toBe(1);
    expect(allNotes[0]?.id).toBe(note2.id);
  });

  it('should exclude trashed notes from getUntaggedNotes', async () => {
    const note1 = await api.createNote({ body: 'Note 1' });
    await api.createNote({ body: 'Note 2' });

    await api.trashNote(note1.id);

    const untagged = await api.getUntaggedNotes();
    expect(untagged.every((n) => n.id !== note1.id)).toBe(true);
  });

  it('should exclude trashed notes from getLinkedNotes', async () => {
    const note1 = await api.createNote({ body: 'Check https://example.com' });
    await api.createNote({ body: 'Check https://other.com' });

    await api.trashNote(note1.id);

    const linked = await api.getLinkedNotes();
    expect(linked.every((n) => n.id !== note1.id)).toBe(true);
  });

  it('should exclude trashed notes from getNotesForTag', async () => {
    const note1 = await api.createNote({ body: 'Note 1' });
    await api.addTag(note1.id, 'work');

    const note2 = await api.createNote({ body: 'Note 2' });
    await api.addTag(note2.id, 'work');

    await api.trashNote(note1.id);

    const tags = await api.getAllTags();
    const workTag = tags.find((t) => t.name === 'work');
    if (workTag === undefined) throw new Error('work tag not found');

    const notesForTag = await api.getNotesForTag(workTag.id);
    expect(notesForTag.length).toBe(1);
    expect(notesForTag[0]?.id).toBe(note2.id);
  });

  it('should exclude trashed notes from getArchivedNotes', async () => {
    const note1 = await api.createNote({ body: 'Note 1' });
    const note2 = await api.createNote({ body: 'Note 2' });
    await api.toggleArchiveNote(note1.id);
    await api.toggleArchiveNote(note2.id);

    // Before trash: both archived notes visible
    const beforeTrash = await api.getArchivedNotes();
    expect(beforeTrash.length).toBe(2);
    expect(beforeTrash.map((n) => n.id).sort()).toEqual([note1.id, note2.id].sort());

    await api.trashNote(note1.id);

    const archived = await api.getArchivedNotes();
    expect(archived.length).toBe(1);
    expect(archived[0]?.id).toBe(note2.id);
  });

  it('should exclude trashed notes from search results', async () => {
    await api.createNote({ body: 'Unique search term gamma visible' });
    const note2 = await api.createNote({ body: 'Unique search term gamma trashed' });

    // Before trash: both found
    const beforeTrash = await api.search('gamma');
    expect(beforeTrash.length).toBe(2);
    expect(beforeTrash.every((n) => !n.trashed)).toBe(true);

    await api.trashNote(note2.id);

    const results = await api.search('gamma');
    expect(results.length).toBe(1);
    expect(results[0]?.trashed).toBe(false);
  });

  it('should return only trashed notes from getTrashedNotes', async () => {
    const note1 = await api.createNote({ body: 'Note 1' });
    await api.createNote({ body: 'Note 2' });
    const note3 = await api.createNote({ body: 'Note 3' });

    await api.trashNote(note1.id);
    await api.trashNote(note3.id);

    const trashed = await api.getTrashedNotes();
    expect(trashed.length).toBe(2);
    expect(trashed.every((n) => n.trashed)).toBe(true);
  });

  describe('trashNotes (batch)', () => {
    it('trashes multiple notes at once', async () => {
      const note1 = await api.createNote({ body: 'Note 1' });
      const note2 = await api.createNote({ body: 'Note 2' });
      const note3 = await api.createNote({ body: 'Note 3' });

      await api.trashNotes([note1.id, note3.id]);

      const allNotes = await api.getAllNotes();
      expect(allNotes).toHaveLength(1);
      expect(allNotes[0]?.id).toBe(note2.id);

      const trashed = await api.getTrashedNotes();
      expect(trashed).toHaveLength(2);
      const trashedIds = trashed.map((n) => n.id).sort();
      expect(trashedIds).toEqual([note1.id, note3.id].sort());
    });

    it('handles empty array without error', async () => {
      const note = await api.createNote({ body: 'test' });
      expect(note.body).toBe('test');
      await api.trashNotes([]);
      const notes = await api.getAllNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0]?.id).toBe(note.id);
    });
  });

  it('permanently deletes a trashed note', async () => {
    const note = await api.createNote({ body: 'Note' });
    await api.trashNote(note.id);

    // Verify the note is in trash before deleting
    const trashedBefore = await api.getTrashedNotes();
    expect(trashedBefore.length).toBe(1);
    expect(trashedBefore[0]?.id).toBe(note.id);

    await api.deleteNote(note.id);

    const fetched = await api.getNote(note.id);
    expect(fetched).toBeNull();

    const trashedAfter = await api.getTrashedNotes();
    expect(trashedAfter.length).toBe(0);
  });
});
