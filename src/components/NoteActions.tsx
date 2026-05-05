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
  onBeforeArchive?: () => Promise<void>;
  onBeforePin?: () => Promise<void>;
  onAfterArchive?: () => void;
  onAfterDelete?: () => void;
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
  onBeforeArchive,
  onBeforePin,
  onAfterArchive,
  onAfterDelete,
}: NoteActionsProps) {
  const [copied, setCopied] = useState(false);

  const buttonClassNames = buttonClassName === undefined ? undefined : ` ${buttonClassName}`;

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
    await onBeforeArchive?.();
    await noteCommands.archiveOrRestore(note.id);
    onAfterArchive?.();
  };

  const handleDelete = async () => {
    const result = await noteCommands.delete(note.id);
    if (result === false) return;
    onAfterDelete?.();
  };

  const handlePin = async () => {
    await onBeforePin?.();
    await noteCommands.togglePin(note.id);
  };

  return (
    <div className={className}>
      <button
        className={`note-card-copy${buttonClassNames ?? ''}`}
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
        className={`note-card-archive${buttonClassNames ?? ''}`}
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
        className={`note-card-delete${buttonClassNames ?? ''}`}
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
          className={`note-card-pin${buttonClassNames ?? ''}`}
          onClick={(e) => {
            e.stopPropagation();
            void handlePin();
          }}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          title={note.pinned ? 'Unpin note' : 'Pin note'}
        >
          <Icon name="push_pin" className={note.pinned ? filledIconClassName ?? 'icon-filled' : ''} />
        </button>
      )}
    </div>
  );
}
