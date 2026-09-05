import { forwardRef, useImperativeHandle, useState } from 'react';
import type { NoteId, NoteWithTags, Reminder, Tag } from '../db/types.ts';
import type { NoteCommands } from './note-commands.ts';
import { NoteModal } from './NoteModal.tsx';

export interface NoteModalHostHandle {
  isOpen: () => boolean;
  open: (noteId: NoteId) => void;
}

interface NoteModalHostProps {
  displayedNotes: NoteWithTags[];
  remindersByNoteId: ReadonlyMap<NoteId, Reminder>;
  allTags: Tag[];
  noteCommands: NoteCommands;
  showDebugDetails: boolean;
  showLinkPreviews: boolean;
  isTrashView: boolean;
}

export const NoteModalHost = forwardRef<NoteModalHostHandle, NoteModalHostProps>(
  function NoteModalHost({
    displayedNotes,
    remindersByNoteId,
    allTags,
    noteCommands,
    showDebugDetails,
    showLinkPreviews,
    isTrashView,
  }, ref) {
    const [session, setSession] = useState<{ selectedId: NoteId; notes: NoteWithTags[] } | null>(null);
    const [retainSelection, setRetainSelection] = useState(false);
    const selectedNoteId = session?.selectedId ?? null;
    const selectedNote = selectedNoteId === null
      ? null
      : displayedNotes.find((note) => note.id === selectedNoteId)
        ?? (retainSelection ? session?.notes.find((note) => note.id === selectedNoteId) : null) ?? null;

    useImperativeHandle(ref, () => ({
      isOpen: () => selectedNote !== null,
      open: (noteId) => {
        setRetainSelection(false);
        setSession({ selectedId: noteId, notes: displayedNotes });
      },
    }), [selectedNote, displayedNotes]);

    if (selectedNote === null || session === null) return null;

    // Freeze the browsing order when opening; saving or pinning must not
    // reshuffle the next destination. Skip notes that leave the current view.
    const availableIds = new Set(displayedNotes.map((note) => note.id));
    const notes = session.notes.filter((note) => note.id === selectedNoteId || availableIds.has(note.id));
    const index = notes.findIndex((note) => note.id === selectedNoteId);
    const previous = notes[index - 1];
    const next = notes[index + 1];
    const select = (note: NoteWithTags) => {
      setSession({ ...session, selectedId: note.id });
    };

    return (
      <NoteModal
        note={selectedNote}
        onRetainSelection={setRetainSelection}
        navigation={{
          position: index + 1,
          total: notes.length,
          previous: previous === undefined ? undefined : () => { select(previous); },
          next: next === undefined ? undefined : () => { select(next); },
        }}
        reminder={remindersByNoteId.get(selectedNote.id) ?? null}
        allTags={allTags}
        noteCommands={noteCommands}
        showDebugDetails={showDebugDetails}
        showLinkPreviews={showLinkPreviews}
        isTrashView={isTrashView}
        onClose={() => { setSession(null); }}
      />
    );
  },
);
