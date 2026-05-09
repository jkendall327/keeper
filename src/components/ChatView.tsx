import { useState, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import type { LLMClient } from '@motioneffector/llm';
import { markdown } from '@motioneffector/markdown';
import { useChatLoop, type ChatMessage } from '../llm/useChatLoop.ts';
import { Icon } from './Icon.tsx';
import type { KeeperClient } from '../db/db-client.ts';
import markdownStyles from './MarkdownPreview.module.css';
import styles from './ChatView.module.css';

interface ModelOption {
  id: string;
  name: string;
}

let cachedModels: ModelOption[] | null = null;

interface FetchModelsResult {
  models: ModelOption[];
  error: string | null;
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

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const html = msg.role === 'assistant' ? renderMarkdownSafe(msg.content) : null;

  if (msg.role === 'tool') {
    return (
      <div className={clsx(styles.message, styles.toolMessage)}>
        <div className={styles.toolLabel}>
          <Icon name="build" size={14} />
          {msg.toolResult.name}
        </div>
        <pre className={styles.toolResult}>{msg.content}</pre>
      </div>
    );
  }

  if (msg.role === 'assistant' && html !== null) {
    return (
      <div className={clsx(styles.message, styles.assistantMessage)}>
        <div
          className={clsx(styles.messageContent, markdownStyles.root)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );
  }

  return (
    <div className={clsx(styles.message, msg.role === 'user' && styles.userMessage)}>
      <div className={styles.messageContent}>{msg.content}</div>
    </div>
  );
}

export function ChatView({ client, keeper, apiKey, onMutation }: ChatViewProps) {
  const [input, setInput] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(client.getModel());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, loading, streaming, pendingConfirmation, send, confirmDelete, clear } = useChatLoop({
    client,
    keeper,
    onMutation,
  });

  const streamingHtml = streaming === '' ? '' : renderMarkdownSafe(streaming);

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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streaming]);

  const handleModelChange = (modelId: string) => {
    client.setModel(modelId);
    setSelectedModel(modelId);
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (trimmed === '' || loading) return;
    setInput('');
    void send(trimmed);
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
        <button className={styles.clearButton} onClick={clear} title="New conversation" aria-label="New conversation">
          <Icon name="add" size={20} />
        </button>
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
          <MessageBubble key={i} msg={msg} />
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

      <div className={styles.inputBar}>
        <textarea
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
