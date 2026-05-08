import { useState } from 'react';
import type { NoteWithTags } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import type { NoteCommands } from './note-commands.ts';

interface NoteActionsProps {
  note: NoteWithTags;
  className: string;
  buttonClassName?: string;
  filledIconClassName?: string;
  copyText?: string;
  includePin?: boolean;
  noteCommands: NoteCommands;
  isTrashView?: boolean;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onPin?: () => Promise<void>;
}

export function NoteActions({
  note,
  className,
  buttonClassName,
  filledIconClassName,
  copyText,
  includePin = false,
  noteCommands,
  isTrashView,
  onArchive,
  onDelete,
  onPin,
}: NoteActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText ?? note.body);
      setCopied(true);
      setTimeout(() => { setCopied(false); }, 1500);
    } catch (err) {
      console.error('Failed to copy note:', err);
    }
  };

  const handleArchive = async () => {
    if (onArchive !== undefined) {
      await onArchive();
      return;
    }
    await noteCommands.archiveOrRestore(note.id);
  };

  const handleDelete = async () => {
    if (onDelete !== undefined) {
      await onDelete();
      return;
    }
    const result = await noteCommands.delete(note.id);
    if (result === false) return;
  };

  const handlePin = async () => {
    if (onPin !== undefined) {
      await onPin();
      return;
    }
    await noteCommands.togglePin(note.id);
  };

  return (
    <div className={className}>
      <button
        className={buttonClassName}
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
        className={buttonClassName}
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
        className={buttonClassName}
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
          className={buttonClassName}
          onClick={(e) => {
            e.stopPropagation();
            void handlePin();
          }}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          title={note.pinned ? 'Unpin note' : 'Pin note'}
        >
          <Icon name="push_pin" className={note.pinned ? filledIconClassName ?? '' : ''} />
        </button>
      )}
    </div>
  );
}
