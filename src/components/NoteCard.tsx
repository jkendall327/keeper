import type { NoteWithTags, UpdateNoteInput } from '../db/types.ts';
import { MarkdownPreview } from './MarkdownPreview.tsx';

interface NoteCardProps {
  note: NoteWithTags;
  onSelect: (note: NoteWithTags) => void;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string) => Promise<void>;
  onToggleArchive: (id: string) => Promise<void>;
  previewMode: boolean;
  onUpdate: (input: UpdateNoteInput) => Promise<void>;
  isSelected?: boolean;
}

export function NoteCard({ note, onSelect, onDelete, onTogglePin, onToggleArchive, previewMode, onUpdate, isSelected }: NoteCardProps) {
  const handleCheckboxToggle = (newBody: string) => {
    void onUpdate({ id: note.id, body: newBody });
  };
  return (
    <div
      className={`note-card${isSelected ? ' note-card-selected' : ''}`}
      data-note-id={note.id}
      onClick={(e) => {
        // Don't open modal when clicking a link in preview mode
        const target = e.target as HTMLElement;
        if (target.tagName === 'A' || target.closest('a')) return;
        onSelect(note);
      }}
    >
      {isSelected && (
        <span className="note-card-check" aria-label="Selected">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="10" fill="#646cff" />
            <path d="M6 10l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      <div className="note-card-actions">
        <button
          className="note-card-pin"
          onClick={(e) => {
            e.stopPropagation();
            void onTogglePin(note.id);
          }}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          title={note.pinned ? 'Unpin note' : 'Pin note'}
        >
          {note.pinned ? '📌' : '📍'}
        </button>
        <button
          className="note-card-archive"
          onClick={(e) => {
            e.stopPropagation();
            void onToggleArchive(note.id);
          }}
          aria-label={note.archived ? 'Unarchive note' : 'Archive note'}
          title={note.archived ? 'Unarchive note' : 'Archive note'}
        >
          {note.archived ? '📤' : '📦'}
        </button>
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
      </div>
      {note.title !== '' && <h3 className="note-card-title">{note.title}</h3>}
      {previewMode ? (
        <MarkdownPreview
          content={note.body}
          noteId={note.id}
          onCheckboxToggle={handleCheckboxToggle}
          className="note-card-body"
        />
      ) : (
        <p className="note-card-body">{note.body}</p>
      )}
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
