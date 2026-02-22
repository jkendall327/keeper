import { useRef, useState, useEffect } from 'react';
import { tagDisplayIcon, type NoteWithTags, type UpdateNoteInput } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { MarkdownPreview } from './MarkdownPreview.tsx';

interface NoteCardProps {
  note: NoteWithTags;
  onSelect: (note: NoteWithTags, e?: React.MouseEvent) => void;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string) => Promise<void>;
  onToggleArchive: (id: string) => Promise<void>;
  onUpdate: (input: UpdateNoteInput) => Promise<void>;
  isSelected?: boolean;
}

export function NoteCard({ note, onSelect, onDelete, onTogglePin, onToggleArchive, onUpdate, isSelected }: NoteCardProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (el === null) return;
    const check = () => { setIsTruncated(el.scrollHeight > el.clientHeight); };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [note.body]);

  const handleCheckboxToggle = (newBody: string) => {
    void onUpdate({ id: note.id, body: newBody });
  };
  return (
    <div
      className={`note-card${note.pinned ? ' note-card-pinned' : ''}${isSelected === true ? ' note-card-selected' : ''}`}
      data-note-id={note.id}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // Don't open modal when clicking a link in preview mode
        const target = e.target as HTMLElement;
        if (target.tagName === 'A' || target.closest('a') !== null) return;
        onSelect(note, e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(note);
        }
      }}
    >
      {isSelected === true && (
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
          <Icon name="push_pin" className={note.pinned ? 'icon-filled' : ''} />
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
          <Icon name={note.archived ? 'unarchive' : 'archive'} />
        </button>
        <button
          className="note-card-delete"
          onClick={(e) => {
            e.stopPropagation();
            void onDelete(note.id);
          }}
          aria-label="Delete note"
        >
          <Icon name="delete" />
        </button>
      </div>
      {note.title !== '' && <h3 className="note-card-title">{note.title}</h3>}
      <div ref={bodyRef} className="note-card-body">
        <MarkdownPreview
          content={note.body}
          onCheckboxToggle={handleCheckboxToggle}
        />
      </div>
      {isTruncated && <span className="note-card-truncation">[...]</span>}
      {note.tags.length > 0 && (
        <div className="note-card-tags">
          {note.tags.map((tag) => (
            <span key={tag.id} className="note-card-tag">
              <Icon name={tagDisplayIcon(tag)} size={14} />
              {tag.name}
            </span>
          ))}
        </div>
      )}
      <time className="note-card-time">
        {new Date(note.updated_at + 'Z').toLocaleDateString()}
      </time>
    </div>
  );
}
