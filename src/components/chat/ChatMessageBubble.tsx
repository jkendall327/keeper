import { useState } from 'react';
import { clsx } from 'clsx';
import type { ChatMessage } from '../../llm/useChatLoop.ts';
import { ChatNoteLinks } from '../ChatNoteLinks.tsx';
import { Icon } from '../Icon.tsx';
import markdownStyles from '../MarkdownPreview.module.css';
import styles from '../ChatView.module.css';
import { renderMarkdownSafe } from './chat-markdown.ts';

interface ChatMessageBubbleProps {
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

export function ChatMessageBubble({
  msg,
  index,
  isEditing,
  loading,
  onOpenNote,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRegenerate,
}: ChatMessageBubbleProps) {
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
