import { useState, useRef, useEffect, useCallback } from 'react';
import type { LLMClient } from '@motioneffector/llm';
import { useChatLoop, type ChatMessage } from '../llm/useChatLoop.ts';
import type { KeeperClient } from '../db/db-client.ts';
import { toNoteId, type NoteWithTags, type Tag } from '../db/types.ts';
import type { NoteCommands } from './note-commands.ts';
import { NoteModal } from './NoteModal.tsx';
import { ChatComposer } from './chat/ChatComposer.tsx';
import { ChatHeader } from './chat/ChatHeader.tsx';
import { ChatMessages } from './chat/ChatMessages.tsx';
import { fetchModels, type ModelOption } from './chat/chat-models.ts';
import {
  hydrateNoteLinks,
  makeConversationId,
  readStoredConversations,
  type StoredChatConversation,
  upsertConversation,
  writeStoredConversations,
} from './chat/chat-storage.ts';
import styles from './ChatView.module.css';

interface ChatViewProps {
  client: LLMClient;
  keeper: KeeperClient;
  apiKey: string;
  advancedModeEnabled: boolean;
  onMutation: () => void;
}

export function ChatView({ client, keeper, apiKey, advancedModeEnabled, onMutation }: ChatViewProps) {
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

  return (
    <div className={styles.view}>
      <ChatHeader
        models={models}
        selectedModel={selectedModel}
        conversations={conversations}
        activeConversationId={activeConversationId}
        loading={loading}
        onModelChange={handleModelChange}
        onConversationChange={handleConversationChange}
        onNewConversation={handleNewConversation}
      />
      {modelError !== null && (
        <div className={styles.modelError}>{modelError}</div>
      )}

      <ChatMessages
        messages={messages}
        loading={loading}
        streaming={streaming}
        pendingConfirmation={pendingConfirmation}
        editingMessageIndex={editingMessageIndex}
        messagesEndRef={messagesEndRef}
        onOpenNote={(id) => { void handleOpenNote(id); }}
        onStartEdit={setEditingMessageIndex}
        onCancelEdit={() => { setEditingMessageIndex(null); }}
        onSaveEdit={handleSaveEdit}
        onRegenerate={handleRegenerate}
        onConfirmDelete={(confirmed) => { void confirmDelete(confirmed); }}
      />

      {modalNote !== null && (
        <NoteModal
          note={modalNote}
          allTags={modalTags}
          noteCommands={modalNoteCommands}
          showDebugDetails={advancedModeEnabled}
          showLinkPreviews={modalShowLinkPreviews}
          isTrashView={modalNote.trashed}
          onClose={() => { setModalNote(null); }}
        />
      )}

      <ChatComposer
        input={input}
        loading={loading}
        inputRef={inputRef}
        onInputChange={setInput}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
