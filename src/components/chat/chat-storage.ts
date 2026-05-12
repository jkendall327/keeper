import type { KeeperClient } from '../../db/db-client.ts';
import { toNoteId } from '../../db/types.ts';
import { isToolResult, snapshotNoteLink, type NoteLink } from '../../llm/tools.ts';
import type { ChatMessage } from '../../llm/useChatLoop.ts';

const CHAT_HISTORY_KEY = 'keeper-chat-conversations';
const MAX_STORED_CONVERSATIONS = 5;

export interface StoredChatConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStoredChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value) || typeof value['role'] !== 'string' || typeof value['content'] !== 'string') return false;
  if (value['role'] === 'user' || value['role'] === 'assistant') return true;
  return value['role'] === 'tool' && isToolResult(value['toolResult']);
}

export function readStoredConversations(): StoredChatConversation[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): StoredChatConversation[] => {
      if (!isRecord(item)) return [];
      const messages = item['messages'];
      if (
        typeof item['id'] !== 'string' ||
        typeof item['title'] !== 'string' ||
        typeof item['updatedAt'] !== 'number' ||
        !Array.isArray(messages) ||
        !messages.every(isStoredChatMessage)
      ) {
        return [];
      }
      return [{ id: item['id'], title: item['title'], updatedAt: item['updatedAt'], messages }];
    }).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_STORED_CONVERSATIONS);
  } catch {
    return [];
  }
}

export function writeStoredConversations(conversations: StoredChatConversation[]) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(conversations));
  } catch {
    // Chat history is a convenience cache, so storage failures are safe to ignore.
  }
}

export function makeConversationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `chat-${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
}

function makeConversationTitle(messages: ChatMessage[]): string {
  const titleSource = messages.find((msg) => msg.role === 'user')?.content ?? messages[0]?.content ?? 'New conversation';
  const title = titleSource.replace(/\s+/g, ' ').trim();
  if (title.length <= 48) return title;
  return `${title.slice(0, 47)}...`;
}

export function upsertConversation(
  conversations: StoredChatConversation[],
  id: string,
  messages: ChatMessage[],
): StoredChatConversation[] {
  if (messages.length === 0) return conversations.filter((conversation) => conversation.id !== id);
  const nextConversation: StoredChatConversation = {
    id,
    title: makeConversationTitle(messages),
    updatedAt: Date.now(),
    messages,
  };
  return [
    nextConversation,
    ...conversations.filter((conversation) => conversation.id !== id),
  ].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_STORED_CONVERSATIONS);
}

function collectNoteLinkIds(messages: ChatMessage[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== 'tool') continue;
    for (const link of msg.toolResult.noteLinks ?? []) {
      if (seen.has(link.id)) continue;
      seen.add(link.id);
      ids.push(link.id);
    }
  }
  return ids;
}

export async function hydrateNoteLinks(keeper: KeeperClient, messages: ChatMessage[]): Promise<ChatMessage[]> {
  const ids = collectNoteLinkIds(messages);
  if (ids.length === 0) return messages;
  const resolved = await keeper.notes.resolve(ids.map(toNoteId));
  const byId = new Map<string, NoteLink>(resolved.map((item) => [
    item.id,
    item.status === 'found'
      ? { id: item.id, status: 'found' as const, note: snapshotNoteLink(item.note) }
      : { id: item.id, status: 'missing' as const, note: null },
  ]));
  return messages.map((msg) => {
    if (msg.role !== 'tool' || msg.toolResult.noteLinks === undefined) return msg;
    const noteLinks = msg.toolResult.noteLinks.map((link) => byId.get(link.id) ?? link);
    return { ...msg, toolResult: { ...msg.toolResult, noteLinks } };
  });
}
