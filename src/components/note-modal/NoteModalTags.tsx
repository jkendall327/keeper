import { clsx } from 'clsx';
import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { tagDisplayIcon, type NoteWithTags, type Tag } from '../../db/types.ts';
import { Icon } from '../Icon.tsx';
import { NoteActions } from '../NoteActions.tsx';
import type { NoteCommands } from '../note-commands.ts';
import styles from './NoteModalTags.module.css';

interface NoteModalTagsProps {
  note: NoteWithTags;
  allTags: Tag[];
  body: string;
  noteCommands: NoteCommands;
  tagInput: string;
  pendingTagNames: string[];
  showSuggestions: boolean;
  suggestions: Tag[];
  tagInputRef: RefObject<HTMLInputElement | null>;
  isTrashView?: boolean;
  onShowSuggestions: () => void;
  onTagInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onTagInputBlur: () => void;
  onTagInputKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onStageTag: (name: string) => void;
  onRemovePendingTag: (name: string) => void;
  onBeforeArchive: () => Promise<void>;
  onBeforePin: () => Promise<void>;
  onAfterArchive: () => void;
  onAfterDelete: () => void;
}

export function NoteModalTags({
  note,
  allTags,
  body,
  noteCommands,
  tagInput,
  pendingTagNames,
  showSuggestions,
  suggestions,
  tagInputRef,
  isTrashView,
  onShowSuggestions,
  onTagInputChange,
  onTagInputBlur,
  onTagInputKeyDown,
  onStageTag,
  onRemovePendingTag,
  onBeforeArchive,
  onBeforePin,
  onAfterArchive,
  onAfterDelete,
}: NoteModalTagsProps) {
  return (
    <div className={styles.tags}>
      <h4 className={styles.title}>Tags</h4>
      <div className={styles.list}>
        {note.tags.map((tag) => (
          <span key={tag.id} className={styles.chip}>
            <Icon name={tagDisplayIcon(tag)} size={14} />
            {tag.name}
            <button
              className={styles.removeButton}
              onClick={() => { void noteCommands.removeTag(note.id, tag.name); }}
              aria-label={`Remove tag ${tag.name}`}
            >
              <Icon name="close" size={14} />
            </button>
          </span>
        ))}
        {pendingTagNames.map((tagName) => (
          <span
            key={`pending-${tagName}`}
            className={clsx(styles.chip, styles.pendingChip)}
          >
            <Icon
              name={tagDisplayIcon(allTags.find((tag) => tag.name === tagName) ?? { id: -1, name: tagName, icon: null })}
              size={14}
            />
            {tagName}
            <button
              className={styles.removeButton}
              onClick={() => { onRemovePendingTag(tagName); }}
              aria-label={`Remove tag ${tagName}`}
            >
              <Icon name="close" size={14} />
            </button>
          </span>
        ))}
      </div>
      <div className={styles.inputWrapper}>
        <input
          ref={tagInputRef}
          className={styles.input}
          type="text"
          placeholder="Add tag..."
          value={tagInput}
          onChange={onTagInputChange}
          onFocus={onShowSuggestions}
          onBlur={onTagInputBlur}
          onKeyDown={onTagInputKeyDown}
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className={styles.suggestions} role="listbox" aria-label="Tag suggestions">
            {suggestions.map((tag) => (
              <li
                key={tag.id}
                className={styles.suggestion}
                role="option"
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={() => {
                  onStageTag(tag.name);
                  tagInputRef.current?.blur();
                }}
              >
                {tag.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <NoteActions
        note={note}
        className={styles.noteActions}
        buttonClassName={styles.iconButton}
        filledIconClassName={styles.filledIcon}
        copyText={body}
        includePin
        noteCommands={noteCommands}
        onBeforeArchive={onBeforeArchive}
        onBeforePin={onBeforePin}
        onAfterArchive={onAfterArchive}
        onAfterDelete={onAfterDelete}
        {...(isTrashView !== undefined ? { isTrashView } : {})}
      />
    </div>
  );
}
