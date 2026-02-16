import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { LLMClient } from '@motioneffector/llm';
import { markdown } from '@motioneffector/markdown';
import { useChatLoop, type ChatMessage } from '../llm/useChatLoop.ts';
import { Icon } from './Icon.tsx';
import type { KeeperDB } from '../db/types.ts';

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
  db: KeeperDB;
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
  const html = useMemo(() => {
    if (msg.role === 'assistant') {
      return renderMarkdownSafe(msg.content);
    }
    return null;
  }, [msg.role, msg.content]);

  if (msg.role === 'tool') {
    return (
      <div className="chat-message chat-message-tool">
        <div className="chat-tool-label">
          <Icon name="build" size={14} />
          {msg.toolResult?.name ?? 'Tool'}
        </div>
        <pre className="chat-tool-result">{msg.content}</pre>
      </div>
    );
  }

  if (msg.role === 'assistant' && html !== null) {
    return (
      <div className="chat-message chat-message-assistant">
        <div className="chat-message-content markdown-preview" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    );
  }

  return (
    <div className={`chat-message chat-message-${msg.role}`}>
      <div className="chat-message-content">{msg.content}</div>
    </div>
  );
}

export function ChatView({ client, db, apiKey, onMutation }: ChatViewProps) {
  const [input, setInput] = useState('');
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(client.getModel());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, loading, streaming, pendingConfirmation, send, confirmDelete, clear } = useChatLoop({
    client,
    db,
    onMutation,
  });

  const streamingHtml = useMemo(() => {
    if (streaming === '') return '';
    return renderMarkdownSafe(streaming);
  }, [streaming]);

  // Fetch available models
  useEffect(() => {
    void fetchModels(apiKey).then((result) => {
      setModels(result.models);
      setModelError(result.error);
    });
  }, [apiKey]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streaming]);

  const handleModelChange = useCallback((modelId: string) => {
    client.setModel(modelId);
    setSelectedModel(modelId);
  }, [client]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (trimmed === '' || loading) return;
    setInput('');
    void send(trimmed);
  }, [input, loading, send]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="chat-view">
      <div className="chat-header">
        <select
          className="chat-model-select"
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
        <button className="chat-clear-btn" onClick={clear} title="New conversation" aria-label="New conversation">
          <Icon name="add" size={20} />
        </button>
      </div>
      {modelError !== null && (
        <div className="chat-model-error">{modelError}</div>
      )}

      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <Icon name="chat" size={48} />
            <p>Start a conversation about your notes</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {pendingConfirmation !== null && (
          <div className="chat-confirmation">
            <p>{pendingConfirmation.toolResult.result}</p>
            <div className="chat-confirmation-actions">
              <button
                className="chat-confirm-yes"
                onClick={() => { void confirmDelete(true); }}
              >
                Yes, delete
              </button>
              <button
                className="chat-confirm-no"
                onClick={() => { void confirmDelete(false); }}
              >
                No, keep it
              </button>
            </div>
          </div>
        )}
        {streaming !== '' && (
          <div className="chat-message chat-message-assistant chat-message-streaming">
            <div className="chat-message-content markdown-preview" dangerouslySetInnerHTML={{ __html: streamingHtml }} />
            <span className="chat-cursor" />
          </div>
        )}
        {loading && streaming === '' && (
          <div className="chat-loading">
            <Icon name="hourglass_empty" size={16} /> Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <textarea
          className="chat-input"
          placeholder="Ask about your notes..."
          value={input}
          onChange={(e) => { setInput(e.target.value); }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />
        <button
          className="chat-send-btn"
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
