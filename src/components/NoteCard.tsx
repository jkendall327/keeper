import { useRef, useState, useEffect } from 'react';
import { tagDisplayIcon, type NoteWithTags, type Tag, type UpdateNoteInput } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { MarkdownPreview } from './MarkdownPreview.tsx';
import { TagApplier } from './TagApplier.tsx';
import { getImageUrl } from '../utils/image-url.ts';

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;

interface NoteCardProps {
  note: NoteWithTags;
  allTags: Tag[];
  onSelect: (note: NoteWithTags, e?: React.MouseEvent) => void;
  onLongPress: (note: NoteWithTags) => void;
  onDelete: (id: string) => Promise<void>;
  onTogglePin: (id: string) => Promise<void>;
  onToggleArchive: (id: string) => Promise<void>;
  onUpdate: (input: UpdateNoteInput) => Promise<void>;
  onAddTag: (noteId: string, tagName: string) => Promise<void>;
  onRemoveTag: (noteId: string, tagName: string) => Promise<void>;
  isSelected?: boolean;
  isTrashView?: boolean;
  onRestore?: (id: string) => Promise<void>;
}

export function NoteCard({ note, allTags, onSelect, onLongPress, onDelete, onTogglePin, onToggleArchive, onUpdate, onAddTag, onRemoveTag, isSelected, isTrashView, onRestore }: NoteCardProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [showTagApplier, setShowTagApplier] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el === null) return;
    const check = () => { setIsTruncated(el.scrollHeight > el.clientHeight); };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [note.body]);

  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch === undefined) return;
    touchStart.current = { x: touch.clientX, y: touch.clientY };
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      longPressTimer.current = null;
      onLongPress(note);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch === undefined || touchStart.current === null) return;
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    if (Math.abs(dx) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(dy) > LONG_PRESS_MOVE_TOLERANCE) {
      cancelLongPress();
    }
  };

  const handleTouchEnd = () => {
    cancelLongPress();
  };

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
        // Don't fire click after a long press
        if (longPressFired.current) return;
        // Don't open modal when clicking a link in preview mode
        const target = e.target as HTMLElement;
        if (target.tagName === 'A' || target.closest('a') !== null) return;
        onSelect(note, e);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => {
        // Prevent browser context menu on long-press (mobile)
        if (longPressFired.current) e.preventDefault();
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
      <div className="note-card-actions-top">
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
      </div>
      {note.title !== '' && <h3 className="note-card-title">{note.title}</h3>}
      {(() => {
        const imageUrl = getImageUrl(note.body);
        if (imageUrl !== null) {
          return (
            <div className="note-card-body">
              <img src={imageUrl} alt={note.title !== '' ? note.title : 'Image note'} loading="lazy" />
            </div>
          );
        }
        return (
          <>
            <div ref={bodyRef} className="note-card-body">
              <MarkdownPreview
                content={note.body}
                onCheckboxToggle={handleCheckboxToggle}
              />
            </div>
            {isTruncated && <span className="note-card-truncation">[...]</span>}
          </>
        );
      })()}
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
      <div className="note-card-footer">
        <time className="note-card-time">
          {new Date(note.updated_at + 'Z').toLocaleDateString()}
        </time>
        <div className="note-card-actions-bottom">
          <div className="note-card-tag-btn-wrapper">
            <button
              className="note-card-tag-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowTagApplier((v) => !v);
              }}
              aria-label="Label note"
              title="Label note"
            >
              <Icon name="label" />
            </button>
            {showTagApplier && (
              <TagApplier
                noteIds={[note.id]}
                appliedTags={note.tags}
                allTags={allTags}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
                onClose={() => { setShowTagApplier(false); }}
              />
            )}
          </div>
          {isTrashView === true ? (
            <button
              className="note-card-archive"
              onClick={(e) => {
                e.stopPropagation();
                void onRestore?.(note.id);
              }}
              aria-label="Restore note"
              title="Restore note"
            >
              <Icon name="restore_from_trash" />
            </button>
          ) : (
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
          )}
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
      </div>
    </div>
  );
}
