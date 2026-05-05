import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { CreateNoteInput } from '../db/types.ts';
import styles from './QuickAdd.module.css';

interface QuickAddProps {
  onCreate: (input: CreateNoteInput) => Promise<void>;
}

export const QuickAdd = forwardRef<HTMLTextAreaElement, QuickAddProps>(
  function QuickAdd({ onCreate }, ref) {
    const [body, setBody] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => {
      if (textareaRef.current === null) {
        throw new Error('QuickAdd textarea is not mounted');
      }
      return textareaRef.current;
    }, []);

    const save = async () => {
      const trimmed = body.trim();
      if (trimmed === '') return;
      await onCreate({ body: trimmed });
      setBody('');
      textareaRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void save();
      }
    };

    return (
      <div className={styles.container}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          placeholder="Take a note..."
          value={body}
          onChange={(e) => { setBody(e.target.value); }}
          onBlur={() => { void save(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          autoFocus
        />
      </div>
    );
  },
);
