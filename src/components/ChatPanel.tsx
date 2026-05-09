import { ChatView } from './ChatView.tsx';
import { Icon } from './Icon.tsx';
import { useKeeperServices } from '../services.ts';
import { getApiKey, getLLMClient } from '../llm/client.ts';
import type { useDB } from '../hooks/useDB.ts';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
  refresh: ReturnType<typeof useDB>['refresh'];
}

export function ChatPanel({ refresh }: ChatPanelProps) {
  const { db } = useKeeperServices();
  const llmClient = getLLMClient();
  const apiKey = getApiKey();

  if (llmClient === null || apiKey === null) {
    return (
      <div className={styles.emptyState}>
        <Icon name="key" size={48} />
        <p className={styles.emptyStateText}>API key required</p>
        <p className={styles.emptyStateHint}>Configure your OpenRouter API key in Settings to use chat</p>
      </div>
    );
  }

  return (
    <ChatView
      client={llmClient}
      db={db}
      apiKey={apiKey}
      onMutation={() => { void refresh(); }}
    />
  );
}
