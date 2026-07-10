import type { KeeperClient } from '../db/db-client.ts';
import { toNoteId, type NoteWithTags, type Tag } from "../db/types.ts";

type EmptyArgs = Record<string, never>;

// This map is the model-callable boundary: every entry is accepted from
// tool_call output. Trusted application continuations must stay outside it.
export interface ToolArgsByName {
  list_notes: EmptyArgs;
  search_notes: { query: string };
  get_note: { id: string };
  display_notes: { ids: string[] };
  create_note: { body: string; title?: string };
  update_note: { id: string; body: string; title?: string };
  delete_note: { id: string };
  add_tag: { note_id: string; tag_name: string };
  remove_tag: { note_id: string; tag_name: string };
  get_notes_for_tag: { tag_name: string };
  get_untagged_notes: EmptyArgs;
  list_tags: EmptyArgs;
  toggle_pin: { id: string };
  toggle_archive: { id: string };
}

export type ToolName = keyof ToolArgsByName;

export type ToolCall = {
  [Name in ToolName]: {
    name: Name;
    args: ToolArgsByName[Name];
  }
}[ToolName];

export interface ToolMetadata {
  terminal: boolean;
}

// Kept only so chat histories written by older versions remain loadable.
// Legacy result names are never accepted as model-issued tool calls.
type LegacyToolResultName = "confirm_delete_note";
export type ToolResultName = ToolName | LegacyToolResultName;

