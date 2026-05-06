import { useState, useRef, useEffect, useCallback } from 'react';
import type { NoteWithTags, Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { ImageLightbox } from './ImageLightbox.tsx';
import { MarkdownPreview } from './MarkdownPreview.tsx';
import { NoteModalTags } from './note-modal/NoteModalTags.tsx';
import { useAutosizingTextarea } from './note-modal/useAutosizingTextarea.ts';
import { useNoteModalHistoryClose } from './note-modal/useNoteModalHistoryClose.ts';
import { useNoteModalInitialFocus } from './note-modal/useNoteModalInitialFocus.ts';
import { usePendingNoteTags } from './note-modal/usePendingNoteTags.ts';
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
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyHistoryRef = useRef<string[]>([note.body]);
  const bodyHistoryIndexRef = useRef(0);
  const bodyNextCheckpointRef = useRef(false);
  const tagEditor = usePendingNoteTags({
    note,
    allTags,
    allNotes,
    noteCommands,
    popularTagSuggestionsEnabled,
    popularTagSuggestionLimit,
  });
  const persistProspectiveTags = tagEditor.persistProspectiveTags;
  const clearTagBlurTimeout = tagEditor.clearTagBlurTimeout;

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

  const saveAndClose = useCallback(async () => {
    clearTagBlurTimeout();
    const trimmedBody = body.trimEnd();
    if (trimmedBody.trim() === '') {
      await noteCommands.delete(note.id);
    } else {
      await saveNonEmptyChanges();
      await persistProspectiveTags();
    }
    onClose();
  }, [body, clearTagBlurTimeout, note.id, noteCommands, onClose, persistProspectiveTags, saveNonEmptyChanges]);

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

  // Reset undo history when a different note is opened.
  // Intentionally omits note.body — we only reset on note ID change, not on every
  // body update (e.g. checkbox toggles that update the prop while the modal is open).
  useEffect(() => {
    bodyHistoryRef.current = [note.body];
    bodyHistoryIndexRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  useNoteModalInitialFocus(bodyTextareaRef, panelRef);
  useNoteModalHistoryClose(saveAndClose);
  useAutosizingTextarea(bodyTextareaRef, body);

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
        <NoteModalTags
          note={note}
          allTags={allTags}
          body={body}
          noteCommands={noteCommands}
          tagInput={tagEditor.tagInput}
          pendingTagNames={tagEditor.pendingTagNames}
          showSuggestions={tagEditor.showSuggestions}
          suggestions={tagEditor.suggestions}
          tagInputRef={tagEditor.tagInputRef}
          onShowSuggestions={tagEditor.showTagSuggestions}
          onTagInputChange={tagEditor.handleTagInputChange}
          onTagInputBlur={tagEditor.handleTagInputBlur}
          onTagInputKeyDown={tagEditor.handleTagKeyDown}
          onStageTag={tagEditor.stageTag}
          onRemovePendingTag={tagEditor.removePendingTag}
          onBeforeArchive={async () => {
            await saveNonEmptyChanges();
            await persistProspectiveTags();
          }}
          onBeforePin={saveNonEmptyChanges}
          onAfterArchive={onClose}
          onAfterDelete={onClose}
          {...(isTrashView !== undefined ? { isTrashView } : {})}
        />
        {lightboxImageUrl !== null && (
          <ImageLightbox
            imageUrl={lightboxImageUrl}
            title={title}
            onClose={() => { setLightboxImageUrl(null); }}
          />
        )}
      </div>
    </div>
  );
}
