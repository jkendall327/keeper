import type { NoteWithTags, UpdateNoteInput } from '../db/types.ts';
import { NoteCard } from './NoteCard.tsx';

interface NoteGridProps {
  notes: NoteWithTags[];
  onUpdate: (input: UpdateNoteInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function NoteGrid({ notes, onUpdate, onDelete }: NoteGridProps) {
  if (notes.length === 0) {
    return <p className="empty-state">No notes yet. Start typing above.</p>;
  }

  return (
    <div className="note-grid">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
