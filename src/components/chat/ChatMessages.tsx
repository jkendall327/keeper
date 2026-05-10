import type { RefObject } from 'react';
import { clsx } from 'clsx';
import type { ChatMessage } from '../../llm/useChatLoop.ts';
import { Icon } from '../Icon.tsx';
import markdownStyles from '../MarkdownPreview.module.css';
import styles from '../ChatView.module.css';
import { ChatMessageBubble } from './ChatMessageBubble.tsx';
import { renderMarkdownSafe } from './chat-markdown.ts';

interface PendingConfirmation {
  toolResult: {
    result: string;
  };
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  loading: boolean;
  streaming: string;
  pendingConfirmation: PendingConfirmation | null;
  editingMessageIndex: number | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onOpenNote: (id: string) => void;
  onStartEdit: (index: number) => void;
  onCancelEdit: () => void;
  onSaveEdit: (index: number, content: string) => void;
  onRegenerate: (index: number) => void;
  onConfirmDelete: (confirmed: boolean) => void;
}

export function ChatMessages({
  messages,
  loading,
  streaming,
  pendingConfirmation,
  editingMessageIndex,
  messagesEndRef,
  onOpenNote,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRegenerate,
  onConfirmDelete,
}: ChatMessagesProps) {
  const streamingHtml = streaming === '' ? '' : renderMarkdownSafe(streaming);

  return (
    <div className={styles.messages} aria-live="polite">
      {messages.length === 0 && (
        <div className={styles.empty}>
          <Icon name="chat" size={48} />
          <p>Start a conversation about your notes</p>
        </div>
      )}
      {messages.map((msg, i) => (
        <ChatMessageBubble
          key={i}
          msg={msg}
          index={i}
          isEditing={editingMessageIndex === i}
          loading={loading}
          onOpenNote={onOpenNote}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
          onRegenerate={onRegenerate}
        />
      ))}
      {pendingConfirmation !== null && (
        <div className={styles.confirmation}>
          <p>{pendingConfirmation.toolResult.result}</p>
          <div className={styles.confirmationActions}>
            <button
              className={styles.confirmYesButton}
              onClick={() => { onConfirmDelete(true); }}
            >
              Yes, delete
            </button>
            <button
              className={styles.confirmNoButton}
              onClick={() => { onConfirmDelete(false); }}
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
  );
}
