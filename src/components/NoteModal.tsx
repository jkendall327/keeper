import { useState, useRef, useEffect, useCallback } from 'react';
import type { NoteWithTags, Tag, UpdateNoteInput } from '../db/types.ts';
import { MarkdownPreview } from './MarkdownPreview.tsx';
import { getDB } from '../db/db-client.ts';

interface NoteModalProps {
  note: NoteWithTags;
  allTags: Tag[];
  onUpdate: (input: UpdateNoteInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddTag: (noteId: string, tagName: string) => Promise<void>;
  onRemoveTag: (noteId: string, tagName: string) => Promise<void>;
  onClose: () => void;
  previewMode: boolean;
}

export function NoteModal({
  note,
  allTags,
  onUpdate,
  onDelete,
  onAddTag,
  onRemoveTag,
  onClose,
  previewMode,
}: NoteModalProps) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

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

      // Move cursor after inserted content
      setTimeout(() => {
        const newPos =
          start + spacing.length + insertions.join('\n\n').length + endSpacing.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
      }, 0);
    }
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void saveAndClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); };
  }, [saveAndClose]);

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
        onKeyDown={handleKeyDown}
      >
        <div className="modal-editor">
          <input
            className="modal-title-input"
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => { setTitle(e.target.value); }}
          />
          {previewMode ? (
            <div className="modal-body-preview">
              <MarkdownPreview
                content={body}
                noteId={note.id}
                onCheckboxToggle={handleCheckboxToggle}
              />
            </div>
          ) : (
            <>
              <textarea
                ref={bodyTextareaRef}
                className="modal-body-input"
                placeholder="Note"
                value={body}
                onChange={(e) => { setBody(e.target.value); }}
                onPaste={(e) => {
                  handlePaste(e).catch((err: unknown) => {
                    console.error('Failed to handle paste:', err);
                  });
                }}
              />
              {body.includes('media://') && (
                <div className="modal-body-live-preview">
                  <MarkdownPreview content={body} noteId={note.id} />
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-tags">
          <h4 className="modal-tags-title">Tags</h4>
          <div className="modal-tag-list">
            {note.tags.map((tag) => (
              <span key={tag.id} className="modal-tag-chip">
                {tag.name}
                <button
                  className="modal-tag-remove"
                  onClick={() => { void onRemoveTag(note.id, tag.name); }}
                  aria-label={`Remove tag ${tag.name}`}
                >
                  &times;
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
                setShowSuggestions(true);
              }}
              onFocus={() => { setShowSuggestions(true); }}
              onBlur={() => {
                // Delay to allow click on suggestion
                setTimeout(() => {
                  void handleAddTag(tagInput);
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
