import { describe, it, expect, beforeEach } from 'vitest';
import { createMockDB, type MockDB } from './mock-db.ts';

describe('mock-db updateTagIcon', () => {
  let db: MockDB;

  beforeEach(() => {
    db = createMockDB();
  });

  it('newly created tag has icon null', async () => {
    await db.createNote({ body: 'test' });
    await db.addTag('n1', 'work');
    const tags = await db.getAllTags();
    expect(tags).toHaveLength(1);
    expect(tags[0]).toEqual({ id: 1, name: 'work', icon: null });
  });

  it('updateTagIcon sets icon on the tag', async () => {
    await db.createNote({ body: 'test' });
    await db.addTag('n1', 'work');
    const tagsBefore = await db.getAllTags();
    const tagId = tagsBefore[0]?.id;
    if (tagId === undefined) throw new Error('Expected tag to exist');

    await db.updateTagIcon(tagId, 'star');

    const tagsAfter = await db.getAllTags();
    expect(tagsAfter[0]?.icon).toBe('star');
  });

  it('updateTagIcon cascades to note tags', async () => {
    await db.createNote({ body: 'test' });
    await db.addTag('n1', 'work');
    const tags = await db.getAllTags();
    const tagId = tags[0]?.id;
    if (tagId === undefined) throw new Error('Expected tag to exist');

    await db.updateTagIcon(tagId, 'star');

    const note = await db.getNote('n1');
    if (note === null) throw new Error('Expected note to exist');
    expect(note.tags[0]?.icon).toBe('star');
  });

  it('updateTagIcon can revert icon to null', async () => {
    await db.createNote({ body: 'test' });
    await db.addTag('n1', 'work');
    const tags = await db.getAllTags();
    const tagId = tags[0]?.id;
    if (tagId === undefined) throw new Error('Expected tag to exist');

    await db.updateTagIcon(tagId, 'star');
    expect((await db.getAllTags())[0]?.icon).toBe('star');

    await db.updateTagIcon(tagId, null);
    const reverted = await db.getAllTags();
    expect(reverted[0]).toEqual({ id: 1, name: 'work', icon: null });
  });
});
