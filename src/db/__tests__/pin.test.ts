import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';

describe('Note pinning', () => {
  let api: KeeperDB;
  let idCounter: number;
  let timeCounter: number;

  beforeEach(() => {
    idCounter = 0;
    timeCounter = 0;
    api = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${++idCounter}`,
      now: () => `2025-01-15 12:00:${String(timeCounter++).padStart(2, '0')}`,
    });
  });

  it('should create notes as unpinned by default', async () => {
    const note = await api.createNote({ body: 'Test note' });
    expect(note.pinned).toBe(false);
  });

  it('should toggle pin status', async () => {
    const note = await api.createNote({ body: 'Test note' });

    // Pin the note
    const pinned = await api.togglePinNote(note.id);
    expect(pinned.pinned).toBe(true);

    // Unpin the note
    const unpinned = await api.togglePinNote(note.id);
    expect(unpinned.pinned).toBe(false);
  });

  it('should sort pinned notes before unpinned notes', async () => {

    // Create three notes
    const note1 = await api.createNote({ body: 'Note 1' });
    const note2 = await api.createNote({ body: 'Note 2' });
    const note3 = await api.createNote({ body: 'Note 3' });

    // Pin note 2
    await api.togglePinNote(note2.id);

    const allNotes = await api.getAllNotes();

    // Note 2 should be first because it's pinned
    expect(allNotes[0].id).toBe(note2.id);
    expect(allNotes[0].pinned).toBe(true);

    // Notes 3 and 1 should follow (most recent first)
    expect(allNotes[1].id).toBe(note3.id);
    expect(allNotes[1].pinned).toBe(false);
    expect(allNotes[2].id).toBe(note1.id);
    expect(allNotes[2].pinned).toBe(false);
  });

  it('should maintain pinned sort within pinned notes by updated_at', async () => {

    const note1 = await api.createNote({ body: 'Note 1' });
    const note2 = await api.createNote({ body: 'Note 2' });
    const note3 = await api.createNote({ body: 'Note 3' });

    // Pin all three notes
    await api.togglePinNote(note1.id);
    await api.togglePinNote(note2.id);
    await api.togglePinNote(note3.id);

    const allNotes = await api.getAllNotes();

    // All should be pinned, sorted by most recent first
    expect(allNotes.every((n) => n.pinned)).toBe(true);
    expect(allNotes[0].id).toBe(note3.id);
    expect(allNotes[1].id).toBe(note2.id);
    expect(allNotes[2].id).toBe(note1.id);
  });

  it('should preserve pinned status across queries', async () => {

    const note = await api.createNote({ body: 'Test note' });
    await api.togglePinNote(note.id);

    // Fetch the note again
    const fetched = await api.getNote(note.id);
    expect(fetched?.pinned).toBe(true);

    // Check in getAllNotes
    const allNotes = await api.getAllNotes();
    const foundNote = allNotes.find((n) => n.id === note.id);
    expect(foundNote?.pinned).toBe(true);
  });

  it('should sort pinned notes first in smart views', async () => {

    // Create tagged notes
    const note1 = await api.createNote({ body: 'Note 1' });
    await api.addTag(note1.id, 'work');

    const note2 = await api.createNote({ body: 'Note 2' });
    await api.addTag(note2.id, 'work');

    const note3 = await api.createNote({ body: 'Note 3' });
    await api.addTag(note3.id, 'work');

    // Pin note 2
    await api.togglePinNote(note2.id);

    // Get all tags
    const tags = await api.getAllTags();
    const workTag = tags.find((t) => t.name === 'work');
    if (!workTag) throw new Error('work tag not found');

    const notesForTag = await api.getNotesForTag(workTag.id);

    // Note 2 should be first because it's pinned
    expect(notesForTag[0].id).toBe(note2.id);
    expect(notesForTag[0].pinned).toBe(true);
  });

  it('should sort pinned notes first in untagged view', async () => {

    const note1 = await api.createNote({ body: 'Note 1' });
    const note2 = await api.createNote({ body: 'Note 2' });
    const note3 = await api.createNote({ body: 'Note 3' });

    // Pin note 1
    await api.togglePinNote(note1.id);

    const untagged = await api.getUntaggedNotes();

    // Note 1 should be first because it's pinned
    expect(untagged[0].id).toBe(note1.id);
    expect(untagged[0].pinned).toBe(true);
  });

  it('should sort pinned notes first in links view', async () => {

    const note1 = await api.createNote({ body: 'Check https://example1.com' });
    const note2 = await api.createNote({ body: 'Check https://example2.com' });
    const note3 = await api.createNote({ body: 'Check https://example3.com' });

    // Pin note 3
    await api.togglePinNote(note3.id);

    const linked = await api.getLinkedNotes();

    // Note 3 should be first because it's pinned
    expect(linked[0].id).toBe(note3.id);
    expect(linked[0].pinned).toBe(true);
  });

  it('should throw error when toggling pin on non-existent note', async () => {
    await expect(api.togglePinNote('non-existent-id')).rejects.toThrow('Note not found');
  });
});
