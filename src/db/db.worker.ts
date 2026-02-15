'use no memo';
/// <reference lib="webworker" />

import * as Comlink from 'comlink';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Sqlite3Static, OpfsDatabase, SqlValue } from '@sqlite.org/sqlite-wasm';
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

let db: OpfsDatabase;
let sqlite3: Sqlite3Static;

const ready: Promise<void> = (async () => {
  sqlite3 = await sqlite3InitModule();
  db = new sqlite3.oo1.OpfsDb('/keeper.sqlite3', 'cw');
  db.exec(SCHEMA_SQL);
})();

// ── Helpers ───────────────────────────────────────────────────

function rowToNote(row: Record<string, SqlValue>): Note {
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
  const tags: Tag[] = [];
  db.exec({
    sql: `SELECT t.id, t.name FROM tags t
          JOIN note_tags nt ON nt.tag_id = t.id
          WHERE nt.note_id = ?`,
    bind: [noteId],
    rowMode: 'object',
    callback: (row: Record<string, SqlValue>) => {
      tags.push({ id: row['id'] as number, name: row['name'] as string });
    },
  });
  return tags;
}

function withTags(note: Note): NoteWithTags {
  return { ...note, tags: getTagsForNote(note.id) };
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf',
  };
  return map[mime] ?? 'bin';
}

// ── KeeperDB implementation ──────────────────────────────────

