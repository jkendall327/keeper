import { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import type { LLMClient } from '@motioneffector/llm';
import { markdown } from '@motioneffector/markdown';
import { useChatLoop, type ChatMessage } from '../llm/useChatLoop.ts';
import { Icon } from './Icon.tsx';
import type { KeeperClient } from '../db/db-client.ts';
import { snapshotNoteLink, type NoteLink } from '../llm/tools.ts';
import { toNoteId, type NoteWithTags, type Tag } from '../db/types.ts';
import type { NoteCommands } from './note-commands.ts';
import { ChatNoteLinks } from './ChatNoteLinks.tsx';
import { NoteModal } from './NoteModal.tsx';
import markdownStyles from './MarkdownPreview.module.css';
import styles from './ChatView.module.css';

interface ModelOption {
  id: string;
  name: string;
}

let cachedModels: ModelOption[] | null = null;
const CHAT_HISTORY_KEY = 'keeper-chat-conversations';
const MAX_STORED_CONVERSATIONS = 5;

interface FetchModelsResult {
  models: ModelOption[];
  error: string | null;
}

interface StoredChatConversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

async function fetchModels(apiKey: string): Promise<FetchModelsResult> {
  if (cachedModels !== null) return { models: cachedModels, error: null };
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { models: [], error: `API returned ${String(res.status)}` };
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null || !('data' in data)) {
      return { models: [], error: 'Unexpected API response format' };
    }
    const models = (data as Record<string, unknown>)['data'];
    if (!Array.isArray(models)) return { models: [], error: 'Unexpected API response format' };
    const filtered: ModelOption[] = [];
    for (const m of models) {
      if (typeof m !== 'object' || m === null) continue;
      const obj = m as Record<string, unknown>;
      if (typeof obj['id'] !== 'string') continue;
      // Filter to chat-capable models (text in both input and output modalities)
      const arch = obj['architecture'];
      if (typeof arch === 'object' && arch !== null) {
        const a = arch as Record<string, unknown>;
        const inputMods = Array.isArray(a['input_modalities']) ? a['input_modalities'] : [];
        const outputMods = Array.isArray(a['output_modalities']) ? a['output_modalities'] : [];
        if (!inputMods.includes('text') || !outputMods.includes('text')) continue;
      }
      const name = typeof obj['name'] === 'string' ? obj['name'] : obj['id'];
      filtered.push({ id: obj['id'], name });
    }
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    cachedModels = filtered;
    return { models: filtered, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { models: [], error: `Failed to fetch models: ${msg}` };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStoredNoteLink(value: unknown): value is NoteLink {
  if (!isRecord(value) || typeof value['id'] !== 'string') return false;
  if (value['status'] !== 'found' && value['status'] !== 'missing' && value['status'] !== 'error') return false;
  if (value['note'] === null) return true;
  if (!isRecord(value['note'])) return false;
  const note = value['note'];
  return (
    typeof note['id'] === 'string' &&
    typeof note['title'] === 'string' &&
    typeof note['bodyPreview'] === 'string' &&
    Array.isArray(note['tags']) &&
    typeof note['pinned'] === 'boolean' &&
    typeof note['archived'] === 'boolean' &&
    typeof note['trashed'] === 'boolean' &&
    typeof note['updated_at'] === 'string'
  );
}

function isStoredChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value) || typeof value['role'] !== 'string' || typeof value['content'] !== 'string') return false;
  if (value['role'] === 'user' || value['role'] === 'assistant') return true;
  if (value['role'] !== 'tool' || !isRecord(value['toolResult'])) return false;
  const toolResult = value['toolResult'];
  const noteLinks = toolResult['noteLinks'];
  return (
    typeof toolResult['name'] === 'string' &&
    typeof toolResult['result'] === 'string' &&
    typeof toolResult['needsConfirmation'] === 'boolean' &&
    (noteLinks === undefined || (Array.isArray(noteLinks) && noteLinks.every(isStoredNoteLink)))
  );
}

function readStoredConversations(): StoredChatConversation[] {
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

function writeStoredConversations(conversations: StoredChatConversation[]) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(conversations));
  } catch {
    // Chat history is a convenience cache, so storage failures are safe to ignore.
  }
}

