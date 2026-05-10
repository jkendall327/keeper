import type { SqliteDb, SqlRow } from "../sqlite-db.ts";
import {
  DEFAULT_POPULAR_TAG_SUGGESTION_LIMIT,
  normalizePopularTagSuggestionLimit,
  toNoteId,
} from "../types.ts";
import { extractUrls } from "../url-detect.ts";
import type {
  AutoTagRule,
  AutoTagRuleInput,
  AppSettings,
  LinkMetadata,
  LinkMetadataStatus,
  Note,
  NoteId,
  NoteWithTags,
  Tag,
} from "../types.ts";
import { parseExtensionTitleMaxLength } from "../../utils/extension-title.ts";

/** Dependencies injected into the DB implementation */
export interface KeeperDBDeps {
  db: SqliteDb;
  generateId: () => string;
  now: () => string;
}

export interface KeeperDBContext extends KeeperDBDeps {
  ensureTag: (tagName: string) => number;
  getAppSettingsSync: () => AppSettings;
  getAutoTagRuleById: (ruleId: number) => AutoTagRule | null;
  getLinkMetadataSync: (url: string) => LinkMetadata | null;
  getTagsForNote: (noteId: NoteId) => Tag[];
  normalizeRuleInput: (input: AutoTagRuleInput) => AutoTagRuleInput;
  prepareFts5Query: (input: string) => string;
  rowString: (row: SqlRow, key: string) => string;
  rowToAutoTagRule: (row: SqlRow) => AutoTagRule;
  rowToLinkMetadata: (row: SqlRow) => LinkMetadata;
  rowToNote: (row: SqlRow) => Note;
  rowToTag: (row: SqlRow) => Tag;
  rowsToAutoTagRules: (rows: SqlRow[]) => AutoTagRule[];
  syncNoteLinks: (noteId: NoteId, body: string) => void;
  withTags: (note: Note) => NoteWithTags;
  withTagsBatch: (notes: Note[]) => NoteWithTags[];
}

