import { useEffect, useRef } from 'react';
import type { NoteWithTags } from '../../db/types.ts';
import { useKeeperServices } from '../../services.ts';
import { MarkdownPreview } from '../MarkdownPreview.tsx';
import type { NoteCommands } from '../note-commands.ts';
import { NoteModalImagePreview } from './NoteModalImagePreview.tsx';
import { useAutosizingTextarea } from './useAutosizingTextarea.ts';
import styles from '../NoteModal.module.css';

interface NoteModalEditorProps {
  body: string;
  note: NoteWithTags;
  noteCommands: NoteCommands;
  showLinkPreviews: boolean;
  title: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onBodyChange: (body: string) => void;
  onOpenImage: (imageUrl: string) => void;
}

const CHECKPOINT_KEYS = new Set([' ', 'Enter', '.', ',', '!', '?', ';', ':']);

export function NoteModalEditor({
  body,
  note,
  noteCommands,
  showLinkPreviews,
  title,
  textareaRef,
  onBodyChange,
  onOpenImage,
}: NoteModalEditorProps) {
  const { client } = useKeeperServices();
  const bodyHistoryRef = useRef<string[]>([note.body]);
  const bodyHistoryIndexRef = useRef(0);
  const bodyNextCheckpointRef = useRef(false);

  const pushBodyCheckpoint = (value: string) => {
    const history = bodyHistoryRef.current;
    const index = bodyHistoryIndexRef.current;
    if (history[index] === value) return;
    bodyHistoryRef.current = [...history.slice(0, index + 1), value];
    bodyHistoryIndexRef.current = bodyHistoryRef.current.length - 1;
  };

  const handleCheckboxToggle = (newBody: string) => {
    onBodyChange(newBody);
    void noteCommands.update({ id: note.id, body: newBody });
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));

    if (imageItems.length === 0) return;

    e.preventDefault();

    const insertions: string[] = [];

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file === null) continue;

      const buffer = await file.arrayBuffer();
      const media = await client.media.store({
        noteId: note.id,
        mimeType: file.type,
        data: buffer,
      });

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
      const altText = `Image ${dateStr}`;

      insertions.push(`![${altText}](media://${media.id})`);
    }

    const textarea = textareaRef.current;
    if (textarea === null || insertions.length === 0) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = body.substring(0, start);
    const after = body.substring(end);
    const insertedMarkdown = insertions.join('\n\n');

    const spacing = before.endsWith('\n\n') ? '' : '\n\n';
    const endSpacing = after.startsWith('\n\n') ? '' : '\n\n';
    const newBody = before + spacing + insertedMarkdown + endSpacing + after;

    onBodyChange(newBody);
    pushBodyCheckpoint(newBody);
    bodyNextCheckpointRef.current = false;

    setTimeout(() => {
      const newPos = start + spacing.length + insertedMarkdown.length + endSpacing.length;
      textarea.setSelectionRange(newPos, newPos);
      textarea.focus();
    }, 0);
  };

  const handleBodyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ctrl = e.ctrlKey || e.metaKey;

    if (ctrl && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      pushBodyCheckpoint(body);
      if (bodyHistoryIndexRef.current > 0) {
        bodyHistoryIndexRef.current--;
        const value = bodyHistoryRef.current[bodyHistoryIndexRef.current];
        if (value !== undefined) onBodyChange(value);
      }
      return;
    }

    if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault();
      if (bodyHistoryIndexRef.current < bodyHistoryRef.current.length - 1) {
        bodyHistoryIndexRef.current++;
        const value = bodyHistoryRef.current[bodyHistoryIndexRef.current];
        if (value !== undefined) onBodyChange(value);
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
        onBodyChange(newValue);
        pushBodyCheckpoint(newValue);
        requestAnimationFrame(() => {
          const newPos = selectionStart + 3;
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
        onBodyChange(newValue);
        pushBodyCheckpoint(newValue);
        requestAnimationFrame(() => {
          textarea.selectionStart = currentLineStart;
          textarea.selectionEnd = currentLineStart;
        });
        return;
      }
    }

    if (CHECKPOINT_KEYS.has(e.key)) {
      bodyNextCheckpointRef.current = true;
    }
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (bodyNextCheckpointRef.current) {
      pushBodyCheckpoint(newValue);
      bodyNextCheckpointRef.current = false;
    }
    onBodyChange(newValue);
  };

  // Reset undo history when a different note is opened.
  // Intentionally omits note.body so DB refreshes do not wipe in-modal undo history.
  useEffect(() => {
    bodyHistoryRef.current = [note.body];
    bodyHistoryIndexRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  useAutosizingTextarea(textareaRef, body);

  return (
    <>
      <textarea
        ref={textareaRef}
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
      <NoteModalImagePreview
        body={body}
        note={note}
        showLinkPreviews={showLinkPreviews}
        title={title}
        onOpen={onOpenImage}
      />
      {body.trim() === '' && (
        <p className={styles.emptyWarning}>This note will be deleted when closed.</p>
      )}
    </>
  );
}
