import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './test-db.ts';
import { createKeeperDB } from '../db-impl.ts';
import type { KeeperDB } from '../types.ts';

describe('Auto tag rules', () => {
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

  it('creates, updates, and deletes rules with tag names', async () => {
    const created = await api.createAutoTagRule({
      pattern: 'example\\.com',
      tagNames: ['read later', 'web'],
    });
    expect(created.pattern).toBe('example\\.com');
    expect(created.tagNames[0]).toBe('read later');
    expect(created.tagNames[1]).toBe('web');

    let rules = await api.getAutoTagRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.pattern).toBe('example\\.com');

    const updated = await api.updateAutoTagRule({
      id: created.id,
      pattern: 'docs\\.example',
      tagNames: ['docs'],
    });
    expect(updated.pattern).toBe('docs\\.example');
    expect(updated.tagNames[0]).toBe('docs');

    await api.deleteAutoTagRule(created.id);
    rules = await api.getAutoTagRules();
    expect(updated.id).toBe(created.id);
    expect(rules).toHaveLength(0);
  });

  it('rejects empty patterns, invalid regexes, and empty tag lists', async () => {
    await expect(api.createAutoTagRule({ pattern: '', tagNames: ['x'] })).rejects.toThrow('Pattern is required');
    await expect(api.createAutoTagRule({ pattern: '[', tagNames: ['x'] })).rejects.toThrow('valid regular expression');
    await expect(api.createAutoTagRule({ pattern: 'example', tagNames: [] })).rejects.toThrow('At least one tag');
  });

  it('matches rules against extracted URLs only', async () => {
    const urlNote = await api.createNote({ body: 'read https://example.com/path soon' });
    const textOnlyNote = await api.createNote({ body: 'example.com appears without a URL scheme' });
    await api.createAutoTagRule({ pattern: 'example\\.com', tagNames: ['link'] });

    const result = await api.runAutoTagRules();
    expect(result.matchedNoteCount).toBe(1);
    expect(result.archivedNoteCount).toBe(1);
    expect(result.appliedTagCount).toBe(1);

    const tagged = await api.getNote(urlNote.id);
    expect(tagged?.tags[0]?.name).toBe('link');
    expect(tagged?.archived).toBe(true);

    const untouched = await api.getNote(textOnlyNote.id);
    expect(untouched?.body).toBe('example.com appears without a URL scheme');
    expect(untouched?.archived).toBe(false);
    expect(untouched?.tags.some((tag) => tag.name === 'link')).toBe(false);
  });

  it('applies the union of tags from all matching rules and archives once', async () => {
    const note = await api.createNote({
      body: 'Useful links: https://Docs.Example.com/guide and https://example.com/home',
    });
    await api.createAutoTagRule({ pattern: 'example\\.com', tagNames: ['web', 'shared'] });
    await api.createAutoTagRule({ pattern: 'docs\\.example\\.com', tagNames: ['docs', 'shared'] });

    const result = await api.runAutoTagRules();
    expect(result.matchedNoteCount).toBe(1);
    expect(result.archivedNoteCount).toBe(1);
    expect(result.appliedTagCount).toBe(3);

    const updated = await api.getNote(note.id);
    const names = updated?.tags.map((tag) => tag.name).sort();
    expect(names?.[0]).toBe('docs');
    expect(names?.[1]).toBe('shared');
    expect(names?.[2]).toBe('web');
    expect(updated?.archived).toBe(true);
  });

  it('reuses existing tags and only counts newly applied tag links', async () => {
    const note = await api.createNote({ body: 'https://example.com' });
    await api.addTag(note.id, 'existing');
    const tagsBefore = await api.getAllTags();
    expect(tagsBefore).toHaveLength(1);
    expect(tagsBefore[0]?.name).toBe('existing');

    await api.createAutoTagRule({ pattern: 'example\\.com', tagNames: ['existing', 'new'] });
    const result = await api.runAutoTagRules();
    expect(result.appliedTagCount).toBe(1);

    const tagsAfter = await api.getAllTags();
    expect(tagsAfter).toHaveLength(2);
    expect(tagsAfter[0]?.name).toBe('existing');
    expect(tagsAfter[1]?.name).toBe('new');

    const updated = await api.getNote(note.id);
    expect(updated?.tags.map((tag) => tag.name).sort()).toEqual(['existing', 'new']);
  });

  it('only runs rules against active notes', async () => {
    const active = await api.createNote({ body: 'https://active.example.com' });
    const archived = await api.createNote({ body: 'https://archived.example.com' });
    const trashed = await api.createNote({ body: 'https://trashed.example.com' });
    await api.toggleArchiveNote(archived.id);
    await api.trashNote(trashed.id);
    await api.createAutoTagRule({ pattern: 'example\\.com', tagNames: ['matched'] });

    const result = await api.runAutoTagRules();
    expect(result.matchedNoteCount).toBe(1);
    expect(result.archivedNoteCount).toBe(1);

    const activeAfter = await api.getNote(active.id);
    expect(activeAfter?.archived).toBe(true);
    expect(activeAfter?.tags[0]?.name).toBe('matched');

    const archivedAfter = await api.getNote(archived.id);
    expect(archivedAfter?.archived).toBe(true);
    expect(archivedAfter?.tags.some((tag) => tag.name === 'matched')).toBe(false);

    const trashedAfter = await api.getNote(trashed.id);
    expect(trashedAfter?.trashed).toBe(true);
    expect(trashedAfter?.tags.some((tag) => tag.name === 'matched')).toBe(false);
  });
});
