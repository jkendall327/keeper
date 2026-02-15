import type { NoteWithTags } from '../db/types.ts';

interface NoteCardProps {
  note: NoteWithTags;
  onSelect: (note: NoteWithTags) => void;
  onDelete: (id: string) => Promise<void>;
}

export function NoteCard({ note, onSelect, onDelete }: NoteCardProps) {
  return (
    <div className="note-card" onClick={() => { onSelect(note); }}>
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
      {note.tags.length > 0 && (
        <div className="note-card-tags">
          {note.tags.map((tag) => (
            <span key={tag.id} className="note-card-tag">{tag.name}</span>
          ))}
        </div>
      )}
      <time className="note-card-time">
        {new Date(note.updated_at + 'Z').toLocaleDateString()}
      </time>
    </div>
  );
}
