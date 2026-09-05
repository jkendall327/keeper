import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import type { NoteWithTags, Reminder, Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';
import { ImageLightbox } from './ImageLightbox.tsx';
import { NoteModalEditor } from './note-modal/NoteModalEditor.tsx';
import { NoteModalTags } from './note-modal/NoteModalTags.tsx';
import { useNoteEditorSession } from './note-modal/useNoteEditorSession.ts';
import { useNoteModalHistoryClose } from './note-modal/useNoteModalHistoryClose.ts';
import { useNoteModalInitialFocus } from './note-modal/useNoteModalInitialFocus.ts';
import { useReminder } from '../hooks/useKeeperQuery.ts';
import type { NoteCommands } from './note-commands.ts';
import styles from './NoteModal.module.css';

interface NoteModalProps {
  note: NoteWithTags;
  reminder?: Reminder | null;
  allTags: Tag[];
  noteCommands: NoteCommands;
  showDebugDetails: boolean;
  showLinkPreviews: boolean;
  isTrashView?: boolean;
  onClose: () => void;
  onRetainSelection?: (pending: boolean) => void;
  navigation?: {
    position: number;
    total: number;
    previous: (() => void) | undefined;
    next: (() => void) | undefined;
  };
}

export function NoteModal(props: NoteModalProps) {
  const sessionRef = useRef<{ close: () => Promise<void> }>(null);
  useNoteModalHistoryClose(() => sessionRef.current?.close());
  return <NoteModalSession key={props.note.id} {...props} sessionRef={sessionRef} />;
}

function NoteModalSession({
  note,
  reminder,
  allTags,
  noteCommands,
  showDebugDetails,
  showLinkPreviews,
  isTrashView,
  onClose,
  navigation,
  onRetainSelection,
  sessionRef,
}: NoteModalProps & { sessionRef: Ref<{ close: () => Promise<void> }> }) {
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const { data: currentReminder = null } = useReminder(note.id, reminder ?? null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editor = useNoteEditorSession({
    note,
    allTags,
    noteCommands,
    onClose,
  });

  useImperativeHandle(sessionRef, () => ({ close: editor.close }));
  const navigatingRef = useRef(false);
  const [navigating, setNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const navigate = async (changeNote: (() => void) | undefined) => {
    if (changeNote === undefined || navigatingRef.current) return;
    navigatingRef.current = true;
    setNavigating(true);
    onRetainSelection?.(true);
    setNavigationError('');
    try {
      if (await editor.commit()) changeNote();
      onRetainSelection?.(false);
    } catch {
      setNavigationError('Unable to save this note. Please try again.');
    } finally {
      navigatingRef.current = false;
      setNavigating(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (!navigatingRef.current && e.target === e.currentTarget) {
      void editor.close();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (navigatingRef.current) return;
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
            <div className={styles.titleGroup} inert={navigating}>
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
              disabled={navigating}
              className={styles.closeButton}
              onClick={() => { void editor.close(); }}
              aria-label="Close note"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          {navigation !== undefined && (
            <nav className={styles.navigation} aria-label="Browse notes">
              <button type="button" disabled={navigating || navigation.previous === undefined}
                onClick={() => { void navigate(navigation.previous); }} aria-label="Previous note">
                <Icon name="chevron_left" size={20} /> Previous
              </button>
              <span aria-live="polite">{navigation.position} of {navigation.total}</span>
              <button type="button" disabled={navigating || navigation.next === undefined}
                onClick={() => { void navigate(navigation.next); }} aria-label="Next note">
                Next <Icon name="chevron_right" size={20} />
              </button>
            </nav>
          )}
          {navigationError !== '' && <p className={styles.navigationError} role="alert">{navigationError}</p>}
          <div inert={navigating}>
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
        </div>
        <NoteModalTags
          disabled={navigating}
          note={note}
          reminder={currentReminder}
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
