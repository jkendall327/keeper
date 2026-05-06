import type { SqliteDb, SqlRow } from "../sqlite-db.ts";
import {
  DEFAULT_POPULAR_TAG_SUGGESTION_LIMIT,
  normalizePopularTagSuggestionLimit,
  toNoteId,
} from "../types.ts";
import { extractSingleUrl } from "../url-detect.ts";
import type {
  AutoTagRule,
  AutoTagRuleInput,
  AppSettings,
  LinkPreview,
  LinkPreviewStatus,
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
  getLinkPreviewSync: (url: string) => LinkPreview | null;
  getTagsForNote: (noteId: NoteId) => Tag[];
  normalizeRuleInput: (input: AutoTagRuleInput) => AutoTagRuleInput;
  prepareFts5Query: (input: string) => string;
  rowString: (row: SqlRow, key: string) => string;
  rowToAutoTagRule: (row: SqlRow) => AutoTagRule;
  rowToLinkPreview: (row: SqlRow) => LinkPreview;
  rowToNote: (row: SqlRow) => Note;
  rowToTag: (row: SqlRow) => Tag;
  rowsToAutoTagRules: (rows: SqlRow[]) => AutoTagRule[];
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

  function rowToLinkPreview(row: SqlRow): LinkPreview {
    return {
      url: row["url"] as string,
      image_url: row["image_url"] as string | null,
      status: row["status"] as LinkPreviewStatus,
      fetched_at: row["fetched_at"] as string,
      updated_at: row["updated_at"] as string,
    };
  }

  function getLinkPreviewSync(url: string): LinkPreview | null {
    const row = db.query("SELECT * FROM link_previews WHERE url = ?", [url])[0];
    return row === undefined ? null : rowToLinkPreview(row);
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
    const url = extractSingleUrl(note.body);
    return {
      ...note,
      tags: getTagsForNote(note.id),
      link_preview: url === null ? null : getLinkPreviewSync(url),
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
    const urls = Array.from(
      new Set(
        notes
          .map((note) => extractSingleUrl(note.body))
          .filter((url): url is string => url !== null),
      ),
    );
    const previewMap = new Map<string, LinkPreview>();
    if (urls.length > 0) {
      const previewPlaceholders = urls.map(() => "?").join(",");
      const previewRows = db.query(
        `SELECT * FROM link_previews WHERE url IN (${previewPlaceholders})`,
        urls,
      );
      for (const row of previewRows) {
        const preview = rowToLinkPreview(row);
        previewMap.set(preview.url, preview);
      }
    }

    return notes.map((n) => {
      const url = extractSingleUrl(n.body);
      return {
        ...n,
        tags: tagMap.get(n.id) ?? [],
        link_preview: url === null ? null : previewMap.get(url) ?? null,
      };
    });
  }

  function getAppSettingsSync(): AppSettings {
    const rows = db.query(
      "SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?, ?, ?)",
      [
        "extensionTitleMaxLength",
        "extensionBadgeEnabled",
        "linkPreviewFetchEnabled",
        "linkPreviewDisplayEnabled",
        "popularTagSuggestionsEnabled",
        "popularTagSuggestionLimit",
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
    };
  }

  return {
    ...deps,
    ensureTag,
    getAppSettingsSync,
    getAutoTagRuleById,
    getLinkPreviewSync,
    getTagsForNote,
    normalizeRuleInput,
    prepareFts5Query,
    rowString,
    rowToAutoTagRule,
    rowToLinkPreview,
    rowToNote,
    rowToTag,
    rowsToAutoTagRules,
    withTags,
    withTagsBatch,
  };
}
