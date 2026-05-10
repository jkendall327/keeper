import type { KeeperClient } from '../db/db-client.ts';
import { toNoteId, type NoteWithTags, type Tag } from "../db/types.ts";

export type ToolName =
  | "list_notes"
  | "search_notes"
  | "get_note"
  | "display_notes"
  | "create_note"
  | "update_note"
  | "delete_note"
  | "confirm_delete_note"
  | "add_tag"
  | "remove_tag"
  | "get_notes_for_tag"
  | "get_untagged_notes"
  | "list_tags"
  | "toggle_pin"
  | "toggle_archive";

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
}

export interface ToolMetadata {
  terminal: boolean;
}

export interface ToolResult {
  name: ToolName;
  result: string;
  needsConfirmation: boolean;
  noteLinks?: NoteLink[];
}

export type NoteLinkStatus = "found" | "missing" | "error";

export interface NoteLinkSnapshot {
  id: string;
  title: string;
  bodyPreview: string;
  tags: { id: number; name: string; icon: string | null }[];
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  updated_at: string;
}

export interface NoteLink {
  id: string;
  status: NoteLinkStatus;
  note: NoteLinkSnapshot | null;
}

export const TOOL_METADATA: Record<ToolName, ToolMetadata> = {
  list_notes: { terminal: false },
  search_notes: { terminal: false },
  get_note: { terminal: false },
  display_notes: { terminal: true },
  create_note: { terminal: false },
  update_note: { terminal: false },
  delete_note: { terminal: false },
  confirm_delete_note: { terminal: false },
  add_tag: { terminal: false },
  remove_tag: { terminal: false },
  get_notes_for_tag: { terminal: false },
  get_untagged_notes: { terminal: false },
  list_tags: { terminal: false },
  toggle_pin: { terminal: false },
  toggle_archive: { terminal: false },
};

// ── Result helpers ──────────────────────────────────────────

function ok(name: ToolName, result: string): ToolResult {
  return { name, result, needsConfirmation: false };
}

function okWithNoteLinks(name: ToolName, result: string, noteLinks: NoteLink[]): ToolResult {
  return { name, result, needsConfirmation: false, noteLinks };
}

function confirm(name: ToolName, result: string): ToolResult {
  return { name, result, needsConfirmation: true };
}

// ── Arg extraction helpers ──────────────────────────────────

/** Extract a required string arg, returning a ToolResult error if missing/invalid */
function requireStr(
  name: ToolName,
  args: Record<string, unknown>,
  key: string,
  opts?: { nonEmpty?: boolean },
): string | ToolResult {
  const val = args[key];
  if (typeof val !== "string") {
    return ok(
      name,
      `Error: "${key}" parameter is required and must be a string.`,
    );
  }
  if (opts?.nonEmpty === true && val.trim() === "") {
    return ok(
      name,
      `Error: "${key}" parameter is required and must be a non-empty string.`,
    );
  }
  return val;
}

/** Extract an optional string arg, returning undefined if missing */
function optionalStr(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const val = args[key];
  return typeof val === "string" ? val : undefined;
}

// ── Formatters ──────────────────────────────────────────────

function formatNote(note: NoteWithTags): string {
  const tags = note.tags.map((t) => t.name).join(", ");
  const lines = [
    `ID: ${note.id}`,
    `Title: ${note.title !== "" ? note.title : "(none)"}`,
    `Body: ${note.body}`,
    `Tags: ${tags !== "" ? tags : "(none)"}`,
    `Pinned: ${String(note.pinned)}`,
    `Archived: ${String(note.archived)}`,
    `Created: ${note.created_at}`,
    `Updated: ${note.updated_at}`,
  ];
  return lines.join("\n");
}

function formatTags(tags: Tag[]): string {
  if (tags.length === 0) return "No tags found.";
  return tags
    .map(
      (t) =>
        `- ${t.name} (id: ${String(t.id)}${t.icon !== null ? `, icon: ${t.icon}` : ""})`,
    )
    .join("\n");
}

function truncatePreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 160) return normalized;
  return `${normalized.slice(0, 157)}...`;
}

export function snapshotNoteLink(note: NoteWithTags): NoteLinkSnapshot {
  return {
    id: note.id,
    title: note.title,
    bodyPreview: truncatePreview(note.body),
    tags: note.tags.map((tag) => ({ id: tag.id, name: tag.name, icon: tag.icon })),
    pinned: note.pinned,
    archived: note.archived,
    trashed: note.trashed,
    updated_at: note.updated_at,
  };
}

// ── Tool executor ───────────────────────────────────────────

