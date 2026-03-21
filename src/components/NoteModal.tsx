import { useState, useRef, useEffect, useCallback } from 'react';
import { tagDisplayIcon, type NoteWithTags, type Tag, type UpdateNoteInput } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { MarkdownPreview } from './MarkdownPreview.tsx';
import { getDB } from '../db/db-client.ts';
import { getImageUrl } from '../utils/image-url.ts';

interface NoteModalProps {
  note: NoteWithTags;
  allTags: Tag[];
  onUpdate: (input: UpdateNoteInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddTag: (noteId: string, tagName: string) => Promise<void>;
  onRemoveTag: (noteId: string, tagName: string) => Promise<void>;
  onClose: () => void;
}

export function NoteModal({
  note,
  allTags,
  onUpdate,
  onDelete,
  onAddTag,
  onRemoveTag,
  onClose,
}: NoteModalProps) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tagInput, setTagInput] = useState('');
  const tagInputValueRef = useRef(tagInput);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyHistoryRef = useRef<string[]>([note.body]);
  const bodyHistoryIndexRef = useRef(0);
  const bodyNextCheckpointRef = useRef(false);

  const noteTagNames = new Set(note.tags.map((t) => t.name));

  const suggestions =
    tagInput.trim() === ''
      ? []
      : allTags
          .filter(
            (t) =>
              t.name.toLowerCase().includes(tagInput.toLowerCase()) &&
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
    void onUpdate({ id: note.id, body: newBody });
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

  const saveAndClose = useCallback(async () => {
    const trimmedBody = body.trim();
    if (trimmedBody === '') {
      await onDelete(note.id);
    } else if (title !== note.title || body !== note.body) {
      await onUpdate({ id: note.id, title, body });
    }
    onClose();
  }, [body, title, note, onDelete, onUpdate, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      void saveAndClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      void saveAndClose();
    }
  };

  const handleAddTag = async (name: string) => {
    const trimmed = name.trim();
    if (trimmed === '' || noteTagNames.has(trimmed)) return;
    await onAddTag(note.id, trimmed);
    setTagInput('');
    setShowSuggestions(false);
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleAddTag(tagInput);
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

  // Push a history entry so that back-swipe / back-button closes the modal
  // instead of navigating away from the app.
  // Use a ref for saveAndClose so this effect is mount-only — otherwise
  // StrictMode's double-fire (mount → cleanup → mount) causes cleanup to call
  // history.back() whose async popstate is caught by the re-mounted listener,
  // immediately closing the modal.
  const saveAndCloseRef = useRef(saveAndClose);
  saveAndCloseRef.current = saveAndClose;
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
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="modal-panel"
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-editor">
          <div className="modal-header">
            <input
              className="modal-title-input"
              type="text"
              placeholder="Title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); }}
            />
            <button
              className="modal-close-btn"
              onClick={() => { void saveAndClose(); }}
              aria-label="Close note"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <textarea
            ref={bodyTextareaRef}
            className="modal-body-input"
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
            <div className="modal-body-live-preview">
              <MarkdownPreview content={body} onCheckboxToggle={handleCheckboxToggle} />
            </div>
          )}
          {(() => {
            const imageUrl = getImageUrl(body);
            if (imageUrl !== null) {
              return (
                <div className="modal-body-live-preview">
                  <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                    <img src={imageUrl} alt={title !== '' ? title : 'Image note'} />
                  </a>
                </div>
              );
            }
            return null;
          })()}
          {body.trim() === '' && (
            <p className="modal-empty-warning">This note will be deleted when closed.</p>
          )}
        </div>
        <div className="modal-tags">
          <h4 className="modal-tags-title">Tags</h4>
          <div className="modal-tag-list">
            {note.tags.map((tag) => (
              <span key={tag.id} className="modal-tag-chip">
                <Icon name={tagDisplayIcon(tag)} size={14} />
                {tag.name}
                <button
                  className="modal-tag-remove"
                  onClick={() => { void onRemoveTag(note.id, tag.name); }}
                  aria-label={`Remove tag ${tag.name}`}
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}
          </div>
          <div className="modal-tag-input-wrapper">
            <input
              ref={tagInputRef}
              className="modal-tag-input"
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
                setTimeout(() => {
                  void handleAddTag(tagInputValueRef.current);
                  setShowSuggestions(false);
                }, 150);
              }}
              onKeyDown={handleTagKeyDown}
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="modal-tag-suggestions">
                {suggestions.map((tag) => (
                  <li
                    key={tag.id}
                    className="modal-tag-suggestion"
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onClick={() => { void handleAddTag(tag.name); }}
                  >
                    {tag.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
