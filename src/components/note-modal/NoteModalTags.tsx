import { clsx } from 'clsx';
import type { ChangeEvent, KeyboardEvent, RefObject } from 'react';
import { tagDisplayIcon, type NoteWithTags, type Tag } from '../../db/types.ts';
import { Icon } from '../Icon.tsx';
import { NoteActions } from '../NoteActions.tsx';
import type { NoteCommands } from '../note-commands.ts';
import styles from './NoteModalTags.module.css';

interface NoteModalTagEditor {
  input: string;
  pendingNames: string[];
  showSuggestions: boolean;
  suggestions: Tag[];
  showTagSuggestions: () => void;
  handleInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleInputBlur: () => void;
  handleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  stage: (name: string) => void;
  removePending: (name: string) => void;
}

interface NoteModalActions {
  archive: () => Promise<void>;
  delete: () => Promise<void>;
  pin: () => Promise<void>;
  removeExistingTag: (name: string) => Promise<void>;
}

interface NoteModalTagsProps {
  note: NoteWithTags;
  allTags: Tag[];
  body: string;
  noteCommands: NoteCommands;
  tagEditor: NoteModalTagEditor;
  tagInputRef: RefObject<HTMLInputElement | null>;
  actions: NoteModalActions;
  isTrashView?: boolean;
}

export function NoteModalTags({
  note,
  allTags,
  body,
  noteCommands,
  tagEditor,
  tagInputRef,
  actions,
  isTrashView,
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
              onClick={() => { void actions.removeExistingTag(tag.name); }}
              aria-label={`Remove tag ${tag.name}`}
            >
              <Icon name="close" size={14} />
            </button>
          </span>
        ))}
        {tagEditor.pendingNames.map((tagName) => (
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
              onClick={() => { tagEditor.removePending(tagName); }}
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
          value={tagEditor.input}
          onChange={tagEditor.handleInputChange}
          onFocus={tagEditor.showTagSuggestions}
          onBlur={tagEditor.handleInputBlur}
          onKeyDown={tagEditor.handleKeyDown}
        />
        {tagEditor.showSuggestions && tagEditor.suggestions.length > 0 && (
          <ul className={styles.suggestions} role="listbox" aria-label="Tag suggestions">
            {tagEditor.suggestions.map((tag) => (
              <li
                key={tag.id}
                className={styles.suggestion}
                role="option"
                onMouseDown={(e) => { e.preventDefault(); }}
                onClick={() => {
                  tagEditor.stage(tag.name);
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
        onArchive={actions.archive}
        onDelete={actions.delete}
        onPin={actions.pin}
        {...(isTrashView !== undefined ? { isTrashView } : {})}
      />
    </div>
  );
}
