import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';

describe('FTS5 Search', () => {
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

  it('finds note by title match', async () => {
    await api.createNote({ title: 'Meeting Notes', body: 'Discussion points' });
    await api.createNote({ title: 'Shopping List', body: 'Groceries' });

    const results = await api.search('meeting');
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Meeting Notes');
  });

  it('finds note by body match', async () => {
    await api.createNote({ title: 'Work', body: 'Important project deadline' });
    await api.createNote({ title: 'Home', body: 'Weekend plans' });

    const results = await api.search('deadline');
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Work');
  });

  it('returns empty array for no matches', async () => {
    await api.createNote({ title: 'Test', body: 'Content' });
    const results = await api.search('nonexistent');
    expect(results).toEqual([]);
  });

  it('search is case-insensitive', async () => {
    await api.createNote({ title: 'JavaScript Tutorial', body: 'Learn coding' });

    const results1 = await api.search('javascript');
    const results2 = await api.search('JAVASCRIPT');
    const results3 = await api.search('JaVaScRiPt');

    expect(results1).toHaveLength(1);
    expect(results2).toHaveLength(1);
    expect(results3).toHaveLength(1);
  });

  it('returns results with rank', async () => {
    await api.createNote({ title: 'Test', body: 'Content' });
    const results = await api.search('test');
    expect(results[0]).toHaveProperty('rank');
    expect(typeof results[0]?.rank).toBe('number');
  });

  it('re-indexes after note update (finds new content)', async () => {
    const note = await api.createNote({ title: 'Original', body: 'Old content' });

    const beforeResults = await api.search('updated');
    expect(beforeResults).toHaveLength(0);

    await api.updateNote({ id: note.id, body: 'Updated content' });

    const afterResults = await api.search('updated');
    expect(afterResults).toHaveLength(1);
  });

  it('removes from index after note delete (no stale results)', async () => {
    const note = await api.createNote({ title: 'To Delete', body: 'This will be removed' });

    const beforeResults = await api.search('delete');
    expect(beforeResults).toHaveLength(1);

    await api.deleteNote(note.id);

    const afterResults = await api.search('delete');
    expect(afterResults).toHaveLength(0);
  });

  it('handles special characters without crashing', async () => {
    await api.createNote({ title: 'Special @#$%', body: 'Chars & symbols!' });

    // Should not throw
    const results = await api.search('special');
    expect(results).toHaveLength(1);
  });

  it('returns results with tags attached', async () => {
    const note = await api.createNote({ title: 'Tagged Note', body: 'Content' });
    await api.addTag(note.id, 'important');

    const results = await api.search('tagged');
    expect(results[0]?.tags).toEqual([{ id: 1, name: 'important' }]);
  });

  it('finds matches in both title and body', async () => {
    await api.createNote({ title: 'React Tutorial', body: 'Learn React hooks' });

    const results = await api.search('react');
    expect(results).toHaveLength(1);
  });

  it('partial word matching works', async () => {
    await api.createNote({ title: 'Development', body: 'Software development notes' });

    const results = await api.search('develop*');
    expect(results).toHaveLength(1);
  });
});
