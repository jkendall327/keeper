import { useCallback, useState } from 'react';
import type { NoteWithTags } from '../db/types.ts';
import { Icon } from './Icon.tsx';

interface NoteActionsProps {
  note: NoteWithTags;
  className: string;
  copyText?: string;
  includePin?: boolean;
  onTogglePin: (id: string) => Promise<void>;
  onToggleArchive: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<unknown>;
  isTrashView?: boolean;
  onRestore?: (id: string) => Promise<void>;
  onBeforeArchive?: () => Promise<void>;
  onBeforePin?: () => Promise<void>;
  onAfterArchive?: () => void;
  onAfterDelete?: () => void;
}

export function NoteActions({
  note,
  className,
  copyText,
  includePin = false,
  onTogglePin,
  onToggleArchive,
  onDelete,
  isTrashView,
  onRestore,
  onBeforeArchive,
  onBeforePin,
  onAfterArchive,
  onAfterDelete,
}: NoteActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(copyText ?? note.body);
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 1500);
    } catch (err) {
      console.error('Failed to copy note:', err);
    }
  }, [copyText, note.body]);

  const handleArchive = useCallback(async () => {
    await onBeforeArchive?.();
    if (isTrashView === true) {
      await onRestore?.(note.id);
    } else {
      await onToggleArchive(note.id);
    }
    onAfterArchive?.();
  }, [isTrashView, note.id, onAfterArchive, onBeforeArchive, onRestore, onToggleArchive]);

  const handleDelete = useCallback(async () => {
    const result = await onDelete(note.id);
    if (result === false) return;
    onAfterDelete?.();
  }, [note.id, onAfterDelete, onDelete]);

  const handlePin = useCallback(async () => {
    await onBeforePin?.();
    await onTogglePin(note.id);
  }, [note.id, onBeforePin, onTogglePin]);

  return (
    <div className={className}>
      <button
        className="note-card-copy"
        onClick={(e) => {
          e.stopPropagation();
          void handleCopy();
        }}
        aria-label="Copy note"
        title={copied ? 'Copied' : 'Copy note'}
      >
        <Icon name={copied ? 'check' : 'content_copy'} />
      </button>
      <button
        className="note-card-archive"
        onClick={(e) => {
          e.stopPropagation();
          void handleArchive();
        }}
        aria-label={isTrashView === true ? 'Restore note' : note.archived ? 'Unarchive note' : 'Archive note'}
        title={isTrashView === true ? 'Restore note' : note.archived ? 'Unarchive note' : 'Archive note'}
      >
        <Icon name={isTrashView === true ? 'restore_from_trash' : note.archived ? 'unarchive' : 'archive'} />
      </button>
      <button
        className="note-card-delete"
        onClick={(e) => {
          e.stopPropagation();
          void handleDelete();
        }}
        aria-label="Delete note"
        title="Delete note"
      >
        <Icon name="delete" />
      </button>
      {includePin && (
        <button
          className="note-card-pin"
          onClick={(e) => {
            e.stopPropagation();
            void handlePin();
          }}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          title={note.pinned ? 'Unpin note' : 'Pin note'}
        >
          <Icon name="push_pin" className={note.pinned ? 'icon-filled' : ''} />
        </button>
      )}
    </div>
  );
}
