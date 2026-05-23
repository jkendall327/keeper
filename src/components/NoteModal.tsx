import { useRef, useState } from 'react';
import type { NoteWithTags, Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { ImageLightbox } from './ImageLightbox.tsx';
import { NoteModalEditor } from './note-modal/NoteModalEditor.tsx';
import { NoteModalTags } from './note-modal/NoteModalTags.tsx';
import { useNoteEditorSession } from './note-modal/useNoteEditorSession.ts';
import { useNoteModalHistoryClose } from './note-modal/useNoteModalHistoryClose.ts';
import { useNoteModalInitialFocus } from './note-modal/useNoteModalInitialFocus.ts';
import type { NoteCommands } from './note-commands.ts';
import styles from './NoteModal.module.css';

interface NoteModalProps {
  note: NoteWithTags;
  allTags: Tag[];
  noteCommands: NoteCommands;
  showDebugDetails: boolean;
  showLinkPreviews: boolean;
  isTrashView?: boolean;
  onClose: () => void;
}

export function NoteModal({
  note,
  allTags,
  noteCommands,
  showDebugDetails,
  showLinkPreviews,
  isTrashView,
  onClose,
}: NoteModalProps) {
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editor = useNoteEditorSession({
    note,
    allTags,
    noteCommands,
    onClose,
  });

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      void editor.close();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (lightboxImageUrl !== null) {
        e.stopPropagation();
        setLightboxImageUrl(null);
        return;
      }
      void editor.close();
    }
  };

  useNoteModalInitialFocus(bodyTextareaRef, panelRef);
  useNoteModalHistoryClose(editor.close);

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
            <div className={styles.titleGroup}>
              <input
                className={styles.titleInput}
                type="text"
                placeholder="Title"
                value={editor.title}
                onChange={(e) => { editor.patchTitle(e.target.value); }}
              />
              {showDebugDetails && (
                <div className={styles.noteId} title={note.id}>
                  {note.id}
                </div>
              )}
            </div>
            <button
              className={styles.closeButton}
              onClick={() => { void editor.close(); }}
              aria-label="Close note"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <NoteModalEditor
            body={editor.body}
            note={note}
            noteCommands={noteCommands}
            showLinkPreviews={showLinkPreviews}
            title={editor.title}
            textareaRef={bodyTextareaRef}
            onBodyChange={editor.patchBody}
            onOpenImage={setLightboxImageUrl}
          />
        </div>
        <NoteModalTags
          note={note}
          allTags={allTags}
          body={editor.body}
          noteCommands={noteCommands}
          tagEditor={editor.tags}
          tagInputRef={editor.tagInputRef}
          actions={{
            archive: editor.archiveAndClose,
            delete: editor.deleteAndClose,
            pin: editor.pin,
            removeExistingTag: editor.removeExistingTag,
          }}
          {...(isTrashView !== undefined ? { isTrashView } : {})}
        />
        {lightboxImageUrl !== null && (
          <ImageLightbox
            imageUrl={lightboxImageUrl}
            title={editor.title}
            onClose={() => { setLightboxImageUrl(null); }}
          />
        )}
      </div>
    </div>
  );
}
