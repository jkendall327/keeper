import { ChatView } from './ChatView.tsx';
import { Icon } from './Icon.tsx';
import { getDB } from '../db/db-client.ts';
import { getApiKey, getLLMClient } from '../llm/client.ts';
import type { useDB } from '../hooks/useDB.ts';

interface ChatPanelProps {
  refresh: ReturnType<typeof useDB>['refresh'];
}

export function ChatPanel({ refresh }: ChatPanelProps) {
  const llmClient = getLLMClient();
  const apiKey = getApiKey();

  if (llmClient === null || apiKey === null) {
    return (
      <div className="empty-state">
        <Icon name="key" size={48} />
        <p className="empty-state-text">API key required</p>
        <p className="empty-state-hint">Configure your OpenRouter API key in Settings to use chat</p>
      </div>
    );
  }

  return (
    <ChatView
      client={llmClient}
      db={getDB()}
      apiKey={apiKey}
      onMutation={() => { void refresh(); }}
    />
  );
}
