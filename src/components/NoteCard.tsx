import { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { tagDisplayIcon, type NoteWithTags, type Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { MarkdownPreview } from './MarkdownPreview.tsx';
import { NoteActions } from './NoteActions.tsx';
import { TagApplier } from './TagApplier.tsx';
import { selectNotePreviewImage } from './link-preview-selection.ts';
import type { NoteCommands } from './note-commands.ts';
import styles from './NoteCard.module.css';

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;

interface NoteCardProps {
  note: NoteWithTags;
  allTags: Tag[];
  onSelect: (note: NoteWithTags, e?: React.MouseEvent) => void;
  onSelectionToggle: (note: NoteWithTags) => void;
  onLongPress: (note: NoteWithTags) => void;
  noteCommands: NoteCommands;
  isSelected?: boolean;
  showLinkPreviews: boolean;
  isTrashView?: boolean;
}

export function NoteCard({ note, allTags, onSelect, onSelectionToggle, onLongPress, noteCommands, isSelected, showLinkPreviews, isTrashView }: NoteCardProps) {
  const [showTagApplier, setShowTagApplier] = useState(false);
  const tagBtnRef = useRef<HTMLButtonElement>(null);
  const closeTagApplier = () => { setShowTagApplier(false); };
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

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
    void noteCommands.update({ id: note.id, body: newBody });
  };

  return (
    <div
      className={clsx(
        styles.card,
        note.pinned && styles.pinned,
        isSelected === true && styles.selected,
        showTagApplier && styles.tagOpen,
      )}
      data-note-id={note.id}
      role="button"
      aria-pressed={isSelected === true}
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
      <button
        type="button"
        className={styles.selectionCheck}
        aria-label={isSelected === true ? 'Selected' : 'Select note'}
        title={isSelected === true ? 'Deselect note' : 'Select note'}
        onClick={(e) => {
          e.stopPropagation();
          onSelectionToggle(note);
        }}
      >
        {isSelected === true ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="10" fill="#646cff" />
            <path d="M6 10l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8.5" />
          </svg>
        )}
      </button>
      <div className={styles.topActions}>
        <button
          className={styles.iconButton}
          onClick={(e) => {
            e.stopPropagation();
            void noteCommands.togglePin(note.id);
          }}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          title={note.pinned ? 'Unpin note' : 'Pin note'}
        >
          <Icon name="push_pin" className={note.pinned ? styles.filledIcon : ''} />
        </button>
      </div>
      {note.title !== '' && <h3 className={styles.title}>{note.title}</h3>}
      {(() => {
        const previewImage = selectNotePreviewImage(note, note.body, showLinkPreviews, note.title);

        if (previewImage !== null && note.body.trim() === previewImage.url) {
          return (
            <div className={styles.body} data-testid="note-card-body">
              <img src={previewImage.url} alt={previewImage.alt} loading="lazy" />
            </div>
          );
        }

        return (
          <div className={styles.body} data-testid="note-card-body">
            {previewImage !== null && (
              <img src={previewImage.url} alt={previewImage.alt} loading="lazy" />
            )}
            <MarkdownPreview
              content={note.body}
              onCheckboxToggle={handleCheckboxToggle}
            />
          </div>
        );
      })()}
      {note.tags.length > 0 && (
        <div className={styles.tags}>
          {note.tags.map((tag) => (
            <span key={tag.id} className={styles.tag} data-testid={`note-card-tag-${tag.name}`}>
              <Icon name={tagDisplayIcon(tag)} size={14} />
              {tag.name}
            </span>
          ))}
        </div>
      )}
      <div className={styles.footer}>
        <time className={styles.time}>
          {new Date(note.updated_at + 'Z').toLocaleDateString()}
        </time>
        <div className={styles.bottomActions}>
          <button
            ref={tagBtnRef}
            className={styles.iconButton}
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
              onAddTag={(_, name) => noteCommands.addTag(note.id, name)}
              onRemoveTag={(_, name) => noteCommands.removeTag(note.id, name)}
              onClose={closeTagApplier}
              anchorRef={tagBtnRef}
            />
          )}
          <NoteActions
            note={note}
            className={styles.inlineActions}
            buttonClassName={styles.iconButton}
            filledIconClassName={styles.filledIcon}
            noteCommands={noteCommands}
            {...(isTrashView !== undefined ? { isTrashView } : {})}
          />
        </div>
      </div>
    </div>
  );
}
