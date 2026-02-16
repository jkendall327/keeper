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
      generateId: () => `test-id-${String(++idCounter)}`,
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
    const matchResults = await api.search('test');
    expect(matchResults).toHaveLength(1);
    expect(matchResults[0]?.title).toBe('Test');
    const results = await api.search('nonexistent');
    expect(results).toEqual([]);
  });

  it('search is case-insensitive', async () => {
    await api.createNote({ title: 'JavaScript Tutorial', body: 'Learn coding' });

    const results1 = await api.search('javascript');
    const results2 = await api.search('JAVASCRIPT');
    const results3 = await api.search('JaVaScRiPt');

    expect(results1).toHaveLength(1);
    expect(results1[0]?.title).toBe('JavaScript Tutorial');
    expect(results2).toHaveLength(1);
    expect(results2[0]?.title).toBe('JavaScript Tutorial');
    expect(results3).toHaveLength(1);
    expect(results3[0]?.title).toBe('JavaScript Tutorial');
  });

  it('returns results with rank', async () => {
    await api.createNote({ title: 'Test', body: 'Content' });
    const results = await api.search('test');
    expect(results).toHaveLength(1);
    // FTS5 ranks are negative (lower = better match)
    expect(results[0]?.rank).toBeLessThan(0);
  });

  it('re-indexes after note update (finds new content)', async () => {
    const note = await api.createNote({ title: 'Original', body: 'Old content' });

    const beforeResults = await api.search('updated');
    expect(beforeResults).toHaveLength(0);

    await api.updateNote({ id: note.id, body: 'Updated content' });

    const afterResults = await api.search('updated');
    expect(afterResults).toHaveLength(1);
    expect(afterResults[0]?.body).toBe('Updated content');
  });

  it('removes from index after note delete (no stale results)', async () => {
    const note = await api.createNote({ title: 'To Delete', body: 'This will be removed' });

    const beforeResults = await api.search('delete');
    expect(beforeResults).toHaveLength(1);
    expect(beforeResults[0]?.title).toBe('To Delete');

    await api.deleteNote(note.id);

    const afterResults = await api.search('delete');
    expect(afterResults).toHaveLength(0);
  });

  it('handles special characters without crashing', async () => {
    await api.createNote({ title: 'Special @#$%', body: 'Chars & symbols!' });

    // Should not throw
    const results = await api.search('special');
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Special @#$%');
  });

  it('returns results with tags attached', async () => {
    const note = await api.createNote({ title: 'Tagged Note', body: 'Content' });
    await api.addTag(note.id, 'important');

    const results = await api.search('tagged');
    expect(results[0]?.tags).toEqual([{ id: 1, name: 'important', icon: null }]);
  });

  it('finds matches in both title and body', async () => {
    await api.createNote({ title: 'React Tutorial', body: 'Learn React hooks' });

    const results = await api.search('react');
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('React Tutorial');
  });

  it('partial word matching works with explicit wildcard', async () => {
    await api.createNote({ title: 'Development', body: 'Software development notes' });

    const results = await api.search('develop*');
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Development');
  });

  it('automatic prefix matching on last word', async () => {
    await api.createNote({ title: 'Development', body: 'Software development notes' });

    // 'develop' should automatically match 'development'
    const results = await api.search('develop');
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Development');
  });

  it('prefix matching works on single long token', async () => {
    await api.createNote({ title: 'woooohoooooo', body: 'excitement' });

    const results = await api.search('wooo');
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('woooohoooooo');
  });

  it('prefix matching on multi-word query', async () => {
    await api.createNote({ title: 'Quick Notes', body: 'Fast note taking' });
    await api.createNote({ title: 'Quick Reference', body: 'Handy guide' });

    // 'quick not' should match 'Quick Notes' (prefix on 'not')
    const results = await api.search('quick not');
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('Quick Notes');
  });

  it('handles empty query gracefully', async () => {
    await api.createNote({ title: 'Test', body: 'Content' });
    // Positive case: non-empty query finds the note
    const found = await api.search('test');
    expect(found).toHaveLength(1);
    expect(found[0]?.title).toBe('Test');
    // Empty query returns nothing
    const results = await api.search('');
    expect(results).toEqual([]);
  });

  it('handles whitespace-only query gracefully', async () => {
    await api.createNote({ title: 'Test', body: 'Content' });
    // Positive case: normal query finds the note
    const found = await api.search('content');
    expect(found).toHaveLength(1);
    expect(found[0]?.body).toBe('Content');
    // Whitespace-only returns nothing
    const results = await api.search('   ');
    expect(results).toEqual([]);
  });

  it('escapes special characters safely', async () => {
    await api.createNote({ title: 'C++ Programming', body: 'Learn C++' });

    // Should not throw, should find the note
    const results = await api.search('C++');
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('C++ Programming');
  });

  it('handles queries with quotes', async () => {
    await api.createNote({ title: 'The "Best" Tutorial', body: 'Top rated' });

    // Quotes should be escaped and not cause syntax errors
    const results = await api.search('"best"');
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe('The "Best" Tutorial');
  });
});
