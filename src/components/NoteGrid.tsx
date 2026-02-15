import type { NoteWithTags } from '../db/types.ts';
import { NoteCard } from './NoteCard.tsx';

interface NoteGridProps {
  notes: NoteWithTags[];
  onSelect: (note: NoteWithTags) => void;
  onDelete: (id: string) => Promise<void>;
}

export function NoteGrid({ notes, onSelect, onDelete }: NoteGridProps) {
  if (notes.length === 0) {
    return <p className="empty-state">No notes yet. Start typing above.</p>;
  }

  return (
    <div className="note-grid">
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
