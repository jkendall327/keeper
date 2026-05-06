import { useState, useRef, useCallback } from 'react';
import type { NoteWithTags, Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { ImageLightbox } from './ImageLightbox.tsx';
import { NoteModalEditor } from './note-modal/NoteModalEditor.tsx';
import { NoteModalTags } from './note-modal/NoteModalTags.tsx';
import { useNoteModalHistoryClose } from './note-modal/useNoteModalHistoryClose.ts';
import { useNoteModalInitialFocus } from './note-modal/useNoteModalInitialFocus.ts';
import { usePendingNoteTags } from './note-modal/usePendingNoteTags.ts';
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

  useNoteModalInitialFocus(bodyTextareaRef, panelRef);
  useNoteModalHistoryClose(saveAndClose);

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
          <NoteModalEditor
            body={body}
            note={note}
            noteCommands={noteCommands}
            showLinkPreviews={showLinkPreviews}
            title={title}
            textareaRef={bodyTextareaRef}
            onBodyChange={setBody}
            onOpenImage={setLightboxImageUrl}
          />
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