function makeConversationId(): string {
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

function upsertConversation(
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

async function hydrateNoteLinks(keeper: KeeperClient, messages: ChatMessage[]): Promise<ChatMessage[]> {
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

interface ChatViewProps {
  client: LLMClient;
  keeper: KeeperClient;
  apiKey: string;
  onMutation: () => void;
}

function renderMarkdownSafe(input: string): string {
  try {
    // @motioneffector/markdown sanitizes HTML by default (sanitize: true)
    let html = markdown(input);
    // Ensure all links open in a new tab
    html = html.replaceAll('<a href=', '<a target="_blank" rel="noopener noreferrer" href=');
    return html;
  } catch {
    return input;
  }
}

interface MessageBubbleProps {
  msg: ChatMessage;
  index: number;
  isEditing: boolean;
  loading: boolean;
  onOpenNote: (id: string) => void;
  onStartEdit: (index: number) => void;
  onCancelEdit: () => void;
  onSaveEdit: (index: number, content: string) => void;
  onRegenerate: (index: number) => void;
}

function MessageBubble({
  msg,
  index,
  isEditing,
  loading,
  onOpenNote,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRegenerate,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [editText, setEditText] = useState(msg.content);
  const html = msg.role === 'assistant' ? renderMarkdownSafe(msg.content) : null;

  if (msg.role === 'tool') {
    return (
      <div className={clsx(styles.message, styles.toolMessage)}>
        <div className={styles.toolLabel}>
          <Icon name="build" size={14} />
          {msg.toolResult.name}
        </div>
        <pre className={styles.toolResult}>{msg.content}</pre>
        {msg.toolResult.noteLinks !== undefined && (
          <ChatNoteLinks links={msg.toolResult.noteLinks} onOpen={onOpenNote} />
        )}
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      window.setTimeout(() => { setCopied(false); }, 1200);
    } catch (err) {
      console.error('Failed to copy chat message:', err);
    }
  };

  const copyButton = (
    <button
      className={styles.messageActionButton}
      onClick={() => { void handleCopy(); }}
      type="button"
      aria-label={`Copy ${msg.role} message`}
      title={`Copy ${msg.role} message`}
      disabled={loading}
    >
      <Icon name={copied ? 'check' : 'content_copy'} size={14} />
      <span>{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );

  const handleStartEdit = () => {
    setEditText(msg.content);
    onStartEdit(index);
  };

  const handleSaveEdit = () => {
    onSaveEdit(index, editText);
  };

  const actionButtons = (
    <div className={styles.messageActions}>
      {copyButton}
      {msg.role === 'user' && (
        <button
          className={styles.messageActionButton}
          onClick={handleStartEdit}
          type="button"
          aria-label="Edit user message"
          title="Edit user message"
          disabled={loading}
        >
          <Icon name="edit" size={14} />
          <span>Edit</span>
        </button>
      )}
      {msg.role === 'assistant' && (
        <button
          className={styles.messageActionButton}
          onClick={() => { onRegenerate(index); }}
          type="button"
          aria-label="Regenerate assistant message"
          title="Regenerate assistant message"
          disabled={loading}
        >
          <Icon name="refresh" size={14} />
          <span>Regenerate</span>
        </button>
      )}
    </div>
  );

  if (msg.role === 'user' && isEditing) {
    return (
      <div className={clsx(styles.messageStack, styles.userMessageStack)}>
        <form
          className={styles.editForm}
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveEdit();
          }}
        >
          <textarea
            className={styles.editTextarea}
            value={editText}
            onChange={(e) => { setEditText(e.target.value); }}
            rows={3}
            aria-label="Edit message"
            disabled={loading}
          />
          <div className={styles.editActions}>
            <button
              className={styles.messageActionButton}
              type="button"
              onClick={onCancelEdit}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              className={styles.messageActionButton}
              type="submit"
              disabled={loading || editText.trim() === ''}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (msg.role === 'assistant' && html !== null) {
    return (
      <div className={clsx(styles.messageStack, styles.assistantMessageStack)}>
        <div className={clsx(styles.message, styles.assistantMessage)}>
          <div
            className={clsx(styles.messageContent, markdownStyles.root)}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
        {actionButtons}
      </div>
    );
  }

  return (
    <div className={clsx(styles.messageStack, msg.role === 'user' ? styles.userMessageStack : styles.assistantMessageStack)}>
      <div className={clsx(styles.message, msg.role === 'user' && styles.userMessage)}>
        <div className={styles.messageContent}>{msg.content}</div>
      </div>
      {actionButtons}
    </div>
  );
}

export function ChatView({ client, keeper, apiKey, onMutation }: ChatViewProps) {
  const [conversations, setConversations] = useState<StoredChatConversation[]>(readStoredConversations);
  const initialConversation = conversations[0] ?? null;
  const initialConversationId = initialConversation?.id ?? null;
  const [input, setInput] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(client.getModel());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialConversationId);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [modalNote, setModalNote] = useState<NoteWithTags | null>(null);
  const [modalTags, setModalTags] = useState<Tag[]>([]);
  const [modalShowLinkPreviews, setModalShowLinkPreviews] = useState(true);
  const activeConversationIdRef = useRef<string | null>(initialConversationId);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleMessagesChange = useCallback((nextMessages: ChatMessage[]) => {
    if (nextMessages.length === 0) return;
    const id = activeConversationIdRef.current ?? makeConversationId();
    activeConversationIdRef.current = id;
    setActiveConversationId(id);
    setConversations((prevConversations) => upsertConversation(prevConversations, id, nextMessages));
  }, []);

  const {
    messages,
    loading,
    streaming,
    pendingConfirmation,
    send,
    replaceUserMessageAndRetry,
    regenerateAssistantMessage,
    confirmDelete,
    clear,
    loadMessages,
  } = useChatLoop({
    client,
    keeper,
    onMutation,
    initialMessages: initialConversation?.messages ?? [],
    onMessagesChange: handleMessagesChange,
  });

  const streamingHtml = streaming === '' ? '' : renderMarkdownSafe(streaming);

  const refreshVisibleNoteLinks = useCallback(async (sourceMessages: ChatMessage[] = messages) => {
    const hydrated = await hydrateNoteLinks(keeper, sourceMessages);
    if (JSON.stringify(hydrated) !== JSON.stringify(sourceMessages)) {
      loadMessages(hydrated);
      handleMessagesChange(hydrated);
    }
  }, [handleMessagesChange, keeper, loadMessages, messages]);

  // Fetch available models
  useEffect(() => {
    let cancelled = false;
    void fetchModels(apiKey).then((result) => {
      if (cancelled) return;
      setModels(result.models);
      setModelError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    writeStoredConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (loading || streaming !== '') return;
    let cancelled = false;
    void hydrateNoteLinks(keeper, messages).then((hydrated) => {
      if (cancelled || JSON.stringify(hydrated) === JSON.stringify(messages)) return;
      loadMessages(hydrated);
      handleMessagesChange(hydrated);
    }).catch(() => {
      // Stored chat history is allowed to be stale if hydration fails.
    });
    return () => {
      cancelled = true;
    };
  }, [handleMessagesChange, keeper, loadMessages, loading, messages, streaming]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streaming]);

  const handleModelChange = (modelId: string) => {
    client.setModel(modelId);
    setSelectedModel(modelId);
  };

  const handleConversationChange = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (conversation === undefined) return;
    activeConversationIdRef.current = conversation.id;
    setActiveConversationId(conversation.id);
    setEditingMessageIndex(null);
    loadMessages(conversation.messages);
  };

  const handleNewConversation = () => {
    activeConversationIdRef.current = null;
    setActiveConversationId(null);
    setEditingMessageIndex(null);
    clear();
    inputRef.current?.focus();
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (trimmed === '' || loading) return;
    setInput('');
    void send(trimmed);
  };

  const handleSaveEdit = (messageIndex: number, content: string) => {
    setEditingMessageIndex(null);
    void replaceUserMessageAndRetry(messageIndex, content);
  };

  const handleRegenerate = (messageIndex: number) => {
    setEditingMessageIndex(null);
    void regenerateAssistantMessage(messageIndex);
  };

  const handleOpenNote = async (id: string) => {
    const note = await keeper.notes.get(toNoteId(id));
    if (note === null) {
      await refreshVisibleNoteLinks();
      return;
    }
    const [tags, settings] = await Promise.all([keeper.tags.list(), keeper.settings.get()]);
    setModalTags(tags);
    setModalShowLinkPreviews(settings.linkPreviewDisplayEnabled);
    setModalNote(note);
    await refreshVisibleNoteLinks();
  };

  const modalNoteCommands: NoteCommands = {
    update: async (noteInput) => {
      const updated = await keeper.notes.update(noteInput);
      setModalNote(updated);
      onMutation();
      await refreshVisibleNoteLinks();
    },
    delete: async (id) => {
      if (modalNote?.trashed === true) {
        if (!window.confirm('Permanently delete this note? This cannot be undone.')) return false;
        await keeper.notes.delete(id);
      } else {
        await keeper.notes.trash(id);
      }
      onMutation();
      await refreshVisibleNoteLinks();
      return true;
    },
    togglePin: async (id) => {
      const updated = await keeper.notes.togglePin(id);
      setModalNote(updated);
      onMutation();
      await refreshVisibleNoteLinks();
    },
    archiveOrRestore: async (id) => {
      if (modalNote?.trashed === true) {
        await keeper.notes.restore(id);
      } else {
        const updated = await keeper.notes.toggleArchive(id);
        setModalNote(updated);
      }
      onMutation();
      await refreshVisibleNoteLinks();
    },
    addTag: async (noteId, tagName) => {
      const updated = await keeper.tags.addToNote(noteId, tagName);
      setModalNote(updated);
      setModalTags(await keeper.tags.list());
      onMutation();
      await refreshVisibleNoteLinks();
    },
    removeTag: async (noteId, tagName) => {
      const updated = await keeper.tags.removeFromNote(noteId, tagName);
      setModalNote(updated);
      onMutation();
      await refreshVisibleNoteLinks();
    },
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <div className={styles.modelRow}>
          <select
            className={styles.modelSelect}
            value={selectedModel}
            onChange={(e) => { handleModelChange(e.target.value); }}
            aria-label="Select model"
          >
            {models.length === 0 && (
              <option value={selectedModel}>{selectedModel}</option>
            )}
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button className={styles.clearButton} onClick={handleNewConversation} title="New conversation" aria-label="New conversation">
            <Icon name="add" size={20} />
          </button>
        </div>
        <select
          className={styles.historySelect}
          value={activeConversationId ?? ''}
          onChange={(e) => { handleConversationChange(e.target.value); }}
          aria-label="Recent conversations"
          disabled={loading || conversations.length === 0}
        >
          {conversations.length === 0 && (
            <option value="">No recent conversations</option>
          )}
          {conversations.length > 0 && activeConversationId === null && (
            <option value="">New conversation</option>
          )}
          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>{conversation.title}</option>
          ))}
        </select>
      </div>
      {modelError !== null && (
        <div className={styles.modelError}>{modelError}</div>
      )}

      <div className={styles.messages} aria-live="polite">
        {messages.length === 0 && (
          <div className={styles.empty}>
            <Icon name="chat" size={48} />
            <p>Start a conversation about your notes</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            index={i}
            isEditing={editingMessageIndex === i}
            loading={loading}
            onOpenNote={(id) => { void handleOpenNote(id); }}
            onStartEdit={setEditingMessageIndex}
            onCancelEdit={() => { setEditingMessageIndex(null); }}
            onSaveEdit={handleSaveEdit}
            onRegenerate={handleRegenerate}
          />
        ))}
        {pendingConfirmation !== null && (
          <div className={styles.confirmation}>
            <p>{pendingConfirmation.toolResult.result}</p>
            <div className={styles.confirmationActions}>
              <button
                className={styles.confirmYesButton}
                onClick={() => { void confirmDelete(true); }}
              >
                Yes, delete
              </button>
              <button
                className={styles.confirmNoButton}
                onClick={() => { void confirmDelete(false); }}
              >
                No, keep it
              </button>
            </div>
          </div>
        )}
        {streaming !== '' && (
          <div className={clsx(styles.message, styles.assistantMessage, styles.streamingMessage)}>
            <div
              className={clsx(styles.messageContent, markdownStyles.root)}
              dangerouslySetInnerHTML={{ __html: streamingHtml }}
            />
            <span className={styles.cursor} />
          </div>
        )}
        {loading && streaming === '' && (
          <div className={styles.loading}>
            <Icon name="hourglass_empty" size={16} /> Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {modalNote !== null && (
        <NoteModal
          note={modalNote}
          allTags={modalTags}
          noteCommands={modalNoteCommands}
          showLinkPreviews={modalShowLinkPreviews}
          isTrashView={modalNote.trashed}
          onClose={() => { setModalNote(null); }}
        />
      )}

      <div className={styles.inputBar}>
        <textarea
          ref={inputRef}
          className={styles.input}
          placeholder="Ask about your notes..."
          value={input}
          onChange={(e) => { setInput(e.target.value); }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />
        <button
          className={styles.sendButton}
          onClick={handleSubmit}
          disabled={loading || input.trim() === ''}
          aria-label="Send message"
        >
          <Icon name="send" size={20} />
        </button>
      </div>
    </div>
  );
}
