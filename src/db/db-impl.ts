import type { SqliteDb, SqlRow } from "./sqlite-db.ts";
import { SCHEMA_SQL } from "./schema.ts";
import { containsUrl, extractUrls } from "./url-detect.ts";
import type {
  AutoTagRule,
  AutoTagRuleInput,
  AutoTagRunResult,
  KeeperDB,
  Note,
  NoteWithTags,
  Tag,
  Media,
  SearchResult,
  CreateNoteInput,
  UpdateNoteInput,
  UpdateAutoTagRuleInput,
  StoreMediaInput,
} from "./types.ts";

/** Dependencies injected into the DB implementation */
export interface KeeperDBDeps {
  db: SqliteDb;
  generateId: () => string;
  now: () => string;
}

export function createKeeperDB(deps: KeeperDBDeps): KeeperDB {
  const { db, generateId, now } = deps;

  // Initialize base schema
  db.execRaw(SCHEMA_SQL);

  // Migration: Add pinned column if it doesn't exist (for existing databases)
  const columns = db.query("PRAGMA table_info(notes)");
  const hasPinnedColumn = columns.some((col) => col["name"] === "pinned");
  if (!hasPinnedColumn) {
    db.execRaw(
      "ALTER TABLE notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0",
    );
  }

  // Create the pinned index (handled separately from main schema for migration compatibility)
  db.execRaw("CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(pinned)");

  // Migration: Add archived column if it doesn't exist (for existing databases)
  const hasArchivedColumn = columns.some((col) => col["name"] === "archived");
  if (!hasArchivedColumn) {
    db.execRaw(
      "ALTER TABLE notes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
    );
  }

  db.execRaw(
    "CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes(archived)",
  );

  // Migration: Add trashed column if it doesn't exist (for existing databases)
  const hasTrashedColumn = columns.some((col) => col["name"] === "trashed");
  if (!hasTrashedColumn) {
    db.execRaw(
      "ALTER TABLE notes ADD COLUMN trashed INTEGER NOT NULL DEFAULT 0",
    );
  }

  db.execRaw(
    "CREATE INDEX IF NOT EXISTS idx_notes_trashed ON notes(trashed)",
  );

  // Migration: Add icon column to tags table if it doesn't exist
  const tagColumns = db.query("PRAGMA table_info(tags)");
  const hasIconColumn = tagColumns.some((col) => col["name"] === "icon");
  if (!hasIconColumn) {
    db.execRaw("ALTER TABLE tags ADD COLUMN icon TEXT DEFAULT NULL");
  }

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
    if (trimmed === "") return "";

    // Split into words and filter empty strings
    const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return "";

    // Quote each word to escape special characters, append * to last word
    const quotedWords = words.map((word, i) => {
      // Escape double quotes in the word by doubling them
      const escaped = word.replace(/"/g, '""');
      // Add * to last word for prefix matching
      const suffix = i === words.length - 1 ? "*" : "";
      return `"${escaped}"${suffix}`;
    });

    return quotedWords.join(" ");
  }

  function rowToNote(row: SqlRow): Note {
    return {
      id: row["id"] as string,
      title: row["title"] as string,
      body: row["body"] as string,
      has_links: row["has_links"] === 1,
      pinned: row["pinned"] === 1,
      archived: row["archived"] === 1,
      trashed: row["trashed"] === 1,
      created_at: row["created_at"] as string,
      updated_at: row["updated_at"] as string,
    };
  }

  function getTagsForNote(noteId: string): Tag[] {
    const rows = db.query(
      `SELECT t.id, t.name, t.icon FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id
       WHERE nt.note_id = ?`,
      [noteId],
    );
    return rows.map((r) => ({
      id: r["id"] as number,
      name: r["name"] as string,
      icon: r["icon"] as string | null,
    }));
  }

  function normalizeRuleInput(input: AutoTagRuleInput): AutoTagRuleInput {
    const pattern = input.pattern.trim();
    if (pattern === "") throw new Error("Pattern is required");
    try {
      new RegExp(pattern, "i");
    } catch {
      throw new Error("Pattern must be a valid regular expression");
    }

    const tagNames = Array.from(
      new Set(input.tagNames.map((name) => name.trim()).filter((name) => name !== "")),
    );
    if (tagNames.length === 0) throw new Error("At least one tag is required");
    return { pattern, tagNames };
  }

  function rowToAutoTagRule(row: SqlRow): AutoTagRule {
    const ruleId = row["id"] as number;
    const tagRows = db.query(
      "SELECT tag_name FROM auto_tag_rule_tags WHERE rule_id = ? ORDER BY tag_name",
      [ruleId],
    );
    return {
      id: ruleId,
      pattern: row["pattern"] as string,
      tagNames: tagRows.map((tagRow) => tagRow["tag_name"] as string),
      created_at: row["created_at"] as string,
      updated_at: row["updated_at"] as string,
    };
  }

  function getAutoTagRuleById(ruleId: number): AutoTagRule | null {
    const row = db.query("SELECT * FROM auto_tag_rules WHERE id = ?", [ruleId])[0];
    if (row === undefined) return null;
    return rowToAutoTagRule(row);
  }

  function ensureTag(tagName: string): number {
    db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [tagName]);
    const tagRow = db.query("SELECT id FROM tags WHERE name = ?", [tagName])[0];
    if (tagRow === undefined)
      throw new Error("Unreachable: tag must exist after INSERT OR IGNORE");
    return tagRow["id"] as number;
  }

  function withTags(note: Note): NoteWithTags {
    return { ...note, tags: getTagsForNote(note.id) };
  }

  function withTagsBatch(notes: Note[]): NoteWithTags[] {
    if (notes.length === 0) return [];
    const ids = notes.map((n) => n.id);
    const placeholders = ids.map(() => "?").join(",");
    const rows = db.query(
      `SELECT nt.note_id, t.id, t.name, t.icon FROM note_tags nt
       JOIN tags t ON t.id = nt.tag_id
       WHERE nt.note_id IN (${placeholders})`,
      ids,
    );
    const tagMap = new Map<string, Tag[]>();
    for (const r of rows) {
      const noteId = r["note_id"] as string;
      const tag: Tag = {
        id: r["id"] as number,
        name: r["name"] as string,
        icon: r["icon"] as string | null,
      };
      const list = tagMap.get(noteId);
      if (list !== undefined) list.push(tag);
      else tagMap.set(noteId, [tag]);
    }
    return notes.map((n) => ({ ...n, tags: tagMap.get(n.id) ?? [] }));
  }

  // ── KeeperDB implementation ──────────────────────────────────

  const api: KeeperDB = {
    createNote(input: CreateNoteInput): Promise<NoteWithTags> {
      const id = generateId();
      const title = input.title ?? "";
      const body = input.body;
      const hasLinks = containsUrl(body) ? 1 : 0;
      const timestamp = now();

      db.run(
        `INSERT INTO notes (id, title, body, has_links, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, title, body, hasLinks, timestamp, timestamp],
      );

      return Promise.resolve(withTags({
        id,
        title,
        body,
        has_links: hasLinks === 1,
        pinned: false,
        archived: false,
        trashed: false,
        created_at: timestamp,
        updated_at: timestamp,
      }));
    },

    getNote(id: string): Promise<NoteWithTags | null> {
      const rows = db.query("SELECT * FROM notes WHERE id = ?", [id]);
      const row = rows[0];
      if (row === undefined) return Promise.resolve(null);
      return Promise.resolve(withTags(rowToNote(row)));
    },

    getAllNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        "SELECT * FROM notes WHERE archived = 0 AND trashed = 0 ORDER BY pinned DESC, updated_at DESC",
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
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

    deleteNote(id: string): Promise<void> {
      db.run("DELETE FROM notes WHERE id = ?", [id]);
      return Promise.resolve();
    },

    deleteNotes(ids: string[]): Promise<void> {
      if (ids.length === 0) return Promise.resolve();
      const placeholders = ids.map(() => "?").join(",");
      db.run(`DELETE FROM notes WHERE id IN (${placeholders})`, ids);
      return Promise.resolve();
    },

    archiveNotes(ids: string[]): Promise<void> {
      if (ids.length === 0) return Promise.resolve();
      const placeholders = ids.map(() => "?").join(",");
      db.run(
        `UPDATE notes SET archived = 1 WHERE id IN (${placeholders})`,
        ids,
      );
      return Promise.resolve();
    },

    trashNote(id: string): Promise<void> {
      db.run("UPDATE notes SET trashed = 1 WHERE id = ?", [id]);
      return Promise.resolve();
    },

    trashNotes(ids: string[]): Promise<void> {
      if (ids.length === 0) return Promise.resolve();
      const placeholders = ids.map(() => "?").join(",");
      db.run(
        `UPDATE notes SET trashed = 1 WHERE id IN (${placeholders})`,
        ids,
      );
      return Promise.resolve();
    },

    restoreNote(id: string): Promise<void> {
      db.run("UPDATE notes SET trashed = 0 WHERE id = ?", [id]);
      return Promise.resolve();
    },

    restoreNotes(ids: string[]): Promise<void> {
      if (ids.length === 0) return Promise.resolve();
      const placeholders = ids.map(() => "?").join(",");
      db.run(
        `UPDATE notes SET trashed = 0 WHERE id IN (${placeholders})`,
        ids,
      );
      return Promise.resolve();
    },

    getTrashedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        "SELECT * FROM notes WHERE trashed = 1 ORDER BY updated_at DESC",
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    async togglePinNote(id: string): Promise<NoteWithTags> {
      const existing = await api.getNote(id);
      if (existing === null) throw new Error(`Note not found: ${id}`);

      const newPinned = existing.pinned ? 0 : 1;
      db.run("UPDATE notes SET pinned = ? WHERE id = ?", [newPinned, id]);

      return { ...existing, pinned: !existing.pinned };
    },

    async toggleArchiveNote(id: string): Promise<NoteWithTags> {
      const existing = await api.getNote(id);
      if (existing === null) throw new Error(`Note not found: ${id}`);

      const newArchived = existing.archived ? 0 : 1;
      db.run("UPDATE notes SET archived = ? WHERE id = ?", [newArchived, id]);

      return { ...existing, archived: !existing.archived };
    },

    async addTag(noteId: string, tagName: string): Promise<NoteWithTags> {
      // Check if note exists first to give a better error message
      const existing = await api.getNote(noteId);
      if (existing === null) throw new Error(`Note not found: ${noteId}`);

      db.run("INSERT OR IGNORE INTO tags (name) VALUES (?)", [tagName]);

      // Tag is guaranteed to exist after INSERT OR IGNORE
      const tagRow = db.query("SELECT id FROM tags WHERE name = ?", [
        tagName,
      ])[0];
      if (tagRow === undefined)
        throw new Error("Unreachable: tag must exist after INSERT OR IGNORE");
      const tagId = tagRow["id"] as number;

      db.run(
        "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
        [noteId, tagId],
      );

      // Re-read tags since they changed; note itself still exists
      return { ...existing, tags: getTagsForNote(noteId) };
    },

    async removeTag(noteId: string, tagName: string): Promise<NoteWithTags> {
      const existing = await api.getNote(noteId);
      if (existing === null) throw new Error(`Note not found: ${noteId}`);

      db.run(
        `DELETE FROM note_tags WHERE note_id = ? AND tag_id = (
           SELECT id FROM tags WHERE name = ?
         )`,
        [noteId, tagName],
      );

      // Re-read tags since they changed; note itself still exists
      return { ...existing, tags: getTagsForNote(noteId) };
    },

    addTagToNotes(noteIds: string[], tagName: string): Promise<void> {
      if (noteIds.length === 0) return Promise.resolve();

      const tagId = ensureTag(tagName);

      for (const noteId of noteIds) {
        db.run(
          "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
          [noteId, tagId],
        );
      }
      return Promise.resolve();
    },

    removeTagFromNotes(noteIds: string[], tagName: string): Promise<void> {
      if (noteIds.length === 0) return Promise.resolve();
      const placeholders = noteIds.map(() => "?").join(",");
      db.run(
        `DELETE FROM note_tags WHERE tag_id = (SELECT id FROM tags WHERE name = ?) AND note_id IN (${placeholders})`,
        [tagName, ...noteIds],
      );
      return Promise.resolve();
    },

    renameTag(oldName: string, newName: string): Promise<void> {
      if (oldName === newName) return Promise.resolve();

      const existingRows = db.query("SELECT id FROM tags WHERE name = ?", [
        newName,
      ]);
      if (existingRows.length > 0) {
        // newName already exists — merge: move note_tags from old to new, then delete old
        const oldRows = db.query("SELECT id FROM tags WHERE name = ?", [
          oldName,
        ]);
        const oldRow = oldRows[0];
        if (oldRow === undefined) throw new Error(`Tag not found: ${oldName}`);
        const oldTagId = oldRow["id"] as number;
        // Guaranteed non-undefined: we checked existingRows.length > 0
        const existingRow = existingRows[0];
        if (existingRow === undefined)
          throw new Error("Unreachable: checked length > 0");
        const newTagId = existingRow["id"] as number;

        // Reassign note associations (ignore duplicates)
        db.run("UPDATE OR IGNORE note_tags SET tag_id = ? WHERE tag_id = ?", [
          newTagId,
          oldTagId,
        ]);
        // Remove any remaining links that were duplicates (already pointed to newTagId)
        db.run("DELETE FROM note_tags WHERE tag_id = ?", [oldTagId]);
        // Delete the now-orphaned old tag
        db.run("DELETE FROM tags WHERE id = ?", [oldTagId]);
      } else {
        db.run("UPDATE tags SET name = ? WHERE name = ?", [newName, oldName]);
      }
      return Promise.resolve();
    },

    updateTagIcon(tagId: number, icon: string | null): Promise<void> {
      db.run("UPDATE tags SET icon = ? WHERE id = ?", [icon, tagId]);
      return Promise.resolve();
    },

    deleteTag(tagId: number): Promise<void> {
      db.run("DELETE FROM tags WHERE id = ?", [tagId]);
      return Promise.resolve();
    },

    getAllTags(): Promise<Tag[]> {
      const rows = db.query("SELECT id, name, icon FROM tags ORDER BY name");
      return Promise.resolve(rows.map((r) => ({
        id: r["id"] as number,
        name: r["name"] as string,
        icon: r["icon"] as string | null,
      })));
    },

    search(query: string): Promise<SearchResult[]> {
      const fts5Query = prepareFts5Query(query);
      if (fts5Query === "") return Promise.resolve([]);

      const rows = db.query(
        `SELECT n.*, rank
         FROM notes_fts fts
         JOIN notes n ON n.rowid = fts.rowid
         WHERE notes_fts MATCH ? AND n.trashed = 0
         ORDER BY n.archived ASC, rank`,
        [fts5Query],
      );
      const notesWithTags = withTagsBatch(rows.map(rowToNote));
      return Promise.resolve(notesWithTags.map((n, i) => {
        const row = rows[i];
        return {
          ...n,
          rank: (row != null ? row["rank"] : 0) as number,
        };
      }));
    },

    getUntaggedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        `SELECT * FROM notes
         WHERE id NOT IN (SELECT note_id FROM note_tags) AND archived = 0 AND trashed = 0
         ORDER BY pinned DESC, updated_at DESC`,
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    getLinkedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        "SELECT * FROM notes WHERE has_links = 1 AND archived = 0 AND trashed = 0 ORDER BY pinned DESC, updated_at DESC",
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    getNotesForTag(tagId: number): Promise<NoteWithTags[]> {
      const rows = db.query(
        `SELECT n.* FROM notes n
         JOIN note_tags nt ON nt.note_id = n.id
         WHERE nt.tag_id = ? AND n.archived = 0 AND n.trashed = 0
         ORDER BY n.pinned DESC, n.updated_at DESC`,
        [tagId],
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    getArchivedNotes(): Promise<NoteWithTags[]> {
      const rows = db.query(
        "SELECT * FROM notes WHERE archived = 1 AND trashed = 0 ORDER BY pinned DESC, updated_at DESC",
      );
      return Promise.resolve(withTagsBatch(rows.map(rowToNote)));
    },

    getAutoTagRules(): Promise<AutoTagRule[]> {
      const rows = db.query(
        "SELECT * FROM auto_tag_rules ORDER BY created_at DESC, id DESC",
      );
      return Promise.resolve(rows.map(rowToAutoTagRule));
    },

    createAutoTagRule(input: AutoTagRuleInput): Promise<AutoTagRule> {
      try {
        const normalized = normalizeRuleInput(input);
        const timestamp = now();
        db.run(
          "INSERT INTO auto_tag_rules (pattern, created_at, updated_at) VALUES (?, ?, ?)",
          [normalized.pattern, timestamp, timestamp],
        );
        const row = db.query("SELECT last_insert_rowid() AS id")[0];
        if (row === undefined) throw new Error("Unable to create autotag rule");
        const ruleId = row["id"] as number;
        for (const tagName of normalized.tagNames) {
          db.run(
            "INSERT INTO auto_tag_rule_tags (rule_id, tag_name) VALUES (?, ?)",
            [ruleId, tagName],
          );
        }
        const created = getAutoTagRuleById(ruleId);
        if (created === null) throw new Error("Unable to read created autotag rule");
        return Promise.resolve(created);
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error("Unable to create autotag rule"));
      }
    },

    updateAutoTagRule(input: UpdateAutoTagRuleInput): Promise<AutoTagRule> {
      try {
        const existing = getAutoTagRuleById(input.id);
        if (existing === null) throw new Error(`Autotag rule not found: ${String(input.id)}`);
        const normalized = normalizeRuleInput(input);
        db.run(
          "UPDATE auto_tag_rules SET pattern = ?, updated_at = ? WHERE id = ?",
          [normalized.pattern, now(), input.id],
        );
        db.run("DELETE FROM auto_tag_rule_tags WHERE rule_id = ?", [input.id]);
        for (const tagName of normalized.tagNames) {
          db.run(
            "INSERT INTO auto_tag_rule_tags (rule_id, tag_name) VALUES (?, ?)",
            [input.id, tagName],
          );
        }
        const updated = getAutoTagRuleById(input.id);
        if (updated === null) throw new Error(`Autotag rule not found: ${String(input.id)}`);
        return Promise.resolve(updated);
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error("Unable to update autotag rule"));
      }
    },

    deleteAutoTagRule(id: number): Promise<void> {
      db.run("DELETE FROM auto_tag_rules WHERE id = ?", [id]);
      return Promise.resolve();
    },

    async runAutoTagRules(): Promise<AutoTagRunResult> {
      const rules = await api.getAutoTagRules();
      if (rules.length === 0) {
        return { matchedNoteCount: 0, archivedNoteCount: 0, appliedTagCount: 0 };
      }

      const compiledRules = rules.map((rule) => ({
        tagNames: rule.tagNames,
        regex: new RegExp(rule.pattern, "i"),
      }));
      const noteRows = db.query(
        "SELECT * FROM notes WHERE archived = 0 AND trashed = 0 ORDER BY updated_at DESC",
      );

      let matchedNoteCount = 0;
      let archivedNoteCount = 0;
      let appliedTagCount = 0;

      for (const row of noteRows) {
        const note = rowToNote(row);
        const urls = extractUrls(note.body);
        if (urls.length === 0) continue;

        const matchedTagNames = new Set<string>();
        for (const rule of compiledRules) {
          if (urls.some((url) => rule.regex.test(url))) {
            for (const tagName of rule.tagNames) {
              matchedTagNames.add(tagName);
            }
          }
        }
        if (matchedTagNames.size === 0) continue;

        matchedNoteCount++;
        for (const tagName of matchedTagNames) {
          const tagId = ensureTag(tagName);
          const before = db.query(
            "SELECT 1 FROM note_tags WHERE note_id = ? AND tag_id = ?",
            [note.id, tagId],
          );
          db.run(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
            [note.id, tagId],
          );
          if (before.length === 0) appliedTagCount++;
        }
        db.run("UPDATE notes SET archived = 1, updated_at = ? WHERE id = ?", [
          now(),
          note.id,
        ]);
        archivedNoteCount++;
      }

      return { matchedNoteCount, archivedNoteCount, appliedTagCount };
    },

    async storeMedia(_input: StoreMediaInput): Promise<Media> {
      return Promise.reject(
        new Error("storeMedia: must be implemented by worker with OPFS access"),
      );
    },

    async getMedia(_id: string): Promise<ArrayBuffer | null> {
      return Promise.reject(
        new Error("getMedia: must be implemented by worker with OPFS access"),
      );
    },

    async deleteMedia(_id: string): Promise<void> {
      return Promise.reject(
        new Error(
          "deleteMedia: must be implemented by worker with OPFS access",
        ),
      );
    },

    getMediaForNote(noteId: string): Promise<Media[]> {
      const rows = db.query(
        "SELECT * FROM media WHERE note_id = ? ORDER BY created_at",
        [noteId],
      );
      return Promise.resolve(rows.map((r) => ({
        id: r["id"] as string,
        note_id: r["note_id"] as string,
        mime_type: r["mime_type"] as string,
        filename: r["filename"] as string,
        created_at: r["created_at"] as string,
      })));
    },
  };

  return api;
}
