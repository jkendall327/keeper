import type { KeyboardEvent, RefObject } from 'react';
import { Icon } from '../Icon.tsx';
import styles from '../ChatView.module.css';

interface ChatComposerProps {
  input: string;
  loading: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
}

export function ChatComposer({ input, loading, inputRef, onInputChange, onSubmit }: ChatComposerProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={styles.inputBar}>
      <textarea
        ref={inputRef}
        className={styles.input}
        placeholder="Ask about your notes..."
        value={input}
        onChange={(e) => { onInputChange(e.target.value); }}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={loading}
      />
      <button
        className={styles.sendButton}
        onClick={onSubmit}
        disabled={loading || input.trim() === ''}
        aria-label="Send message"
      >
        <Icon name="send" size={20} />
      </button>
    </div>
  );
}
