import type { NoteWithTags, UpdateNoteInput } from '../db/types.ts';
import { NoteCard } from './NoteCard.tsx';

interface NoteGridProps {
  notes: NoteWithTags[];
  onSelect: (note: NoteWithTags) => void;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string) => Promise<void>;
  onToggleArchive: (id: string) => Promise<void>;
  previewMode: boolean;
  onUpdateNote: (input: UpdateNoteInput) => Promise<void>;
}

export function NoteGrid({ notes, onSelect, onDelete, onTogglePin, onToggleArchive, previewMode, onUpdateNote }: NoteGridProps) {
  if (notes.length === 0) {
    return <p className="empty-state">No notes yet. Start typing above.</p>;
  }

  const pinnedNotes = notes.filter((note) => note.pinned && !note.archived);
  const regularNotes = notes.filter((note) => !note.pinned && !note.archived);
  const archivedNotes = notes.filter((note) => note.archived);

  const renderGroup = (group: NoteWithTags[]) => (
    <div className="note-grid">
      {group.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onSelect={onSelect}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
          onToggleArchive={onToggleArchive}
          previewMode={previewMode}
          onUpdate={onUpdateNote}
        />
      ))}
    </div>
  );

  return (
    <>
      {pinnedNotes.length > 0 && renderGroup(pinnedNotes)}
      {pinnedNotes.length > 0 && regularNotes.length > 0 && (
        <div className="note-grid-divider" />
      )}
      {regularNotes.length > 0 && renderGroup(regularNotes)}
      {(pinnedNotes.length > 0 || regularNotes.length > 0) && archivedNotes.length > 0 && (
        <div className="note-grid-divider" />
      )}
      {archivedNotes.length > 0 && renderGroup(archivedNotes)}
    </>
  );
}