const api: KeeperDB = {
  async createNote(input: CreateNoteInput): Promise<NoteWithTags> {
    await ready;
    const id = crypto.randomUUID();
    const title = input.title ?? '';
    const body = input.body;
    const hasLinks = containsUrl(body) ? 1 : 0;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    db.exec({
      sql: `INSERT INTO notes (id, title, body, has_links, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      bind: [id, title, body, hasLinks, now, now],
    });

    return withTags({
      id,
      title,
      body,
      has_links: hasLinks === 1,
      created_at: now,
      updated_at: now,
    });
  },

  async getNote(id: string): Promise<NoteWithTags | null> {
    await ready;
    const rows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: 'SELECT * FROM notes WHERE id = ?',
      bind: [id],
      rowMode: 'object',
      resultRows: rows,
    });
    const row = rows[0];
    if (!row) return null;
    return withTags(rowToNote(row));
  },

  async getAllNotes(): Promise<NoteWithTags[]> {
    await ready;
    const rows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: 'SELECT * FROM notes ORDER BY updated_at DESC',
      rowMode: 'object',
      resultRows: rows,
    });
    return rows.map((r) => withTags(rowToNote(r)));
  },

  async updateNote(input: UpdateNoteInput): Promise<NoteWithTags> {
    await ready;
    const existing = await this.getNote(input.id);
    if (!existing) throw new Error(`Note not found: ${input.id}`);

    const title = input.title ?? existing.title;
    const body = input.body ?? existing.body;
    const hasLinks = containsUrl(body) ? 1 : 0;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    db.exec({
      sql: `UPDATE notes SET title = ?, body = ?, has_links = ?, updated_at = ?
            WHERE id = ?`,
      bind: [title, body, hasLinks, now, input.id],
    });

    return withTags({
      ...existing,
      title,
      body,
      has_links: hasLinks === 1,
      updated_at: now,
    });
  },

  async deleteNote(id: string): Promise<void> {
    await ready;
    // Clean up OPFS media files
    const mediaRows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: 'SELECT id, mime_type FROM media WHERE note_id = ?',
      bind: [id],
      rowMode: 'object',
      resultRows: mediaRows,
    });
    for (const m of mediaRows) {
      const filename = `${m['id'] as string}.${mimeToExt(m['mime_type'] as string)}`;
      try {
        const root = await navigator.storage.getDirectory();
        const mediaDir = await root.getDirectoryHandle('media');
        await mediaDir.removeEntry(filename);
      } catch {
        // file may not exist
      }
    }
    db.exec({ sql: 'DELETE FROM notes WHERE id = ?', bind: [id] });
  },

  async deleteNotes(ids: string[]): Promise<void> {
    await ready;
    for (const id of ids) {
      await this.deleteNote(id);
    }
  },

  async addTag(noteId: string, tagName: string): Promise<NoteWithTags> {
    await ready;
    db.exec({
      sql: 'INSERT OR IGNORE INTO tags (name) VALUES (?)',
      bind: [tagName],
    });

    const tagRows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: 'SELECT id FROM tags WHERE name = ?',
      bind: [tagName],
      rowMode: 'object',
      resultRows: tagRows,
    });
    const tagId = tagRows[0]!['id'] as number;

    db.exec({
      sql: 'INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)',
      bind: [noteId, tagId],
    });

    const note = await this.getNote(noteId);
    if (!note) throw new Error(`Note not found: ${noteId}`);
    return note;
  },

  async removeTag(noteId: string, tagName: string): Promise<NoteWithTags> {
    await ready;
    db.exec({
      sql: `DELETE FROM note_tags WHERE note_id = ? AND tag_id = (
              SELECT id FROM tags WHERE name = ?
            )`,
      bind: [noteId, tagName],
    });

    const note = await this.getNote(noteId);
    if (!note) throw new Error(`Note not found: ${noteId}`);
    return note;
  },

  async renameTag(oldName: string, newName: string): Promise<void> {
    await ready;
    db.exec({
      sql: 'UPDATE tags SET name = ? WHERE name = ?',
      bind: [newName, oldName],
    });
  },

  async getAllTags(): Promise<Tag[]> {
    await ready;
    const rows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: 'SELECT id, name FROM tags ORDER BY name',
      rowMode: 'object',
      resultRows: rows,
    });
    return rows.map((r) => ({ id: r['id'] as number, name: r['name'] as string }));
  },

  async search(query: string): Promise<SearchResult[]> {
    await ready;
    const rows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: `SELECT n.*, rank
            FROM notes_fts fts
            JOIN notes n ON n.rowid = fts.rowid
            WHERE notes_fts MATCH ?
            ORDER BY rank`,
      bind: [query],
      rowMode: 'object',
      resultRows: rows,
    });
    return rows.map((r) => ({
      ...withTags(rowToNote(r)),
      rank: r['rank'] as number,
    }));
  },

  async getUntaggedNotes(): Promise<NoteWithTags[]> {
    await ready;
    const rows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: `SELECT * FROM notes
            WHERE id NOT IN (SELECT note_id FROM note_tags)
            ORDER BY updated_at DESC`,
      rowMode: 'object',
      resultRows: rows,
    });
    return rows.map((r) => withTags(rowToNote(r)));
  },

  async getLinkedNotes(): Promise<NoteWithTags[]> {
    await ready;
    const rows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: `SELECT * FROM notes WHERE has_links = 1 ORDER BY updated_at DESC`,
      rowMode: 'object',
      resultRows: rows,
    });
    return rows.map((r) => withTags(rowToNote(r)));
  },

  async storeMedia(input: StoreMediaInput): Promise<Media> {
    await ready;
    const id = crypto.randomUUID();
    const ext = mimeToExt(input.mimeType);
    const filename = `${id}.${ext}`;

    // Write to OPFS
    const root = await navigator.storage.getDirectory();
    const mediaDir = await root.getDirectoryHandle('media', { create: true });
    const fileHandle = await mediaDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(input.data);
    await writable.close();

    // Record in DB
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    db.exec({
      sql: `INSERT INTO media (id, note_id, mime_type, filename, created_at)
            VALUES (?, ?, ?, ?, ?)`,
      bind: [id, input.noteId, input.mimeType, filename, now],
    });

    return { id, note_id: input.noteId, mime_type: input.mimeType, filename, created_at: now };
  },

  async getMedia(id: string): Promise<ArrayBuffer | null> {
    await ready;
    const rows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: 'SELECT filename FROM media WHERE id = ?',
      bind: [id],
      rowMode: 'object',
      resultRows: rows,
    });
    const row = rows[0];
    if (!row) return null;

    try {
      const root = await navigator.storage.getDirectory();
      const mediaDir = await root.getDirectoryHandle('media');
      const fileHandle = await mediaDir.getFileHandle(row['filename'] as string);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch {
      return null;
    }
  },

  async deleteMedia(id: string): Promise<void> {
    await ready;
    const rows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: 'SELECT filename FROM media WHERE id = ?',
      bind: [id],
      rowMode: 'object',
      resultRows: rows,
    });
    const row = rows[0];
    if (row) {
      try {
        const root = await navigator.storage.getDirectory();
        const mediaDir = await root.getDirectoryHandle('media');
        await mediaDir.removeEntry(row['filename'] as string);
      } catch {
        // file may not exist
      }
    }
    db.exec({ sql: 'DELETE FROM media WHERE id = ?', bind: [id] });
  },

  async getMediaForNote(noteId: string): Promise<Media[]> {
    await ready;
    const rows: Record<string, SqlValue>[] = [];
    db.exec({
      sql: 'SELECT * FROM media WHERE note_id = ? ORDER BY created_at',
      bind: [noteId],
      rowMode: 'object',
      resultRows: rows,
    });
    return rows.map((r) => ({
      id: r['id'] as string,
      note_id: r['note_id'] as string,
      mime_type: r['mime_type'] as string,
      filename: r['filename'] as string,
      created_at: r['created_at'] as string,
    }));
  },
};

Comlink.expose(api);
