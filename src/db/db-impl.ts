'use no memo';

import type { SqliteDb, SqlRow } from './sqlite-db.ts';
import { SCHEMA_SQL } from './schema.ts';
import { containsUrl } from './url-detect.ts';
import type {
  KeeperDB,
  Note,
  NoteWithTags,
  Tag,
  Media,
  SearchResult,
  CreateNoteInput,
  UpdateNoteInput,
  StoreMediaInput,
} from './types.ts';

/** Dependencies injected into the DB implementation */
export interface KeeperDBDeps {
  db: SqliteDb;
  generateId: () => string;
  now: () => string;
}

export function createKeeperDB(deps: KeeperDBDeps): KeeperDB {
  const { db, generateId, now } = deps;

  // Initialize schema
  db.execRaw(SCHEMA_SQL);

  // ── Helpers ───────────────────────────────────────────────────

  /**
   * Prepares user input for FTS5 MATCH query with automatic prefix matching.
   * - Escapes special FTS5 characters by quoting each word
   * - Appends * wildcard to the last word for prefix matching
   * - Handles empty/whitespace-only input
   *
   * Examples:
   * - 'hello' → '"hello"*'
   * - 'quick note' → '"quick" "note"*'
   * - 'C++' → '"C++"*'
   */
  function prepareFts5Query(input: string): string {
    const trimmed = input.trim();
    if (trimmed === '') return '';

    // Split into words and filter empty strings
    const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return '';

    // Quote each word to escape special characters, append * to last word
    const quotedWords = words.map((word, i) => {
      // Escape double quotes in the word by doubling them
      const escaped = word.replace(/"/g, '""');
      // Add * to last word for prefix matching
      const suffix = i === words.length - 1 ? '*' : '';
      return `"${escaped}"${suffix}`;
    });

    return quotedWords.join(' ');
  }

  function rowToNote(row: SqlRow): Note {
    return {
      id: row['id'] as string,
      title: row['title'] as string,
      body: row['body'] as string,
      has_links: row['has_links'] === 1,
      created_at: row['created_at'] as string,
      updated_at: row['updated_at'] as string,
    };
  }

  function getTagsForNote(noteId: string): Tag[] {
    const rows = db.query(
      `SELECT t.id, t.name FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id
       WHERE nt.note_id = ?`,
      [noteId],
    );
    return rows.map((r) => ({ id: r['id'] as number, name: r['name'] as string }));
  }

  function withTags(note: Note): NoteWithTags {
    return { ...note, tags: getTagsForNote(note.id) };
  }

  // ── KeeperDB implementation ──────────────────────────────────

  const api: KeeperDB = {
    async createNote(input: CreateNoteInput): Promise<NoteWithTags> {
      const id = generateId();
      const title = input.title ?? '';
      const body = input.body;
      const hasLinks = containsUrl(body) ? 1 : 0;
      const timestamp = now();

      db.run(
        `INSERT INTO notes (id, title, body, has_links, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, title, body, hasLinks, timestamp, timestamp],
      );

      return withTags({
        id,
        title,
        body,
        has_links: hasLinks === 1,
        created_at: timestamp,
        updated_at: timestamp,
      });
    },

    async getNote(id: string): Promise<NoteWithTags | null> {
      const rows = db.query('SELECT * FROM notes WHERE id = ?', [id]);
      const row = rows[0];
      if (row === undefined) return null;
      return withTags(rowToNote(row));
    },

    async getAllNotes(): Promise<NoteWithTags[]> {
      const rows = db.query('SELECT * FROM notes ORDER BY updated_at DESC');
      return rows.map((r) => withTags(rowToNote(r)));
    },

    async updateNote(input: UpdateNoteInput): Promise<NoteWithTags> {
      const existing = await api.getNote(input.id);
      if (existing === null) throw new Error(`Note not found: ${input.id}`);

      const title = input.title ?? existing.title;
      const body = input.body ?? existing.body;
      const hasLinks = containsUrl(body) ? 1 : 0;
      const timestamp = now();

      db.run(
        `UPDATE notes SET title = ?, body = ?, has_links = ?, updated_at = ?
         WHERE id = ?`,
        [title, body, hasLinks, timestamp, input.id],
      );

      return withTags({
        ...existing,
        title,
        body,
        has_links: hasLinks === 1,
        updated_at: timestamp,
      });
    },

    async deleteNote(id: string): Promise<void> {
      db.run('DELETE FROM notes WHERE id = ?', [id]);
    },

    async deleteNotes(ids: string[]): Promise<void> {
      for (const id of ids) {
        await api.deleteNote(id);
      }
    },

    async addTag(noteId: string, tagName: string): Promise<NoteWithTags> {
      // Check if note exists first to give a better error message
      const existing = await api.getNote(noteId);
      if (existing === null) throw new Error(`Note not found: ${noteId}`);

      db.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName]);

      const tagRows = db.query('SELECT id FROM tags WHERE name = ?', [tagName]);
      const tagRow = tagRows[0];
      if (tagRow === undefined) throw new Error(`Tag not found: ${tagName}`);
      const tagId = tagRow['id'] as number;

      db.run('INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)', [noteId, tagId]);

      const note = await api.getNote(noteId);
      if (note === null) throw new Error(`Note not found: ${noteId}`);
      return note;
    },

    async removeTag(noteId: string, tagName: string): Promise<NoteWithTags> {
      db.run(
        `DELETE FROM note_tags WHERE note_id = ? AND tag_id = (
           SELECT id FROM tags WHERE name = ?
         )`,
        [noteId, tagName],
      );

      const note = await api.getNote(noteId);
      if (note === null) throw new Error(`Note not found: ${noteId}`);
      return note;
    },

    async renameTag(oldName: string, newName: string): Promise<void> {
      db.run('UPDATE tags SET name = ? WHERE name = ?', [newName, oldName]);
    },

    async getAllTags(): Promise<Tag[]> {
      const rows = db.query('SELECT id, name FROM tags ORDER BY name');
      return rows.map((r) => ({ id: r['id'] as number, name: r['name'] as string }));
    },

    async search(query: string): Promise<SearchResult[]> {
      const fts5Query = prepareFts5Query(query);
      if (fts5Query === '') return [];

      const rows = db.query(
        `SELECT n.*, rank
         FROM notes_fts fts
         JOIN notes n ON n.rowid = fts.rowid
         WHERE notes_fts MATCH ?
         ORDER BY rank`,
        [fts5Query],
      );
      return rows.map((r) => ({
        ...withTags(rowToNote(r)),
        rank: r['rank'] as number,
      }));
    },

    async getUntaggedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        `SELECT * FROM notes
         WHERE id NOT IN (SELECT note_id FROM note_tags)
         ORDER BY updated_at DESC`,
      );
      return rows.map((r) => withTags(rowToNote(r)));
    },

    async getLinkedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query('SELECT * FROM notes WHERE has_links = 1 ORDER BY updated_at DESC');
      return rows.map((r) => withTags(rowToNote(r)));
    },

    async getNotesForTag(tagId: number): Promise<NoteWithTags[]> {
      const rows = db.query(
        `SELECT n.* FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id
         WHERE nt.tag_id = ?
         ORDER BY n.updated_at DESC`,
        [tagId],
      );
      return rows.map((r) => withTags(rowToNote(r)));
    },

    async storeMedia(_input: StoreMediaInput): Promise<Media> {
      throw new Error('storeMedia: must be implemented by worker with OPFS access');
    },

    async getMedia(_id: string): Promise<ArrayBuffer | null> {
      throw new Error('getMedia: must be implemented by worker with OPFS access');
    },

    async deleteMedia(_id: string): Promise<void> {
      throw new Error('deleteMedia: must be implemented by worker with OPFS access');
    },

    async getMediaForNote(noteId: string): Promise<Media[]> {
      const rows = db.query('SELECT * FROM media WHERE note_id = ? ORDER BY created_at', [noteId]);
      return rows.map((r) => ({
        id: r['id'] as string,
        note_id: r['note_id'] as string,
        mime_type: r['mime_type'] as string,
        filename: r['filename'] as string,
        created_at: r['created_at'] as string,
      }));
    },
  };

  return api;
}
