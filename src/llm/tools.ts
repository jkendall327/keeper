'use no memo';

import type { KeeperDB, NoteWithTags, Tag } from '../db/types.ts';

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  result: string;
  needsConfirmation?: boolean;
}

function formatNote(note: NoteWithTags): string {
  const tags = note.tags.map((t) => t.name).join(', ');
  const lines = [
    `ID: ${note.id}`,
    `Body: ${note.body}`,
    `Tags: ${tags !== '' ? tags : '(none)'}`,
    `Pinned: ${String(note.pinned)}`,
    `Archived: ${String(note.archived)}`,
    `Created: ${note.created_at}`,
    `Updated: ${note.updated_at}`,
  ];
  return lines.join('\n');
}

function formatTags(tags: Tag[]): string {
  if (tags.length === 0) return 'No tags found.';
  return tags.map((t) => `- ${t.name} (id: ${String(t.id)}${t.icon !== null ? `, icon: ${t.icon}` : ''})`).join('\n');
}

export async function executeTool(db: KeeperDB, call: ToolCall): Promise<ToolResult> {
  const { name, args } = call;

  switch (name) {
    case 'list_notes': {
      const notes = await db.getAllNotes();
      if (notes.length === 0) return { name, result: 'No notes found.' };
      return { name, result: notes.map(formatNote).join('\n---\n') };
    }

    case 'search_notes': {
      const query = args['query'];
      if (typeof query !== 'string' || query.trim() === '') {
        return { name, result: 'Error: "query" parameter is required and must be a non-empty string.' };
      }
      const results = await db.search(query);
      if (results.length === 0) return { name, result: `No notes matching "${query}".` };
      return { name, result: results.map(formatNote).join('\n---\n') };
    }

    case 'get_note': {
      const id = args['id'];
      if (typeof id !== 'string') {
        return { name, result: 'Error: "id" parameter is required and must be a string.' };
      }
      const note = await db.getNote(id);
      if (note === null) return { name, result: `Note "${id}" not found.` };
      return { name, result: formatNote(note) };
    }

    case 'create_note': {
      const body = args['body'];
      if (typeof body !== 'string' || body.trim() === '') {
        return { name, result: 'Error: "body" parameter is required and must be a non-empty string.' };
      }
      const note = await db.createNote({ body });
      return { name, result: `Note created.\n${formatNote(note)}` };
    }

    case 'update_note': {
      const id = args['id'];
      const body = args['body'];
      if (typeof id !== 'string') {
        return { name, result: 'Error: "id" parameter is required and must be a string.' };
      }
      if (typeof body !== 'string') {
        return { name, result: 'Error: "body" parameter is required and must be a string.' };
      }
      const note = await db.updateNote({ id, body });
      return { name, result: `Note updated.\n${formatNote(note)}` };
    }

    case 'delete_note': {
      const id = args['id'];
      if (typeof id !== 'string') {
        return { name, result: 'Error: "id" parameter is required and must be a string.' };
      }
      return { name, result: `Are you sure you want to delete note "${id}"? This cannot be undone.`, needsConfirmation: true };
    }

    case 'confirm_delete_note': {
      const id = args['id'];
      if (typeof id !== 'string') {
        return { name, result: 'Error: "id" parameter is required and must be a string.' };
      }
      await db.deleteNote(id);
      return { name, result: `Note "${id}" deleted.` };
    }

    case 'add_tag': {
      const noteId = args['note_id'];
      const tagName = args['tag_name'];
      if (typeof noteId !== 'string') {
        return { name, result: 'Error: "note_id" parameter is required and must be a string.' };
      }
      if (typeof tagName !== 'string' || tagName.trim() === '') {
        return { name, result: 'Error: "tag_name" parameter is required and must be a non-empty string.' };
      }
      const note = await db.addTag(noteId, tagName);
      return { name, result: `Tag "${tagName}" added.\n${formatNote(note)}` };
    }

    case 'remove_tag': {
      const noteId = args['note_id'];
      const tagName = args['tag_name'];
      if (typeof noteId !== 'string') {
        return { name, result: 'Error: "note_id" parameter is required and must be a string.' };
      }
      if (typeof tagName !== 'string') {
        return { name, result: 'Error: "tag_name" parameter is required and must be a string.' };
      }
      const note = await db.removeTag(noteId, tagName);
      return { name, result: `Tag "${tagName}" removed.\n${formatNote(note)}` };
    }

    case 'list_tags': {
      const tags = await db.getAllTags();
      return { name, result: formatTags(tags) };
    }

    case 'toggle_pin': {
      const id = args['id'];
      if (typeof id !== 'string') {
        return { name, result: 'Error: "id" parameter is required and must be a string.' };
      }
      const note = await db.togglePinNote(id);
      return { name, result: `Note ${note.pinned ? 'pinned' : 'unpinned'}.\n${formatNote(note)}` };
    }

    case 'toggle_archive': {
      const id = args['id'];
      if (typeof id !== 'string') {
        return { name, result: 'Error: "id" parameter is required and must be a string.' };
      }
      const note = await db.toggleArchiveNote(id);
      return { name, result: `Note ${note.archived ? 'archived' : 'unarchived'}.\n${formatNote(note)}` };
    }

    default:
      return { name, result: `Error: Unknown tool "${name}".` };
  }
}