export function createKeeperDBContext(deps: KeeperDBDeps): KeeperDBContext {
  const { db } = deps;

  function prepareFts5Query(input: string): string {
    const trimmed = input.trim();
    if (trimmed === "") return "";

    const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return "";

    const quotedWords = words.map((word, i) => {
      const escaped = word.replace(/"/g, '""');
      const suffix = i === words.length - 1 ? "*" : "";
      return `"${escaped}"${suffix}`;
    });

    return quotedWords.join(" ");
  }

  function rowString(row: SqlRow, key: string): string {
    const value = row[key];
    if (typeof value !== "string") {
      throw new Error(`Expected ${key} to be a string`);
    }
    return value;
  }

  function rowToNote(row: SqlRow): Note {
    return {
      id: toNoteId(rowString(row, "id")),
      title: rowString(row, "title"),
      body: rowString(row, "body"),
      has_links: row["has_links"] === 1,
      pinned: row["pinned"] === 1,
      archived: row["archived"] === 1,
      trashed: row["trashed"] === 1,
      created_at: rowString(row, "created_at"),
      updated_at: rowString(row, "updated_at"),
    };
  }

  function rowToTag(row: SqlRow): Tag {
    return {
      id: row["id"] as number,
      name: row["name"] as string,
      icon: row["icon"] as string | null,
    };
  }

  function getTagsForNote(noteId: NoteId): Tag[] {
    const rows = db.query(
      `SELECT t.id, t.name, t.icon FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id
       WHERE nt.note_id = ?`,
      [noteId],
    );
    return rows.map(rowToTag);
  }

  function nullableNumber(row: SqlRow, key: string): number | null {
    const value = row[key];
    return typeof value === "number" ? value : null;
  }

  function rowToLinkMetadata(row: SqlRow): LinkMetadata {
    return {
      url: row["url"] as string,
      image_url: row["image_url"] as string | null,
      image_alt: row["image_alt"] as string | null,
      image_width: nullableNumber(row, "image_width"),
      image_height: nullableNumber(row, "image_height"),
      title: row["title"] as string | null,
      site_name: row["site_name"] as string | null,
      canonical_url: row["canonical_url"] as string | null,
      type: row["type"] as string | null,
      status: row["status"] as LinkMetadataStatus,
      failure_reason: row["failure_reason"] as string | null,
      fetched_at: row["fetched_at"] as string,
      updated_at: row["updated_at"] as string,
    };
  }

  function getLinkMetadataSync(url: string): LinkMetadata | null {
    const row = db.query("SELECT * FROM link_metadata WHERE url = ?", [url])[0];
    return row === undefined ? null : rowToLinkMetadata(row);
  }

  function syncNoteLinks(noteId: NoteId, body: string): void {
    const urls = Array.from(new Set(extractUrls(body)));
    db.run("DELETE FROM note_links WHERE note_id = ?", [noteId]);
    urls.forEach((url, index) => {
      db.run(
        "INSERT INTO note_links (note_id, url, position) VALUES (?, ?, ?)",
        [noteId, url, index],
      );
    });
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

  function rowsToAutoTagRules(rows: SqlRow[]): AutoTagRule[] {
    if (rows.length === 0) return [];

    const ruleIds = rows.map((row) => row["id"] as number);
    const placeholders = ruleIds.map(() => "?").join(",");
    const tagRows = db.query(
      `SELECT rule_id, tag_name
       FROM auto_tag_rule_tags
       WHERE rule_id IN (${placeholders})
       ORDER BY tag_name`,
      ruleIds,
    );
    const tagNamesByRuleId = new Map<number, string[]>();
    for (const tagRow of tagRows) {
      const ruleId = tagRow["rule_id"] as number;
      const tagNames = tagNamesByRuleId.get(ruleId);
      if (tagNames !== undefined) {
        tagNames.push(tagRow["tag_name"] as string);
      } else {
        tagNamesByRuleId.set(ruleId, [tagRow["tag_name"] as string]);
      }
    }

    return rows.map((row) => {
      const ruleId = row["id"] as number;
      return {
        id: ruleId,
        pattern: row["pattern"] as string,
        tagNames: tagNamesByRuleId.get(ruleId) ?? [],
        created_at: row["created_at"] as string,
        updated_at: row["updated_at"] as string,
      };
    });
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
    const metadataRows = db.query(
      `SELECT lm.*
       FROM note_links nl
       JOIN link_metadata lm ON lm.url = nl.url
       WHERE nl.note_id = ?
       ORDER BY nl.position`,
      [note.id],
    );
    return {
      ...note,
      tags: getTagsForNote(note.id),
      link_metadata: metadataRows.map(rowToLinkMetadata),
    };
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
    const tagMap = new Map<NoteId, Tag[]>();
    for (const r of rows) {
      const noteId = toNoteId(rowString(r, "note_id"));
      const tag = rowToTag(r);
      const list = tagMap.get(noteId);
      if (list !== undefined) list.push(tag);
      else tagMap.set(noteId, [tag]);
    }
    const metadataMap = new Map<NoteId, LinkMetadata[]>();
    const metadataRows = db.query(
      `SELECT nl.note_id, lm.*
       FROM note_links nl
       JOIN link_metadata lm ON lm.url = nl.url
       WHERE nl.note_id IN (${placeholders})
       ORDER BY nl.note_id, nl.position`,
      ids,
    );
    for (const row of metadataRows) {
      const noteId = toNoteId(rowString(row, "note_id"));
      const metadata = rowToLinkMetadata(row);
      const list = metadataMap.get(noteId);
      if (list !== undefined) list.push(metadata);
      else metadataMap.set(noteId, [metadata]);
    }

    return notes.map((n) => {
      return {
        ...n,
        tags: tagMap.get(n.id) ?? [],
        link_metadata: metadataMap.get(n.id) ?? [],
      };
    });
  }

  function getAppSettingsSync(): AppSettings {
    const rows = db.query(
      "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?, ?, ?, ?)",
      [
        "extensionTitleMaxLength",
        "extensionBadgeEnabled",
        "linkPreviewFetchEnabled",
        "linkPreviewDisplayEnabled",
        "popularTagSuggestionsEnabled",
        "popularTagSuggestionLimit",
        "quickAddAutofocusEnabled",
      ],
    );
    const values = new Map<string, string>();
    for (const row of rows) {
      values.set(row["key"] as string, row["value"] as string);
    }
    const extensionTitleMaxLength = parseExtensionTitleMaxLength(values.get("extensionTitleMaxLength"));
    const popularTagSuggestionLimitValue = values.get("popularTagSuggestionLimit");
    return {
      extensionTitleMaxLength,
      extensionBadgeEnabled: values.get("extensionBadgeEnabled") !== "false",
      linkPreviewFetchEnabled: values.get("linkPreviewFetchEnabled") !== "false",
      linkPreviewDisplayEnabled: values.get("linkPreviewDisplayEnabled") !== "false",
      popularTagSuggestionsEnabled: values.get("popularTagSuggestionsEnabled") !== "false",
      popularTagSuggestionLimit: popularTagSuggestionLimitValue === undefined
        ? DEFAULT_POPULAR_TAG_SUGGESTION_LIMIT
        : normalizePopularTagSuggestionLimit(Number(popularTagSuggestionLimitValue)),
      quickAddAutofocusEnabled: values.get("quickAddAutofocusEnabled") !== "false",
    };
  }

  return {
    ...deps,
    ensureTag,
    getAppSettingsSync,
    getAutoTagRuleById,
    getLinkMetadataSync,
    getTagsForNote,
    normalizeRuleInput,
    prepareFts5Query,
    rowString,
    rowToAutoTagRule,
    rowToLinkMetadata,
    rowToNote,
    rowToTag,
    rowsToAutoTagRules,
    syncNoteLinks,
    withTags,
    withTagsBatch,
  };
}
