import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import { toNoteId, type KeeperDB } from '../types.ts';

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

  describe('deduplicateNotes', () => {
    it('keeps the oldest creation, merges tags across whole groups, and ignores Trash', async () => {
      const oldest = await api.createNote({ title: 'Keep this title', body: 'shared', initialTagNames: ['one'] });
      const second = await api.createNote({ body: 'shared', initialTagNames: ['two', 'one'] });
      const third = await api.createNote({ body: 'shared', initialTagNames: ['three'] });
      await api.toggleArchiveNote(oldest.id);
      await api.updateNote({ id: oldest.id, title: 'Updated oldest' });
      const trashed = await api.createNote({ body: 'shared', initialTagNames: ['excluded'] });
      await api.trashNote(trashed.id);
      const unique = await api.createNote({ body: 'Shared' });
      const other = await api.createNote({ body: 'another group' });
      await api.createNote({ body: 'another group' });

      expect(await api.deduplicateNotes()).toEqual({ removedNoteCount: 3 });
      const survivor = await api.getNote(oldest.id);
      expect(survivor).toMatchObject({ title: 'Updated oldest', archived: true, trashed: false });
      expect(survivor?.tags.map((tag) => tag.name).sort()).toEqual(['one', 'three', 'two']);
      expect(await api.getNote(second.id)).toMatchObject({ trashed: true });
      expect(await api.getNote(third.id)).toMatchObject({ trashed: true });
      expect(await api.getNote(unique.id)).toMatchObject({ trashed: false });
      expect(await api.getNote(other.id)).toMatchObject({ trashed: false });
      expect(await api.getDuplicateNotes()).toEqual([]);
      expect(await api.deduplicateNotes()).toEqual({ removedNoteCount: 0 });
    });

    it('keeps exactly one note when creation times tie', async () => {
      const sql = createTestDb();
      const tiedApi = createKeeperDB({ db: sql, generateId: () => String(++idCounter), now: () => '2025-01-01 00:00:00' });
      try {
        for (let i = 0; i < 4; i++) {
          await tiedApi.createNote({ body: '', initialTagNames: [String(i)] });
        }
        expect(await tiedApi.deduplicateNotes()).toEqual({ removedNoteCount: 3 });
        const survivors = await tiedApi.getAllNotes();
        expect(survivors).toHaveLength(1);
        expect(survivors[0]?.tags).toHaveLength(4);
      } finally {
        sql.close?.();
      }
    });

    it('rolls back tags and all prior removals when any removal fails', async () => {
      const sql = createTestDb();
      const failingApi = createKeeperDB({ db: sql, generateId: () => String(++idCounter), now: () => String(timeCounter++) });
      try {
        const first = await failingApi.createNote({ body: 'same' });
        await failingApi.createNote({ body: 'same', initialTagNames: ['two'] });
        const third = await failingApi.createNote({ body: 'same', initialTagNames: ['three'] });
        sql.run(`CREATE TRIGGER fail_trash BEFORE UPDATE OF trashed ON notes
          WHEN NEW.id = '${third.id}' AND NEW.trashed = 1
          BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
        await expect(async () => failingApi.deduplicateNotes()).rejects.toThrow('test failure');
        expect(await failingApi.getTrashedNotes()).toEqual([]);
        expect((await failingApi.getNote(first.id))?.tags).toEqual([]);
        expect(await failingApi.getDuplicateNotes()).toHaveLength(3);
      } finally {
        sql.close?.();
      }
    });
  });

  describe('getUntaggedNotes', () => {
    it('returns notes with no tags', async () => {
      const note1 = await api.createNote({ body: 'untagged' });
      const note2 = await api.createNote({ body: 'also untagged' });
      await api.createNote({ body: 'tagged' });
      await api.addTag(toNoteId('test-id-3'), 'tag1');

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

    it('uses newest rowid as the tiebreaker for identical timestamps', async () => {
      const apiWithTiedTimes = createKeeperDB({
        db: createTestDb(),
        generateId: () => `tied-id-${String(++idCounter)}`,
        now: () => '2025-01-15 12:00:00.000',
      });
      const note1 = await apiWithTiedTimes.createNote({ body: 'first' });
      const note2 = await apiWithTiedTimes.createNote({ body: 'second' });

      const untagged = await apiWithTiedTimes.getUntaggedNotes();
      expect(untagged.map((note) => note.id)).toEqual([note2.id, note1.id]);
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
      expect(linked[0]?.tags).toEqual([{ id: 1, name: 'resource', icon: null }]);
    });
  });

  describe('getDuplicateNotes', () => {
    it('returns notes whose bodies appear more than once', async () => {
      const first = await api.createNote({ body: 'same' });
      const unique = await api.createNote({ body: 'different' });
      const second = await api.createNote({ body: 'same' });

      const duplicates = await api.getDuplicateNotes();

      expect(duplicates.map((note) => note.id)).toEqual([second.id, first.id]);
      expect(duplicates.map((note) => note.id)).not.toContain(unique.id);
    });

    it('keeps duplicate groups adjacent and orders newer groups first', async () => {
      const groupA1 = await api.createNote({ body: 'alpha' });
      const groupA2 = await api.createNote({ body: 'alpha' });
      const groupB1 = await api.createNote({ body: 'beta' });
      const groupB2 = await api.createNote({ body: 'beta' });

      const duplicates = await api.getDuplicateNotes();

      expect(duplicates.map((note) => note.id)).toEqual([groupB2.id, groupB1.id, groupA2.id, groupA1.id]);
    });

    it('excludes trashed notes when deciding whether a body is duplicated', async () => {
      const active = await api.createNote({ body: 'same' });
      const trashed = await api.createNote({ body: 'same' });
      await api.trashNote(trashed.id);

      const duplicates = await api.getDuplicateNotes();

      expect(duplicates.map((note) => note.id)).not.toContain(active.id);
      expect(duplicates.map((note) => note.id)).not.toContain(trashed.id);
    });

    it('includes archived duplicate notes after active ones in the group', async () => {
      const archived = await api.createNote({ body: 'same' });
      const active = await api.createNote({ body: 'same' });
      await api.archiveNotes([archived.id]);

      const duplicates = await api.getDuplicateNotes();

      expect(duplicates.map((note) => note.id)).toEqual([active.id, archived.id]);
      expect(duplicates[1]?.archived).toBe(true);
    });

    it('includes tags on duplicate notes', async () => {
      const note = await api.createNote({ body: 'same' });
      await api.createNote({ body: 'same' });
      await api.addTag(note.id, 'review');

      const duplicates = await api.getDuplicateNotes();

      expect(duplicates.find((candidate) => candidate.id === note.id)?.tags).toEqual([
        { id: 1, name: 'review', icon: null },
      ]);
    });
  });
});
