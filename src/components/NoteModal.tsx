import { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { tagDisplayIcon, type NoteWithTags, type Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { MarkdownPreview } from './MarkdownPreview.tsx';
import { NoteActions } from './NoteActions.tsx';
import { getDB } from '../db/db-client.ts';
import { getImageUrl } from '../utils/image-url.ts';
import type { NoteCommands } from './note-commands.ts';
import styles from './NoteModal.module.css';

interface NoteModalProps {
  note: NoteWithTags;
  allTags: Tag[];
  allNotes: NoteWithTags[];
  noteCommands: NoteCommands;
  showLinkPreviews: boolean;
  popularTagSuggestionsEnabled: boolean;
  popularTagSuggestionLimit: number;
  isTrashView?: boolean;
  onClose: () => void;
}

export function NoteModal({
  note,
  allTags,
  allNotes,
  noteCommands,
  showLinkPreviews,
  popularTagSuggestionsEnabled,
  popularTagSuggestionLimit,
  isTrashView,
  onClose,
}: NoteModalProps) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tagInput, setTagInput] = useState('');
  const tagInputValueRef = useRef(tagInput);
  const [pendingTagNames, setPendingTagNames] = useState<string[]>([]);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const pendingTagNamesRef = useRef<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagBlurTimeoutRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyHistoryRef = useRef<string[]>([note.body]);
  const bodyHistoryIndexRef = useRef(0);
  const bodyNextCheckpointRef = useRef(false);

  const noteTagNames = new Set([
    ...note.tags.map((t) => t.name),
    ...pendingTagNames,
  ]);

  const tagNoteCounts = new Map<number, number>();
  for (const currentNote of allNotes) {
    for (const tag of currentNote.tags) {
      tagNoteCounts.set(tag.id, (tagNoteCounts.get(tag.id) ?? 0) + 1);
    }
  }

  const trimmedTagInput = tagInput.trim();
  const suggestions =
    trimmedTagInput === ''
      ? popularTagSuggestionsEnabled
        ? [...allTags]
            .filter((tag) => !noteTagNames.has(tag.name) && (tagNoteCounts.get(tag.id) ?? 0) > 0)
            .sort((a, b) => {
              const countDiff = (tagNoteCounts.get(b.id) ?? 0) - (tagNoteCounts.get(a.id) ?? 0);
              if (countDiff !== 0) return countDiff;
              return a.name.localeCompare(b.name);
            })
            .slice(0, popularTagSuggestionLimit)
        : []
      : allTags
          .filter(
            (t) =>
              t.name.toLowerCase().includes(trimmedTagInput.toLowerCase()) &&
              !noteTagNames.has(t.name),
          )
          .slice(0, 8);

  const pushBodyCheckpoint = (value: string) => {
    const history = bodyHistoryRef.current;
    const index = bodyHistoryIndexRef.current;
    if (history[index] === value) return;
    bodyHistoryRef.current = [...history.slice(0, index + 1), value];
    bodyHistoryIndexRef.current = bodyHistoryRef.current.length - 1;
  };

  const handleCheckboxToggle = (newBody: string) => {
    setBody(newBody);
    void noteCommands.update({ id: note.id, body: newBody });
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));

    if (imageItems.length === 0) return; // Allow default text paste

    e.preventDefault(); // Prevent default image paste behavior

    const db = getDB();
    const insertions: string[] = [];

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file === null) continue;

      const buffer = await file.arrayBuffer();
      const media = await db.storeMedia({
        noteId: note.id,
        mimeType: file.type,
        data: buffer,
      });

      // Generate smart alt text from timestamp
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
      const altText = `Image ${dateStr}`;

      insertions.push(`![${altText}](media://${media.id})`);
    }

    // Insert at cursor position
    const textarea = bodyTextareaRef.current;
    if (textarea !== null) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = body.substring(0, start);
      const after = body.substring(end);

      // Add spacing around images
      const spacing = before.endsWith('\n\n') ? '' : '\n\n';
      const endSpacing = after.startsWith('\n\n') ? '' : '\n\n';
      const newBody =
        before + spacing + insertions.join('\n\n') + endSpacing + after;

      setBody(newBody);
      pushBodyCheckpoint(newBody);
      bodyNextCheckpointRef.current = false;

      // Move cursor after inserted content
      setTimeout(() => {
        const newPos =
          start + spacing.length + insertions.join('\n\n').length + endSpacing.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
      }, 0);
    }
  };

  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      pushBodyCheckpoint(body);
      if (bodyHistoryIndexRef.current > 0) {
        bodyHistoryIndexRef.current--;
        const value = bodyHistoryRef.current[bodyHistoryIndexRef.current];
        if (value !== undefined) setBody(value);
      }
      return;
    }

    if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      if (bodyHistoryIndexRef.current < bodyHistoryRef.current.length - 1) {
        bodyHistoryIndexRef.current++;
        const value = bodyHistoryRef.current[bodyHistoryIndexRef.current];
        if (value !== undefined) setBody(value);
      }
      return;
    }

    if (e.key === 'Enter' && !ctrl && !e.shiftKey) {
      const textarea = e.currentTarget;
      const { selectionStart } = textarea;
      const textBefore = textarea.value.slice(0, selectionStart);
      const currentLineStart = textBefore.lastIndexOf('\n') + 1;
      const currentLine = textBefore.slice(currentLineStart);

      if (/^- \S/.test(currentLine) || (currentLine.startsWith('- ') && currentLine.length > 2)) {
        e.preventDefault();
        bodyNextCheckpointRef.current = true;
        const textAfter = textarea.value.slice(selectionStart);
        const newValue = textBefore + '\n- ' + textAfter;
        setBody(newValue);
        pushBodyCheckpoint(newValue);
        requestAnimationFrame(() => {
          const newPos = selectionStart + 3; // '\n- '.length
          textarea.selectionStart = newPos;
          textarea.selectionEnd = newPos;
        });
        return;
      }

      if (currentLine === '- ') {
        e.preventDefault();
        bodyNextCheckpointRef.current = true;
        const textAfter = textarea.value.slice(selectionStart);
        const newValue = textBefore.slice(0, currentLineStart) + textAfter;
        setBody(newValue);
        pushBodyCheckpoint(newValue);
        requestAnimationFrame(() => {
          textarea.selectionStart = currentLineStart;
          textarea.selectionEnd = currentLineStart;
        });
        return;
      }
    }

    if (new Set([' ', 'Enter', '.', ',', '!', '?', ';', ':']).has(e.key)) {
      bodyNextCheckpointRef.current = true;
    }
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (bodyNextCheckpointRef.current) {
      pushBodyCheckpoint(newValue);
      bodyNextCheckpointRef.current = false;
    }
    setBody(newValue);
  };

  const saveNonEmptyChanges = useCallback(async () => {
    const trimmedBody = body.trimEnd();
    if (trimmedBody.trim() !== '' && (title !== note.title || trimmedBody !== note.body)) {
      await noteCommands.update({ id: note.id, title, body: trimmedBody });
    }
  }, [body, title, note, noteCommands]);

  const prospectiveTagNames = useCallback(() => {
    const names = [...pendingTagNamesRef.current];
    const trimmedInput = tagInputValueRef.current.trim();
    if (
      trimmedInput !== '' &&
      !note.tags.some((tag) => tag.name === trimmedInput) &&
      !names.includes(trimmedInput)
    ) {
      names.push(trimmedInput);
    }
    return names;
  }, [note.tags]);

  const persistProspectiveTags = useCallback(async () => {
    if (tagBlurTimeoutRef.current !== null) {
      window.clearTimeout(tagBlurTimeoutRef.current);
      tagBlurTimeoutRef.current = null;
    }
    const tagNames = prospectiveTagNames();
    pendingTagNamesRef.current = [];
    setPendingTagNames([]);
    setTagInput('');
    tagInputValueRef.current = '';
    for (const tagName of tagNames) {
      await noteCommands.addTag(note.id, tagName);
    }
  }, [note.id, noteCommands, prospectiveTagNames]);

  const saveAndClose = useCallback(async () => {
    if (tagBlurTimeoutRef.current !== null) {
      window.clearTimeout(tagBlurTimeoutRef.current);
      tagBlurTimeoutRef.current = null;
    }
    const trimmedBody = body.trimEnd();
    if (trimmedBody.trim() === '') {
      await noteCommands.delete(note.id);
    } else {
      await saveNonEmptyChanges();
      await persistProspectiveTags();
    }
    onClose();
  }, [body, note.id, noteCommands, onClose, persistProspectiveTags, saveNonEmptyChanges]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      void saveAndClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (lightboxImageUrl !== null) {
        e.stopPropagation();
        setLightboxImageUrl(null);
        return;
      }
      void saveAndClose();
    }
  };

  const handleStageTag = (name: string) => {
    const trimmed = name.trim();
    if (
      trimmed === '' ||
      note.tags.some((tag) => tag.name === trimmed) ||
      pendingTagNamesRef.current.includes(trimmed)
    ) return;
    pendingTagNamesRef.current = [...pendingTagNamesRef.current, trimmed];
    setPendingTagNames(pendingTagNamesRef.current);
    setTagInput('');
    tagInputValueRef.current = '';
    setShowSuggestions(false);
  };

  const handleRemovePendingTag = (name: string) => {
    pendingTagNamesRef.current = pendingTagNamesRef.current.filter((tagName) => tagName !== name);
    setPendingTagNames(pendingTagNamesRef.current);
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleStageTag(tagInput);
    }
  };

  // Reset undo history when a different note is opened.
  // Intentionally omits note.body — we only reset on note ID change, not on every
  // body update (e.g. checkbox toggles that update the prop while the modal is open).
  useEffect(() => {
    bodyHistoryRef.current = [note.body];
    bodyHistoryIndexRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Focus the body textarea on mount and place the cursor at the end
  useEffect(() => {
    const textarea = bodyTextareaRef.current;
    if (textarea !== null) {
      textarea.focus();
      const len = textarea.value.length;
      textarea.setSelectionRange(len, len);
    } else {
      panelRef.current?.focus();
    }
  }, []);

  useEffect(() => () => {
    if (tagBlurTimeoutRef.current !== null) {
      window.clearTimeout(tagBlurTimeoutRef.current);
    }
  }, []);

  // Push a history entry so that back-swipe / back-button closes the modal
  // instead of navigating away from the app.
  // Use a ref for saveAndClose so this effect is mount-only — otherwise
  // StrictMode's double-fire (mount → cleanup → mount) causes cleanup to call
  // history.back() whose async popstate is caught by the re-mounted listener,
  // immediately closing the modal.
  const saveAndCloseRef = useRef(saveAndClose);
  useEffect(() => {
    saveAndCloseRef.current = saveAndClose;
  }, [saveAndClose]);
  const ignoreNextPopState = useRef(false);
  useEffect(() => {
    history.pushState({ noteModal: true }, '');
    const handlePopState = () => {
      if (ignoreNextPopState.current) {
        ignoreNextPopState.current = false;
        return;
      }
      void saveAndCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Clean up the history entry if the modal closes by other means (Escape, backdrop click)
      if (history.state != null && (history.state as { noteModal?: boolean }).noteModal === true) {
        ignoreNextPopState.current = true;
        history.back();
      }
    };
  }, []);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = bodyTextareaRef.current;
    if (textarea !== null) {
      // Reset height to auto to get accurate scrollHeight
      textarea.style.height = 'auto';
      // Set height to scrollHeight, capped by CSS max-height
      textarea.style.height = `${String(textarea.scrollHeight)}px`;
    }
  }, [body]);

  return (
    <div className={styles.backdrop} data-testid="note-modal-backdrop" onClick={handleBackdropClick}>
      <div
        className={styles.panel}
        ref={panelRef}
        role="dialog"
        aria-label="Edit note"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.editor}>
          <div className={styles.header}>
            <input
              className={styles.titleInput}
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); }}
            />
            <button
              className={styles.closeButton}
              onClick={() => { void saveAndClose(); }}
              aria-label="Close note"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <textarea
            ref={bodyTextareaRef}
            className={styles.bodyInput}
            placeholder="Note"
            value={body}
            onChange={handleBodyChange}
            onKeyDown={handleBodyKeyDown}
            onPaste={(e) => {
              bodyNextCheckpointRef.current = true;
              handlePaste(e).catch((err: unknown) => {
                console.error('Failed to handle paste:', err);
              });
            }}
          />
          {body.includes('media://') && (
            <div className={styles.livePreview}>
              <MarkdownPreview content={body} onCheckboxToggle={handleCheckboxToggle} />
            </div>
          )}
          {(() => {
            const imageUrl =
              getImageUrl(body) ??
              (showLinkPreviews && note.link_preview?.status === 'found' && note.link_preview.url === body.trim()
                ? note.link_preview.image_url
                : null);
            if (imageUrl !== null) {
              return (
                <div className={styles.livePreview}>
                  <button
                    type="button"
                    className={styles.imagePreviewButton}
                    onClick={() => { setLightboxImageUrl(imageUrl); }}
                    aria-label="Open image preview"
                  >
                    <img src={imageUrl} alt={title !== '' ? title : 'Image note'} />
                  </button>
                </div>
              );
            }
            return null;
          })()}
          {body.trim() === '' && (
            <p className={styles.emptyWarning}>This note will be deleted when closed.</p>
          )}
        </div>
        <div className={styles.tags}>
          <h4 className={styles.tagsTitle}>Tags</h4>
          <div className={styles.tagList}>
            {note.tags.map((tag) => (
              <span key={tag.id} className={styles.tagChip}>
                <Icon name={tagDisplayIcon(tag)} size={14} />
                {tag.name}
                <button
                  className={styles.tagRemoveButton}
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
                className={clsx(styles.tagChip, styles.pendingTagChip)}
              >
                <Icon
                  name={tagDisplayIcon(allTags.find((tag) => tag.name === tagName) ?? { id: -1, name: tagName, icon: null })}
                  size={14}
                />
                {tagName}
                <button
                  className={styles.tagRemoveButton}
                  onClick={() => { handleRemovePendingTag(tagName); }}
                  aria-label={`Remove tag ${tagName}`}
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}
          </div>
          <div className={styles.tagInputWrapper}>
            <input
              ref={tagInputRef}
              className={styles.tagInput}
              type="text"
              placeholder="Add tag..."
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                tagInputValueRef.current = e.target.value;
                setShowSuggestions(true);
              }}
              onFocus={() => { setShowSuggestions(true); }}
              onBlur={() => {
                // Delay to allow click on suggestion
                tagBlurTimeoutRef.current = window.setTimeout(() => {
                  handleStageTag(tagInputValueRef.current);
                  setShowSuggestions(false);
                  tagBlurTimeoutRef.current = null;
                }, 150);
              }}
              onKeyDown={handleTagKeyDown}
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className={styles.tagSuggestions} role="listbox" aria-label="Tag suggestions">
                {suggestions.map((tag) => (
                  <li
                    key={tag.id}
                    className={styles.tagSuggestion}
                    role="option"
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={() => {
                      handleStageTag(tag.name);
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
            onBeforeArchive={async () => {
              await saveNonEmptyChanges();
              await persistProspectiveTags();
            }}
            onBeforePin={saveNonEmptyChanges}
            onAfterArchive={onClose}
            onAfterDelete={onClose}
            {...(isTrashView !== undefined ? { isTrashView } : {})}
          />
        </div>
        {lightboxImageUrl !== null && (
          <div
            className={styles.lightboxBackdrop}
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            onClick={(e) => {
              if (e.target === e.currentTarget) setLightboxImageUrl(null);
            }}
          >
            <div className={styles.lightboxPanel}>
              <button
                type="button"
                className={styles.lightboxCloseButton}
                onClick={() => { setLightboxImageUrl(null); }}
                aria-label="Close image preview"
                autoFocus
              >
                <Icon name="close" size={22} />
              </button>
              <img src={lightboxImageUrl} alt={title !== '' ? title : 'Image note'} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
