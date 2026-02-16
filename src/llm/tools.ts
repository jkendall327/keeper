import type { KeeperDB, NoteWithTags, Tag } from "../db/types.ts";

export type ToolName =
  | "list_notes"
  | "search_notes"
  | "get_note"
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

export interface ToolResult {
  name: ToolName;
  result: string;
  needsConfirmation: boolean;
}

// ── Result helpers ──────────────────────────────────────────

function ok(name: ToolName, result: string): ToolResult {
  return { name, result, needsConfirmation: false };
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

// ── Tool executor ───────────────────────────────────────────

export async function executeTool(
  db: KeeperDB,
  call: ToolCall,
): Promise<ToolResult> {
  const { name, args } = call;

  switch (name) {
    case "list_notes": {
      const notes = await db.getAllNotes();
      if (notes.length === 0) return ok(name, "No notes found.");
      return ok(name, notes.map(formatNote).join("\n---\n"));
    }

    case "search_notes": {
      const query = requireStr(name, args, "query", { nonEmpty: true });
      if (typeof query !== "string") return query;
      const results = await db.search(query);
      if (results.length === 0)
        return ok(name, `No notes matching "${query}".`);
      return ok(name, results.map(formatNote).join("\n---\n"));
    }

    case "get_note": {
      const id = requireStr(name, args, "id");
      if (typeof id !== "string") return id;
      const note = await db.getNote(id);
      if (note === null) return ok(name, `Note "${id}" not found.`);
      return ok(name, formatNote(note));
    }

    case "create_note": {
      const body = requireStr(name, args, "body", { nonEmpty: true });
      if (typeof body !== "string") return body;
      const title = optionalStr(args, "title");
      const note = await db.createNote({ body, title });
      return ok(name, `Note created.\n${formatNote(note)}`);
    }

    case "update_note": {
      const id = requireStr(name, args, "id");
      if (typeof id !== "string") return id;
      const body = requireStr(name, args, "body");
      if (typeof body !== "string") return body;
      const title = optionalStr(args, "title");
      const note = await db.updateNote({ id, body, title });
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
      await db.deleteNote(id);
      return ok(name, `Note "${id}" deleted.`);
    }

    case "add_tag": {
      const noteId = requireStr(name, args, "note_id");
      if (typeof noteId !== "string") return noteId;
      const tagName = requireStr(name, args, "tag_name", { nonEmpty: true });
      if (typeof tagName !== "string") return tagName;
      const note = await db.addTag(noteId, tagName);
      return ok(name, `Tag "${tagName}" added.\n${formatNote(note)}`);
    }

    case "remove_tag": {
      const noteId = requireStr(name, args, "note_id");
      if (typeof noteId !== "string") return noteId;
      const tagName = requireStr(name, args, "tag_name");
      if (typeof tagName !== "string") return tagName;
      const note = await db.removeTag(noteId, tagName);
      return ok(name, `Tag "${tagName}" removed.\n${formatNote(note)}`);
    }

    case "get_notes_for_tag": {
      const tagName = requireStr(name, args, "tag_name", { nonEmpty: true });
      if (typeof tagName !== "string") return tagName;
      const allTags = await db.getAllTags();
      const tag = allTags.find(
        (t) => t.name.toLowerCase() === tagName.toLowerCase(),
      );
      if (tag === undefined) {
        return ok(name, `No tag named "${tagName}" found.`);
      }
      const notes = await db.getNotesForTag(tag.id);
      if (notes.length === 0) return ok(name, `No notes tagged "${tagName}".`);
      return ok(name, notes.map(formatNote).join("\n---\n"));
    }

    case "get_untagged_notes": {
      const notes = await db.getUntaggedNotes();
      if (notes.length === 0) return ok(name, "No untagged notes found.");
      return ok(name, notes.map(formatNote).join("\n---\n"));
    }

    case "list_tags": {
      const tags = await db.getAllTags();
      return ok(name, formatTags(tags));
    }

    case "toggle_pin": {
      const id = requireStr(name, args, "id");
      if (typeof id !== "string") return id;
      const note = await db.togglePinNote(id);
      return ok(
        name,
        `Note ${note.pinned ? "pinned" : "unpinned"}.\n${formatNote(note)}`,
      );
    }

    case "toggle_archive": {
      const id = requireStr(name, args, "id");
      if (typeof id !== "string") return id;
      const note = await db.toggleArchiveNote(id);
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
