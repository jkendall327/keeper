import { useState, useRef, useEffect } from 'react';
import type { NoteWithTags, UpdateNoteInput } from '../db/types.ts';

interface NoteCardProps {
  note: NoteWithTags;
  onUpdate: (input: UpdateNoteInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function NoteCard({ note, onUpdate, onDelete }: NoteCardProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      bodyRef.current?.focus();
    }
  }, [editing]);

  const save = async () => {
    const trimmedBody = body.trim();
    if (trimmedBody === '') {
      await onDelete(note.id);
      return;
    }
    if (title !== note.title || body !== note.body) {
      await onUpdate({ id: note.id, title, body });
    }
    setEditing(false);
  };

  const cancel = () => {
    setTitle(note.title);
    setBody(note.body);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancel();
    }
  };

  if (editing) {
    return (
      <div className="note-card editing" onKeyDown={handleKeyDown}>
        <input
          className="note-card-title-input"
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); }}
        />
        <textarea
          ref={bodyRef}
          className="note-card-body-input"
          value={body}
          onChange={(e) => { setBody(e.target.value); }}
          onBlur={() => { void save(); }}
          rows={4}
        />
      </div>
    );
  }

  return (
    <div className="note-card" onClick={() => { setEditing(true); }}>
      <button
        className="note-card-delete"
        onClick={(e) => {
          e.stopPropagation();
          void onDelete(note.id);
        }}
        aria-label="Delete note"
      >
        &times;
      </button>
      {note.title !== '' && <h3 className="note-card-title">{note.title}</h3>}
      <p className="note-card-body">{note.body}</p>
      <time className="note-card-time">
        {new Date(note.updated_at + 'Z').toLocaleDateString()}
      </time>
    </div>
  );
}
