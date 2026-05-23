import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../db/__tests__/test-db.ts';
import { createKeeperDB } from '../db/db-impl.ts';
import type { KeeperClient } from '../db/db-client.ts';
import { toNoteId, type KeeperDB } from '../db/types.ts';
import { executeTool, parseToolCall } from '../llm/tools.ts';

describe('Tool executor', () => {
  let db: KeeperDB;
  let keeper: KeeperClient;
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    db = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${String(++idCounter)}`,
      now: () => '2025-01-15 12:00:00',
    });
    keeper = localKeeperClient(db);
  });

  it('list_notes returns formatted note list', async () => {
    await db.createNote({ body: 'Hello world' });
    await db.createNote({ body: 'Second note' });
    const result = await executeTool(keeper, { name: 'list_notes', args: {} });
    expect(result.name).toBe('list_notes');
    expect(result.result).toContain('Hello world');
    expect(result.result).toContain('Second note');
    expect(result.result).toContain('test-id-1');
  });

  it('list_notes returns empty message when no notes', async () => {
    const result = await executeTool(keeper, { name: 'list_notes', args: {} });
    expect(result.result).toBe('No notes found.');
  });

  it('search_notes finds matching notes', async () => {
    await db.createNote({ body: 'Buy groceries' });
    await db.createNote({ body: 'Read a book' });
    const result = await executeTool(keeper, { name: 'search_notes', args: { query: 'groceries' } });
    expect(result.result).toContain('Buy groceries');
    expect(result.result).not.toContain('Read a book');
  });

  it('rejects search_notes calls with a missing query at the parse boundary', () => {
    expect(parseToolCall('search_notes', {})).toBeNull();
  });

  it('get_note returns a single note', async () => {
    await db.createNote({ body: 'Test note' });
    const result = await executeTool(keeper, { name: 'get_note', args: { id: 'test-id-1' } });
    expect(result.result).toContain('Test note');
    expect(result.result).toContain('test-id-1');
  });

  it('get_note returns not found for invalid id', async () => {
    const result = await executeTool(keeper, { name: 'get_note', args: { id: 'nonexistent' } });
    expect(result.result).toContain('not found');
  });

  it('display_notes returns ordered note link snapshots for valid and missing IDs', async () => {
    await db.createNote({ title: 'First', body: 'Visible note body' });
    await db.createNote({ title: 'Second', body: 'Second body' });
    await db.addTag(toNoteId('test-id-2'), 'work');

    const result = await executeTool(keeper, {
      name: 'display_notes',
      args: { ids: ['test-id-2', 'missing', 'test-id-1'] },
    });

    expect(result.result).toContain('Displayed 2 notes');
    expect(result.noteLinks?.map((link) => [link.id, link.status])).toEqual([
      ['test-id-2', 'found'],
      ['missing', 'missing'],
      ['test-id-1', 'found'],
    ]);
    expect(result.noteLinks?.[0]?.note).toMatchObject({
      id: 'test-id-2',
      title: 'Second',
      bodyPreview: 'Second body',
      tags: [expect.objectContaining({ name: 'work' })],
    });
    expect(result.noteLinks?.[1]?.note).toBeNull();
  });

  it('display_notes returns an error for invalid ids argument', () => {
    expect(parseToolCall('display_notes', { ids: 'test-id-1' })).toBeNull();
  });

  it('create_note creates and returns new note', async () => {
    const result = await executeTool(keeper, { name: 'create_note', args: { body: 'New note from AI' } });
    expect(result.result).toContain('Note created');
    expect(result.result).toContain('New note from AI');
    const allNotes = await db.getAllNotes();
    expect(allNotes).toHaveLength(1);
    expect(allNotes[0]?.body).toBe('New note from AI');
  });

  it('create_note returns error for empty body', () => {
    expect(parseToolCall('create_note', { body: '' })).toBeNull();
  });

  it('update_note updates and returns the note', async () => {
    await db.createNote({ body: 'Original' });
    const result = await executeTool(keeper, { name: 'update_note', args: { id: 'test-id-1', body: 'Updated' } });
    expect(result.result).toContain('Note updated');
    expect(result.result).toContain('Updated');
    const note = await db.getNote(toNoteId('test-id-1'));
    expect(note?.body).toBe('Updated');
  });

  it('delete_note returns confirmation prompt instead of deleting', async () => {
    await db.createNote({ body: 'To delete' });
    const result = await executeTool(keeper, { name: 'delete_note', args: { id: 'test-id-1' } });
    expect(result.needsConfirmation).toBe(true);
    expect(result.result).toContain('Are you sure');
    // Note should still exist
    const note = await db.getNote(toNoteId('test-id-1'));
    expect(note?.body).toBe('To delete');
  });

  it('confirm_delete_note actually deletes', async () => {
    await db.createNote({ body: 'To delete' });
    // Prove note exists before deletion
    const notesBefore = await db.getAllNotes();
    expect(notesBefore).toHaveLength(1);
    expect(notesBefore[0]?.body).toBe('To delete');

    const result = await executeTool(keeper, { name: 'confirm_delete_note', args: { id: 'test-id-1' } });
    expect(result.result).toContain('deleted');

    // Verify note no longer appears in any retrieval
    const notesAfter = await db.getAllNotes();
    expect(notesAfter).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'test-id-1' }),
    ]));
  });

  it('add_tag adds a tag to a note', async () => {
    await db.createNote({ body: 'Test' });
    const result = await executeTool(keeper, { name: 'add_tag', args: { note_id: 'test-id-1', tag_name: 'important' } });
    expect(result.result).toContain('Tag "important" added');
    const note = await db.getNote(toNoteId('test-id-1'));
    expect(note?.tags[0]?.name).toBe('important');
  });

  it('remove_tag removes a tag from a note', async () => {
    await db.createNote({ body: 'Test' });
    await db.addTag(toNoteId('test-id-1'), 'remove-me');
    // Prove tag exists before removal
    const before = await db.getNote(toNoteId('test-id-1'));
    expect(before?.tags).toHaveLength(1);
    expect(before?.tags[0]?.name).toBe('remove-me');

    const result = await executeTool(keeper, { name: 'remove_tag', args: { note_id: 'test-id-1', tag_name: 'remove-me' } });
    expect(result.result).toContain('Tag "remove-me" removed');
    const after = await db.getNote(toNoteId('test-id-1'));
    expect(after?.tags).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'remove-me' })]),
    );
  });

  it('list_tags returns all tags', async () => {
    await db.createNote({ body: 'Test' });
    await db.addTag(toNoteId('test-id-1'), 'alpha');
    await db.addTag(toNoteId('test-id-1'), 'beta');
    const result = await executeTool(keeper, { name: 'list_tags', args: {} });
    expect(result.result).toContain('alpha');
    expect(result.result).toContain('beta');
  });

  it('toggle_pin toggles pinned status', async () => {
    await db.createNote({ body: 'Test' });
    const result = await executeTool(keeper, { name: 'toggle_pin', args: { id: 'test-id-1' } });
    expect(result.result).toContain('pinned');
    const note = await db.getNote(toNoteId('test-id-1'));
    expect(note?.pinned).toBe(true);
  });

  it('toggle_archive toggles archived status', async () => {
    await db.createNote({ body: 'Test' });
    const result = await executeTool(keeper, { name: 'toggle_archive', args: { id: 'test-id-1' } });
    expect(result.result).toContain('archived');
    const note = await db.getNote(toNoteId('test-id-1'));
    expect(note?.archived).toBe(true);
  });

  it('unknown tool name is rejected by ToolName type at compile time', () => {
    // @ts-expect-error — ToolName union prevents unknown names at compile time
    const invalidCall: Parameters<typeof executeTool>[1] = { name: 'nonexistent_tool', args: {} };
    expect(invalidCall.name).toBe('nonexistent_tool');
  });

  it('returns error for missing required parameters', () => {
    expect(parseToolCall('get_note', {})).toBeNull();
  });

  it('get_notes_for_tag returns notes with the specified tag', async () => {
    await db.createNote({ body: 'Tagged note' });
    await db.createNote({ body: 'Untagged note' });
    await db.addTag(toNoteId('test-id-1'), 'work');
    const result = await executeTool(keeper, { name: 'get_notes_for_tag', args: { tag_name: 'work' } });
    expect(result.result).toContain('Tagged note');
    expect(result.result).not.toContain('Untagged note');
  });

  it('get_notes_for_tag returns error for nonexistent tag', async () => {
    const result = await executeTool(keeper, { name: 'get_notes_for_tag', args: { tag_name: 'nonexistent' } });
    expect(result.result).toContain('No tag named "nonexistent"');
  });

  it('get_notes_for_tag returns error for missing tag_name', () => {
    expect(parseToolCall('get_notes_for_tag', {})).toBeNull();
  });

  it('get_untagged_notes returns only untagged notes', async () => {
    await db.createNote({ body: 'Has tag' });
    await db.createNote({ body: 'No tag' });
    await db.addTag(toNoteId('test-id-1'), 'labeled');
    const result = await executeTool(keeper, { name: 'get_untagged_notes', args: {} });
    expect(result.result).toContain('No tag');
    expect(result.result).not.toContain('Has tag');
  });

  it('get_untagged_notes returns empty message when all notes tagged', async () => {
    await db.createNote({ body: 'Tagged' });
    await db.addTag(toNoteId('test-id-1'), 'something');
    const result = await executeTool(keeper, { name: 'get_untagged_notes', args: {} });
    expect(result.result).toBe('No untagged notes found.');
  });
});

function localKeeperClient(db: KeeperDB): KeeperClient {
  return {
    notes: {
      create: (input) => db.createNote(input),
      list: () => db.getAllNotes(),
      get: (id) => db.getNote(id),
      resolve: (ids) => db.resolveNotes(ids),
      update: (input) => db.updateNote(input),
      delete: (id) => db.deleteNote(id),
      deleteMany: (ids) => db.deleteNotes(ids),
      archiveMany: (ids) => db.archiveNotes(ids),
      archiveTagged: () => db.archiveTaggedNotes(),
      trash: (id) => db.trashNote(id),
      trashMany: (ids) => db.trashNotes(ids),
      restore: (id) => db.restoreNote(id),
      restoreMany: (ids) => db.restoreNotes(ids),
      togglePin: (id) => db.togglePinNote(id),
      toggleArchive: (id) => db.toggleArchiveNote(id),
    },
    tags: {
      list: () => db.getAllTags(),
      addToNote: (noteId, tagName) => db.addTag(noteId, tagName),
      removeFromNote: (noteId, tagName) => db.removeTag(noteId, tagName),
      addToNotes: (noteIds, tagName) => db.addTagToNotes(noteIds, tagName),
      removeFromNotes: (noteIds, tagName) => db.removeTagFromNotes(noteIds, tagName),
      popularSuggestions: (noteId, limit) => db.getPopularTagSuggestions(noteId, limit),
      rename: (oldName, newName) => db.renameTag(oldName, newName),
      updateIcon: (tagId, icon) => db.updateTagIcon(tagId, icon),
      delete: (tagId) => db.deleteTag(tagId),
    },
    search: { notes: (query) => db.search(query) },
    views: {
      untagged: () => db.getUntaggedNotes(),
      linked: () => db.getLinkedNotes(),
      duplicates: () => db.getDuplicateNotes(),
      archived: () => db.getArchivedNotes(),
      trashed: () => db.getTrashedNotes(),
      tag: (tagId) => db.getNotesForTag(tagId),
    },
    autoTagRules: {
      list: () => db.getAutoTagRules(),
      create: (input) => db.createAutoTagRule(input),
      update: (input) => db.updateAutoTagRule(input),
      delete: (id) => db.deleteAutoTagRule(id),
      run: () => db.runAutoTagRules(),
    },
    settings: {
      get: () => db.getAppSettings(),
      update: (input) => db.updateAppSettings(input),
    },
    media: {
      store: (input) => db.storeMedia(input),
      get: (id) => db.getMedia(id),
      delete: (id) => db.deleteMedia(id),
      listForNote: (noteId) => db.getMediaForNote(noteId),
    },
    linkMetadata: {
      get: (url) => db.getLinkMetadata(url),
    },
  };
}