export interface ToolResult {
  name: ToolResultName;
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

interface ToolSpec<Name extends ToolName> extends ToolMetadata {
  parseArgs: (args: unknown) => ToolArgsByName[Name] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function emptyArgs(_args: unknown): EmptyArgs {
  return {};
}

function requiredString(args: Record<string, unknown>, key: string, opts?: { nonEmpty?: boolean }): string | null {
  const value = args[key];
  if (typeof value !== "string") return null;
  if (opts?.nonEmpty === true && value.trim() === "") return null;
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function parseStringArg<Key extends string>(key: Key, opts?: { nonEmpty?: boolean }) {
  return (args: unknown): Record<Key, string> | null => {
    if (!isRecord(args)) return null;
    const value = requiredString(args, key, opts);
    return value === null ? null : { [key]: value } as Record<Key, string>;
  };
}

function parseCreateNoteArgs(args: unknown): ToolArgsByName["create_note"] | null {
  if (!isRecord(args)) return null;
  const body = requiredString(args, "body", { nonEmpty: true });
  if (body === null) return null;
  const title = optionalString(args, "title");
  return { body, ...(title === undefined ? {} : { title }) };
}

function parseUpdateNoteArgs(args: unknown): ToolArgsByName["update_note"] | null {
  if (!isRecord(args)) return null;
  const id = requiredString(args, "id");
  const body = requiredString(args, "body");
  if (id === null || body === null) return null;
  const title = optionalString(args, "title");
  return { id, body, ...(title === undefined ? {} : { title }) };
}

function parseDisplayNotesArgs(args: unknown): ToolArgsByName["display_notes"] | null {
  if (!isRecord(args)) return null;
  const ids = args["ids"];
  return Array.isArray(ids) && ids.every((id) => typeof id === "string") ? { ids } : null;
}

function parseTagMutationArgs(args: unknown): ToolArgsByName["add_tag"] | null {
  if (!isRecord(args)) return null;
  const noteId = requiredString(args, "note_id");
  const tagName = requiredString(args, "tag_name", { nonEmpty: true });
  return noteId === null || tagName === null ? null : { note_id: noteId, tag_name: tagName };
}

export const TOOL_SPECS = {
  list_notes: { terminal: false, parseArgs: emptyArgs },
  search_notes: { terminal: false, parseArgs: parseStringArg("query", { nonEmpty: true }) },
  get_note: { terminal: false, parseArgs: parseStringArg("id") },
  display_notes: { terminal: true, parseArgs: parseDisplayNotesArgs },
  create_note: { terminal: false, parseArgs: parseCreateNoteArgs },
  update_note: { terminal: false, parseArgs: parseUpdateNoteArgs },
  delete_note: { terminal: false, parseArgs: parseStringArg("id") },
  add_tag: { terminal: false, parseArgs: parseTagMutationArgs },
  remove_tag: { terminal: false, parseArgs: parseTagMutationArgs },
  get_notes_for_tag: { terminal: false, parseArgs: parseStringArg("tag_name", { nonEmpty: true }) },
  get_untagged_notes: { terminal: false, parseArgs: emptyArgs },
  list_tags: { terminal: false, parseArgs: emptyArgs },
  toggle_pin: { terminal: false, parseArgs: parseStringArg("id") },
  toggle_archive: { terminal: false, parseArgs: parseStringArg("id") },
} satisfies { [Name in ToolName]: ToolSpec<Name> };

export const TOOL_METADATA: Record<ToolName, ToolMetadata> = Object.fromEntries(
  Object.entries(TOOL_SPECS).map(([name, spec]) => [name, { terminal: spec.terminal }]),
) as Record<ToolName, ToolMetadata>;

export function isToolName(value: string): value is ToolName {
  return Object.hasOwn(TOOL_SPECS, value);
}

function isToolResultName(value: string): value is ToolResultName {
  return isToolName(value) || value === "confirm_delete_note";
}

export function parseToolCall(name: string, args: unknown): ToolCall | null {
  if (!isToolName(name)) return null;
  const parsedArgs = TOOL_SPECS[name].parseArgs(args);
  if (parsedArgs === null) return null;
  return { name, args: parsedArgs } as ToolCall;
}

export function isNoteLink(value: unknown): value is NoteLink {
  if (!isRecord(value) || typeof value["id"] !== "string") return false;
  if (value["status"] !== "found" && value["status"] !== "missing" && value["status"] !== "error") return false;
  if (value["note"] === null) return true;
  if (!isRecord(value["note"])) return false;
  const note = value["note"];
  return (
    typeof note["id"] === "string" &&
    typeof note["title"] === "string" &&
    typeof note["bodyPreview"] === "string" &&
    Array.isArray(note["tags"]) &&
    note["tags"].every((tag) => (
      isRecord(tag) &&
      typeof tag["id"] === "number" &&
      typeof tag["name"] === "string" &&
      (tag["icon"] === null || typeof tag["icon"] === "string")
    )) &&
    typeof note["pinned"] === "boolean" &&
    typeof note["archived"] === "boolean" &&
    typeof note["trashed"] === "boolean" &&
    typeof note["updated_at"] === "string"
  );
}

export function isToolResult(value: unknown): value is ToolResult {
  if (!isRecord(value)) return false;
  const name = value["name"];
  const noteLinks = value["noteLinks"];
  return (
    typeof name === "string" &&
    isToolResultName(name) &&
    typeof value["result"] === "string" &&
    typeof value["needsConfirmation"] === "boolean" &&
    (noteLinks === undefined || (Array.isArray(noteLinks) && noteLinks.every(isNoteLink)))
  );
}

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

// This is an application-only continuation of delete_note. It deliberately is
// not represented as a ToolCall, so model output cannot invoke it.
export async function executeConfirmedDelete(
  keeper: KeeperClient,
  args: ToolArgsByName["delete_note"],
): Promise<ToolResult> {
  await keeper.notes.trash(toNoteId(args.id));
  return ok("delete_note", `Note "${args.id}" moved to trash.`);
}

export async function executeTool(
  keeper: KeeperClient,
  call: ToolCall,
): Promise<ToolResult> {
  switch (call.name) {
    case "list_notes": {
      const notes = await keeper.notes.list();
      if (notes.length === 0) return ok(call.name, "No notes found.");
      return ok(call.name, notes.map(formatNote).join("\n---\n"));
    }

    case "search_notes": {
      const results = await keeper.search.notes(call.args.query);
      if (results.length === 0)
        return ok(call.name, `No notes matching "${call.args.query}".`);
      return ok(call.name, results.map(formatNote).join("\n---\n"));
    }

    case "get_note": {
      const note = await keeper.notes.get(toNoteId(call.args.id));
      if (note === null) return ok(call.name, `Note "${call.args.id}" not found.`);
      return ok(call.name, formatNote(note));
    }

    case "display_notes": {
      const noteIds = call.args.ids.map(toNoteId);
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
        return okWithNoteLinks(call.name, summary, links);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to resolve notes";
        return okWithNoteLinks(
          call.name,
          `Error displaying notes: ${message}`,
          call.args.ids.map((id) => ({ id, status: "error", note: null })),
        );
      }
    }

    case "create_note": {
      const note = await keeper.notes.create(call.args);
      return ok(call.name, `Note created.\n${formatNote(note)}`);
    }

    case "update_note": {
      const note = await keeper.notes.update({ ...call.args, id: toNoteId(call.args.id) });
      return ok(call.name, `Note updated.\n${formatNote(note)}`);
    }

    case "delete_note": {
      return confirm(
        call.name,
        `Move note "${call.args.id}" to trash?`,
      );
    }

    case "add_tag": {
      const note = await keeper.tags.addToNote(toNoteId(call.args.note_id), call.args.tag_name);
      return ok(call.name, `Tag "${call.args.tag_name}" added.\n${formatNote(note)}`);
    }

    case "remove_tag": {
      const note = await keeper.tags.removeFromNote(toNoteId(call.args.note_id), call.args.tag_name);
      return ok(call.name, `Tag "${call.args.tag_name}" removed.\n${formatNote(note)}`);
    }

    case "get_notes_for_tag": {
      const allTags = await keeper.tags.list();
      const tag = allTags.find(
        (t) => t.name.toLowerCase() === call.args.tag_name.toLowerCase(),
      );
      if (tag === undefined) {
        return ok(call.name, `No tag named "${call.args.tag_name}" found.`);
      }
      const notes = await keeper.views.tag(tag.id);
      if (notes.length === 0) return ok(call.name, `No notes tagged "${call.args.tag_name}".`);
      return ok(call.name, notes.map(formatNote).join("\n---\n"));
    }

    case "get_untagged_notes": {
      const notes = await keeper.views.untagged();
      if (notes.length === 0) return ok(call.name, "No untagged notes found.");
      return ok(call.name, notes.map(formatNote).join("\n---\n"));
    }

    case "list_tags": {
      const tags = await keeper.tags.list();
      return ok(call.name, formatTags(tags));
    }

    case "toggle_pin": {
      const note = await keeper.notes.togglePin(toNoteId(call.args.id));
      return ok(
        call.name,
        `Note ${note.pinned ? "pinned" : "unpinned"}.\n${formatNote(note)}`,
      );
    }

    case "toggle_archive": {
      const note = await keeper.notes.toggleArchive(toNoteId(call.args.id));
      return ok(
        call.name,
        `Note ${note.archived ? "archived" : "unarchived"}.\n${formatNote(note)}`,
      );
    }

    default: {
      const _exhaustive: never = call;
      throw new Error(`Unhandled tool call: ${String(_exhaustive)}`);
    }
  }
}
