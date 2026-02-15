'use no memo';
/// <reference lib="webworker" />

import * as Comlink from 'comlink';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Sqlite3Static, OpfsDatabase, SqlValue } from '@sqlite.org/sqlite-wasm';
import { createKeeperDB } from './db-impl.ts';
import type { SqliteDb, SqlRow } from './sqlite-db.ts';
import type { KeeperDB, Media, StoreMediaInput } from './types.ts';

let db: OpfsDatabase;
let sqlite3: Sqlite3Static;
let baseApi: KeeperDB;

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

const ready: Promise<void> = (async () => {
  sqlite3 = await sqlite3InitModule();
  db = new sqlite3.oo1.OpfsDb('/keeper.sqlite3', 'cw');

  // Create the base DB implementation after OpfsDatabase is initialized
  baseApi = createKeeperDB({
    db: {
      run(sql: string, bind?: SqlValue[]) {
        if (bind !== undefined) {
          db.exec({ sql, bind });
        } else {
          db.exec({ sql });
        }
      },
      query(sql: string, bind?: SqlValue[]): SqlRow[] {
        const rows: SqlRow[] = [];
        if (bind !== undefined) {
          db.exec({ sql, bind, rowMode: 'object', resultRows: rows });
        } else {
          db.exec({ sql, rowMode: 'object', resultRows: rows });
        }
        return rows;
      },
      execRaw(sql: string) {
        db.exec(sql);
      },
    } satisfies SqliteDb,
    generateId: () => crypto.randomUUID(),
    now: () => new Date().toISOString().replace('T', ' ').slice(0, 19),
  });
})();

// Extend base implementation with OPFS-backed media operations
const api: KeeperDB = {
  // Delegate to baseApi (initialized in ready promise)
  async createNote(input) {
    await ready;
    return baseApi.createNote(input);
  },
  async getNote(id) {
    await ready;
    return baseApi.getNote(id);
  },
  async getAllNotes() {
    await ready;
    return baseApi.getAllNotes();
  },
  async updateNote(input) {
    await ready;
    return baseApi.updateNote(input);
  },
  async addTag(noteId, tagName) {
    await ready;
    return baseApi.addTag(noteId, tagName);
  },
  async removeTag(noteId, tagName) {
    await ready;
    return baseApi.removeTag(noteId, tagName);
  },
  async renameTag(oldName, newName) {
    await ready;
    return baseApi.renameTag(oldName, newName);
  },
  async deleteTag(tagId) {
    await ready;
    return baseApi.deleteTag(tagId);
  },
  async getAllTags() {
    await ready;
    return baseApi.getAllTags();
  },
  async search(query) {
    await ready;
    return baseApi.search(query);
  },
  async getUntaggedNotes() {
    await ready;
    return baseApi.getUntaggedNotes();
  },
  async getLinkedNotes() {
    await ready;
    return baseApi.getLinkedNotes();
  },
  async getNotesForTag(tagId) {
    await ready;
    return baseApi.getNotesForTag(tagId);
  },
  async deleteNotes(ids) {
    await ready;
    return baseApi.deleteNotes(ids);
  },
  async getMediaForNote(noteId) {
    await ready;
    return baseApi.getMediaForNote(noteId);
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
    // Perform SQL delete (cascade handles media table rows)
    await baseApi.deleteNote(id);
  },
  async togglePinNote(id) {
    await ready;
    return baseApi.togglePinNote(id);
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
    if (row === undefined) return null;

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
    if (row !== undefined) {
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
};

// Proxy to await ready before delegating calls
const proxy = new Proxy(api, {
  get(_target, prop) {
    const method = api[prop as keyof KeeperDB];
    if (typeof method === 'function') {
      return async (...args: unknown[]) => {
        await ready;
        // Use bind to preserve the correct 'this' context
        return (method as (...args: unknown[]) => Promise<unknown>).apply(api, args);
      };
    }
    return method;
  },
});

Comlink.expose(proxy);
