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
      generateId: () => `test-id-${String(++idCounter)}`,
      now: () => '2025-01-15 12:00:00',
    });
  });

  describe('addTag', () => {
    it('adds a new tag to a note', async () => {
      const note = await api.createNote({ body: 'test' });
      const updated = await api.addTag(note.id, 'important');
      expect(updated.tags).toEqual([{ id: 1, name: 'important', icon: null }]);
    });

    it('creates the tag if it does not exist', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'newtag');
      const tags = await api.getAllTags();
      expect(tags).toContainEqual({ id: 1, name: 'newtag', icon: null });
    });

    it('is idempotent (adding same tag twice has no effect)', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'tag1');
      await api.addTag(note.id, 'tag1');
      const updated = await api.getNote(note.id);
      expect(updated?.tags).toEqual([{ id: 1, name: 'tag1', icon: null }]);
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
      expect(n1?.tags).toContainEqual({ id: 1, name: 'shared', icon: null });
      expect(n2?.tags).toContainEqual({ id: 1, name: 'shared', icon: null });
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
      expect(updated.tags).toEqual([{ id: 2, name: 'tag2', icon: null }]);
    });

    it('does not delete the tag row itself (other notes may use it)', async () => {
      const note1 = await api.createNote({ body: 'first' });
      const note2 = await api.createNote({ body: 'second' });
      await api.addTag(note1.id, 'shared');
      await api.addTag(note2.id, 'shared');

      await api.removeTag(note1.id, 'shared');

      const tags = await api.getAllTags();
      expect(tags).toContainEqual({ id: 1, name: 'shared', icon: null });

      const n2 = await api.getNote(note2.id);
      expect(n2?.tags).toContainEqual({ id: 1, name: 'shared', icon: null });
    });

    it('no-op when tag was not on the note', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'tag1');
      await api.removeTag(note.id, 'tag2'); // non-existent tag
      const updated = await api.getNote(note.id);
      expect(updated?.tags).toEqual([{ id: 1, name: 'tag1', icon: null }]);
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
      expect(n1?.tags).toContainEqual({ id: 1, name: 'newname', icon: null });
      expect(n2?.tags).toContainEqual({ id: 1, name: 'newname', icon: null });
    });

    it('notes still have the tag (with new name) after rename', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'before');
      await api.renameTag('before', 'after');

      const updated = await api.getNote(note.id);
      expect(updated?.tags).toHaveLength(1);
      expect(updated?.tags[0]).toEqual({ id: 1, name: 'after', icon: null });
    });

    it('merges into existing tag when renaming to a name that already exists', async () => {
      const note1 = await api.createNote({ body: 'first' });
      const note2 = await api.createNote({ body: 'second' });
      const note3 = await api.createNote({ body: 'third' });

      await api.addTag(note1.id, 'old');
      await api.addTag(note2.id, 'old');
      await api.addTag(note3.id, 'existing');

      // Rename 'old' -> 'existing' should merge
      await api.renameTag('old', 'existing');

      // All three notes should now have 'existing'
      const n1 = await api.getNote(note1.id);
      expect(n1?.tags).toHaveLength(1);
      expect(n1?.tags[0]?.name).toBe('existing');

      const n2 = await api.getNote(note2.id);
      expect(n2?.tags).toHaveLength(1);
      expect(n2?.tags[0]?.name).toBe('existing');

      const n3 = await api.getNote(note3.id);
      expect(n3?.tags).toHaveLength(1);
      expect(n3?.tags[0]?.name).toBe('existing');

      // Only one tag should remain globally
      const tags = await api.getAllTags();
      expect(tags).toHaveLength(1);
      expect(tags[0]?.name).toBe('existing');
    });

    it('merge handles note that already has both tags (no duplicate)', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'old');
      await api.addTag(note.id, 'existing');

      // Note has both tags before rename
      let fetched = await api.getNote(note.id);
      expect(fetched?.tags).toHaveLength(2);

      // Rename 'old' -> 'existing' should merge without creating duplicates
      await api.renameTag('old', 'existing');

      fetched = await api.getNote(note.id);
      expect(fetched?.tags).toHaveLength(1);
      expect(fetched?.tags[0]?.name).toBe('existing');
    });

    it('is a no-op when renaming to the same name', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'same');

      await api.renameTag('same', 'same');

      const fetched = await api.getNote(note.id);
      expect(fetched?.tags).toHaveLength(1);
      expect(fetched?.tags[0]?.name).toBe('same');
    });

    it('is a no-op when old tag name does not exist', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'real');

      // Renaming a nonexistent tag should not throw or affect anything
      await api.renameTag('nonexistent', 'other');

      const fetched = await api.getNote(note.id);
      expect(fetched?.tags).toHaveLength(1);
      expect(fetched?.tags[0]?.name).toBe('real');
    });
  });

  describe('deleteTag', () => {
    it('deletes a tag completely', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'deleteme');

      const tagsBefore = await api.getAllTags();
      expect(tagsBefore).toContainEqual({ id: 1, name: 'deleteme', icon: null });

      await api.deleteTag(1);

      const tagsAfter = await api.getAllTags();
      expect(tagsAfter).not.toContainEqual({ id: 1, name: 'deleteme', icon: null });
    });

    it('removes tag from all notes that used it (CASCADE)', async () => {
      const note1 = await api.createNote({ body: 'first' });
      const note2 = await api.createNote({ body: 'second' });
      const tagged1 = await api.addTag(note1.id, 'shared');
      const tagged2 = await api.addTag(note2.id, 'shared');

      // Both notes have the shared tag before deletion
      expect(tagged1.tags).toHaveLength(1);
      expect(tagged1.tags[0]?.name).toBe('shared');
      expect(tagged2.tags).toHaveLength(1);
      expect(tagged2.tags[0]?.name).toBe('shared');

      // Tags visible globally before delete
      const tagsBefore = await api.getAllTags();
      expect(tagsBefore).toHaveLength(1);
      expect(tagsBefore[0]?.name).toBe('shared');

      // Verify getNote shows tag before delete
      let n1 = await api.getNote(note1.id);
      expect(n1?.tags).toHaveLength(1);
      expect(n1?.tags[0]?.name).toBe('shared');
      let n2 = await api.getNote(note2.id);
      expect(n2?.tags).toHaveLength(1);
      expect(n2?.tags[0]?.name).toBe('shared');

      await api.deleteTag(1);

      // Tag is completely gone globally
      const tagsAfter = await api.getAllTags();
      expect(tagsAfter).toHaveLength(0);

      // Re-fetch: notes still exist but tags array is now empty
      n1 = await api.getNote(note1.id);
      expect(n1?.body).toBe('first');
      expect(n1?.tags).toHaveLength(0);
      n2 = await api.getNote(note2.id);
      expect(n2?.body).toBe('second');
      expect(n2?.tags).toHaveLength(0);
    });

    it('does not affect other tags on the same note', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'keep');
      await api.addTag(note.id, 'delete');

      await api.deleteTag(2); // delete the second tag

      const updated = await api.getNote(note.id);
      expect(updated?.tags).toEqual([{ id: 1, name: 'keep', icon: null }]);
    });

    it('no-op when tag does not exist', async () => {
      // Start empty
      const tagsBefore = await api.getAllTags();
      expect(tagsBefore).toHaveLength(0);
      // Deleting nonexistent tag is a no-op
      await api.deleteTag(999);
      const tagsAfter = await api.getAllTags();
      expect(tagsAfter).toHaveLength(0);
      // Positive case: creating a tag then deleting it works
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'temp');
      const tagsWithOne = await api.getAllTags();
      expect(tagsWithOne).toHaveLength(1);
      expect(tagsWithOne[0]?.name).toBe('temp');
    });
  });

  describe('getAllTags', () => {
    it('returns empty array when no tags exist', async () => {
      const tags = await api.getAllTags();
      expect(tags).toHaveLength(0);
      // Positive case: after adding tags, non-empty
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'hello');
      const tagsAfter = await api.getAllTags();
      expect(tagsAfter).toHaveLength(1);
      expect(tagsAfter[0]?.name).toBe('hello');
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

  describe('updateTagIcon', () => {
    it('newly created tag has icon null', async () => {
      const note = await api.createNote({ body: 'test' });
      const updated = await api.addTag(note.id, 'work');
      const tag = updated.tags[0];
      if (tag === undefined) throw new Error('Expected tag');
      expect(tag).toEqual({ id: 1, name: 'work', icon: null });
    });

    it('sets and persists an icon on a tag', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'work');
      const tags = await api.getAllTags();
      const tagId = tags[0]?.id;
      if (tagId === undefined) throw new Error('Expected tag id');

      await api.updateTagIcon(tagId, 'star');

      const tagsAfter = await api.getAllTags();
      const tag = tagsAfter[0];
      if (tag === undefined) throw new Error('Expected tag after update');
      expect(tag.icon).toBe('star');
    });

    it('icon is included in getTagsForNote via getNote', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'work');
      const tags = await api.getAllTags();
      const tagId = tags[0]?.id;
      if (tagId === undefined) throw new Error('Expected tag id');

      await api.updateTagIcon(tagId, 'briefcase');

      const fetched = await api.getNote(note.id);
      const tag = fetched?.tags[0];
      if (tag === undefined) throw new Error('Expected tag on note');
      expect(tag.icon).toBe('briefcase');
    });

    it('can clear icon back to null', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'work');
      const tags = await api.getAllTags();
      const tagId = tags[0]?.id;
      if (tagId === undefined) throw new Error('Expected tag id');

      await api.updateTagIcon(tagId, 'star');
      const tagWithIcon = (await api.getAllTags())[0];
      if (tagWithIcon === undefined) throw new Error('Expected tag with icon');
      expect(tagWithIcon.icon).toBe('star');

      await api.updateTagIcon(tagId, null);

      const tagsAfter = await api.getAllTags();
      const tag = tagsAfter[0];
      if (tag === undefined) throw new Error('Expected tag after clear');
      expect(tag).toEqual({ id: tagId, name: 'work', icon: null });
    });

    it('renameTag preserves icon', async () => {
      const note = await api.createNote({ body: 'test' });
      await api.addTag(note.id, 'old');
      const tags = await api.getAllTags();
      const tagId = tags[0]?.id;
      if (tagId === undefined) throw new Error('Expected tag id');

      await api.updateTagIcon(tagId, 'rocket_launch');
      await api.renameTag('old', 'new');

      const tagsAfter = await api.getAllTags();
      const tag = tagsAfter[0];
      if (tag === undefined) throw new Error('Expected tag after rename');
      expect(tag.name).toBe('new');
      expect(tag.icon).toBe('rocket_launch');
    });
  });
});