export async function executeTool(
  keeper: KeeperClient,
  call: ToolCall,
): Promise<ToolResult> {
  const { name, args } = call;

  switch (name) {
    case "list_notes": {
      const notes = await keeper.notes.list();
      if (notes.length === 0) return ok(name, "No notes found.");
      return ok(name, notes.map(formatNote).join("\n---\n"));
    }

    case "search_notes": {
      const query = requireStr(name, args, "query", { nonEmpty: true });
      if (typeof query !== "string") return query;
      const results = await keeper.search.notes(query);
      if (results.length === 0)
        return ok(name, `No notes matching "${query}".`);
      return ok(name, results.map(formatNote).join("\n---\n"));
    }

    case "get_note": {
      const id = requireStr(name, args, "id");
      if (typeof id !== "string") return id;
      const note = await keeper.notes.get(toNoteId(id));
      if (note === null) return ok(name, `Note "${id}" not found.`);
      return ok(name, formatNote(note));
    }

    case "display_notes": {
      const ids = args["ids"];
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
        return ok(name, 'Error: "ids" parameter is required and must be an array of strings.');
      }
      const noteIds = ids.map(toNoteId);
      try {
        const resolved = await keeper.notes.resolve(noteIds);
        const links: NoteLink[] = resolved.map((item) => item.status === "found"
          ? { id: item.id, status: "found", note: snapshotNoteLink(item.note) }
          : { id: item.id, status: "missing", note: null });
        const foundCount = links.filter((link) => link.status === "found").length;
        const missingCount = links.length - foundCount;
        const summary = [
          `Displayed ${String(foundCount)} note${foundCount === 1 ? "" : "s"}.`,
          ...(missingCount > 0 ? [`${String(missingCount)} requested note${missingCount === 1 ? " was" : "s were"} unavailable.`] : []),
        ].join(" ");
        return okWithNoteLinks(name, summary, links);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to resolve notes";
        return okWithNoteLinks(
          name,
          `Error displaying notes: ${message}`,
          ids.map((id) => ({ id, status: "error", note: null })),
        );
      }
    }

    case "create_note": {
      const body = requireStr(name, args, "body", { nonEmpty: true });
      if (typeof body !== "string") return body;
      const title = optionalStr(args, "title");
      const note = await keeper.notes.create({ body, ...(title !== undefined ? { title } : {}) });
      return ok(name, `Note created.\n${formatNote(note)}`);
    }

    case "update_note": {
      const id = requireStr(name, args, "id");
      if (typeof id !== "string") return id;
      const body = requireStr(name, args, "body");
      if (typeof body !== "string") return body;
      const title = optionalStr(args, "title");
      const note = await keeper.notes.update({ id: toNoteId(id), body, ...(title !== undefined ? { title } : {}) });
      return ok(name, `Note updated.\n${formatNote(note)}`);
    }

    case "delete_note": {
      const id = requireStr(name, args, "id");
      if (typeof id !== "string") return id;
      return confirm(
        name,
        `Are you sure you want to delete note "${id}"? This cannot be undone.`,
      );
    }

    case "confirm_delete_note": {
      const id = requireStr(name, args, "id");
      if (typeof id !== "string") return id;
      await keeper.notes.delete(toNoteId(id));
      return ok(name, `Note "${id}" deleted.`);
    }

    case "add_tag": {
      const noteId = requireStr(name, args, "note_id");
      if (typeof noteId !== "string") return noteId;
      const tagName = requireStr(name, args, "tag_name", { nonEmpty: true });
      if (typeof tagName !== "string") return tagName;
      const note = await keeper.tags.addToNote(toNoteId(noteId), tagName);
      return ok(name, `Tag "${tagName}" added.\n${formatNote(note)}`);
    }

    case "remove_tag": {
      const noteId = requireStr(name, args, "note_id");
      if (typeof noteId !== "string") return noteId;
      const tagName = requireStr(name, args, "tag_name");
      if (typeof tagName !== "string") return tagName;
      const note = await keeper.tags.removeFromNote(toNoteId(noteId), tagName);
      return ok(name, `Tag "${tagName}" removed.\n${formatNote(note)}`);
    }

    case "get_notes_for_tag": {
      const tagName = requireStr(name, args, "tag_name", { nonEmpty: true });
      if (typeof tagName !== "string") return tagName;
      const allTags = await keeper.tags.list();
      const tag = allTags.find(
        (t) => t.name.toLowerCase() === tagName.toLowerCase(),
      );
      if (tag === undefined) {
        return ok(name, `No tag named "${tagName}" found.`);
      }
      const notes = await keeper.views.tag(tag.id);
      if (notes.length === 0) return ok(name, `No notes tagged "${tagName}".`);
      return ok(name, notes.map(formatNote).join("\n---\n"));
    }

    case "get_untagged_notes": {
      const notes = await keeper.views.untagged();
      if (notes.length === 0) return ok(name, "No untagged notes found.");
      return ok(name, notes.map(formatNote).join("\n---\n"));
    }

    case "list_tags": {
      const tags = await keeper.tags.list();
      return ok(name, formatTags(tags));
    }

    case "toggle_pin": {
      const id = requireStr(name, args, "id");
      if (typeof id !== "string") return id;
      const note = await keeper.notes.togglePin(toNoteId(id));
      return ok(
        name,
        `Note ${note.pinned ? "pinned" : "unpinned"}.\n${formatNote(note)}`,
      );
    }

    case "toggle_archive": {
      const id = requireStr(name, args, "id");
      if (typeof id !== "string") return id;
      const note = await keeper.notes.toggleArchive(toNoteId(id));
      return ok(
        name,
        `Note ${note.archived ? "archived" : "unarchived"}.\n${formatNote(note)}`,
      );
    }

    default: {
      const _exhaustive: never = name;
      return ok(_exhaustive, `Error: Unknown tool "${String(name)}".`);
    }
  }
}
