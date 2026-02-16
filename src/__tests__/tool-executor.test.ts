import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../db/__tests__/test-db.ts';
import { createKeeperDB } from '../db/db-impl.ts';
import type { KeeperDB } from '../db/types.ts';
import { executeTool } from '../llm/tools.ts';

describe('Tool executor', () => {
  let db: KeeperDB;
  let idCounter: number;

  beforeEach(() => {
    idCounter = 0;
    db = createKeeperDB({
      db: createTestDb(),
      generateId: () => `test-id-${String(++idCounter)}`,
      now: () => '2025-01-15 12:00:00',
    });
  });

  it('list_notes returns formatted note list', async () => {
    await db.createNote({ body: 'Hello world' });
    await db.createNote({ body: 'Second note' });
    const result = await executeTool(db, { name: 'list_notes', args: {} });
    expect(result.name).toBe('list_notes');
    expect(result.result).toContain('Hello world');
    expect(result.result).toContain('Second note');
    expect(result.result).toContain('test-id-1');
  });

  it('list_notes returns empty message when no notes', async () => {
    const result = await executeTool(db, { name: 'list_notes', args: {} });
    expect(result.result).toBe('No notes found.');
  });

  it('search_notes finds matching notes', async () => {
    await db.createNote({ body: 'Buy groceries' });
    await db.createNote({ body: 'Read a book' });
    const result = await executeTool(db, { name: 'search_notes', args: { query: 'groceries' } });
    expect(result.result).toContain('Buy groceries');
    expect(result.result).not.toContain('Read a book');
  });

  it('search_notes returns error for missing query', async () => {
    const result = await executeTool(db, { name: 'search_notes', args: {} });
    expect(result.result).toContain('Error');
    expect(result.result).toContain('query');
  });

  it('get_note returns a single note', async () => {
    await db.createNote({ body: 'Test note' });
    const result = await executeTool(db, { name: 'get_note', args: { id: 'test-id-1' } });
    expect(result.result).toContain('Test note');
    expect(result.result).toContain('test-id-1');
  });

  it('get_note returns not found for invalid id', async () => {
    const result = await executeTool(db, { name: 'get_note', args: { id: 'nonexistent' } });
    expect(result.result).toContain('not found');
  });

  it('create_note creates and returns new note', async () => {
    const result = await executeTool(db, { name: 'create_note', args: { body: 'New note from AI' } });
    expect(result.result).toContain('Note created');
    expect(result.result).toContain('New note from AI');
    const allNotes = await db.getAllNotes();
    expect(allNotes).toHaveLength(1);
    expect(allNotes[0]?.body).toBe('New note from AI');
  });

  it('create_note returns error for empty body', async () => {
    const result = await executeTool(db, { name: 'create_note', args: { body: '' } });
    expect(result.result).toContain('Error');
  });

  it('update_note updates and returns the note', async () => {
    await db.createNote({ body: 'Original' });
    const result = await executeTool(db, { name: 'update_note', args: { id: 'test-id-1', body: 'Updated' } });
    expect(result.result).toContain('Note updated');
    expect(result.result).toContain('Updated');
    const note = await db.getNote('test-id-1');
    expect(note?.body).toBe('Updated');
  });

  it('delete_note returns confirmation prompt instead of deleting', async () => {
    await db.createNote({ body: 'To delete' });
    const result = await executeTool(db, { name: 'delete_note', args: { id: 'test-id-1' } });
    expect(result.needsConfirmation).toBe(true);
    expect(result.result).toContain('Are you sure');
    // Note should still exist
    const note = await db.getNote('test-id-1');
    expect(note?.body).toBe('To delete');
  });

  it('confirm_delete_note actually deletes', async () => {
    await db.createNote({ body: 'To delete' });
    // Prove note exists before deletion
    const notesBefore = await db.getAllNotes();
    expect(notesBefore).toHaveLength(1);
    expect(notesBefore[0]?.body).toBe('To delete');

    const result = await executeTool(db, { name: 'confirm_delete_note', args: { id: 'test-id-1' } });
    expect(result.result).toContain('deleted');

    // Verify note no longer appears in any retrieval
    const notesAfter = await db.getAllNotes();
    expect(notesAfter).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'test-id-1' }),
    ]));
  });

  it('add_tag adds a tag to a note', async () => {
    await db.createNote({ body: 'Test' });
    const result = await executeTool(db, { name: 'add_tag', args: { note_id: 'test-id-1', tag_name: 'important' } });
    expect(result.result).toContain('Tag "important" added');
    const note = await db.getNote('test-id-1');
    expect(note?.tags[0]?.name).toBe('important');
  });

  it('remove_tag removes a tag from a note', async () => {
    await db.createNote({ body: 'Test' });
    await db.addTag('test-id-1', 'remove-me');
    // Prove tag exists before removal
    const before = await db.getNote('test-id-1');
    expect(before?.tags).toHaveLength(1);
    expect(before?.tags[0]?.name).toBe('remove-me');

    const result = await executeTool(db, { name: 'remove_tag', args: { note_id: 'test-id-1', tag_name: 'remove-me' } });
    expect(result.result).toContain('Tag "remove-me" removed');
    const after = await db.getNote('test-id-1');
    expect(after?.tags).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'remove-me' })]),
    );
  });

  it('list_tags returns all tags', async () => {
    await db.createNote({ body: 'Test' });
    await db.addTag('test-id-1', 'alpha');
    await db.addTag('test-id-1', 'beta');
    const result = await executeTool(db, { name: 'list_tags', args: {} });
    expect(result.result).toContain('alpha');
    expect(result.result).toContain('beta');
  });

  it('toggle_pin toggles pinned status', async () => {
    await db.createNote({ body: 'Test' });
    const result = await executeTool(db, { name: 'toggle_pin', args: { id: 'test-id-1' } });
    expect(result.result).toContain('pinned');
    const note = await db.getNote('test-id-1');
    expect(note?.pinned).toBe(true);
  });

  it('toggle_archive toggles archived status', async () => {
    await db.createNote({ body: 'Test' });
    const result = await executeTool(db, { name: 'toggle_archive', args: { id: 'test-id-1' } });
    expect(result.result).toContain('archived');
    const note = await db.getNote('test-id-1');
    expect(note?.archived).toBe(true);
  });

  it('unknown tool returns error', async () => {
    const result = await executeTool(db, { name: 'nonexistent_tool', args: {} });
    expect(result.result).toContain('Error');
    expect(result.result).toContain('Unknown tool');
  });

  it('returns error for missing required parameters', async () => {
    const result = await executeTool(db, { name: 'get_note', args: {} });
    expect(result.result).toContain('Error');
    expect(result.result).toContain('"id"');
  });
});
