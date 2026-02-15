import { useRef, useState } from 'react';
import type { CreateNoteInput } from '../db/types.ts';

interface QuickAddProps {
  onCreate: (input: CreateNoteInput) => Promise<void>;
}

export function QuickAdd({ onCreate }: QuickAddProps) {
  const [body, setBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="quick-add">
      <textarea
        ref={textareaRef}
        className="quick-add-input"
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
}
