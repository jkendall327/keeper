import type { StoredChatConversation } from './chat-storage.ts';
import type { ModelOption } from './chat-models.ts';
import { Icon } from '../Icon.tsx';
import styles from '../ChatView.module.css';

interface ChatHeaderProps {
  models: ModelOption[];
  selectedModel: string;
  conversations: StoredChatConversation[];
  activeConversationId: string | null;
  loading: boolean;
  onModelChange: (modelId: string) => void;
  onConversationChange: (conversationId: string) => void;
  onNewConversation: () => void;
}

export function ChatHeader({
  models,
  selectedModel,
  conversations,
  activeConversationId,
  loading,
  onModelChange,
  onConversationChange,
  onNewConversation,
}: ChatHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.modelRow}>
        <select
          className={styles.modelSelect}
          value={selectedModel}
          onChange={(e) => { onModelChange(e.target.value); }}
          aria-label="Select model"
        >
          {models.length === 0 && (
            <option value={selectedModel}>{selectedModel}</option>
          )}
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button className={styles.clearButton} onClick={onNewConversation} title="New conversation" aria-label="New conversation">
          <Icon name="add" size={20} />
        </button>
      </div>
      <select
        className={styles.historySelect}
        value={activeConversationId ?? ''}
        onChange={(e) => { onConversationChange(e.target.value); }}
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
  );
}
