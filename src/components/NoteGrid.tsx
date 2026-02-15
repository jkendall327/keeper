import type { NoteWithTags } from '../db/types.ts';
import { NoteCard } from './NoteCard.tsx';

interface NoteGridProps {
  notes: NoteWithTags[];
  onSelect: (note: NoteWithTags) => void;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string) => Promise<void>;
}

export function NoteGrid({ notes, onSelect, onDelete, onTogglePin }: NoteGridProps) {
  if (notes.length === 0) {
    return <p className="empty-state">No notes yet. Start typing above.</p>;
  }

  const pinnedNotes = notes.filter((note) => note.pinned);
  const unpinnedNotes = notes.filter((note) => !note.pinned);

  return (
    <>
      {pinnedNotes.length > 0 && (
        <div className="note-grid">
          {pinnedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onSelect={onSelect}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      )}
      {pinnedNotes.length > 0 && unpinnedNotes.length > 0 && (
        <div className="note-grid-divider" />
      )}
      {unpinnedNotes.length > 0 && (
        <div className="note-grid">
          {unpinnedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onSelect={onSelect}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
      )}
    </>
  );
}
