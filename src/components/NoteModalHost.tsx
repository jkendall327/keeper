import { forwardRef, useImperativeHandle, useState } from 'react';
import type { NoteId, NoteWithTags, Tag } from '../db/types.ts';
import type { NoteCommands } from './note-commands.ts';
import { NoteModal } from './NoteModal.tsx';

export interface NoteModalHostHandle {
  isOpen: () => boolean;
  open: (noteId: NoteId) => void;
}

interface NoteModalHostProps {
  displayedNotes: NoteWithTags[];
  allTags: Tag[];
  noteCommands: NoteCommands;
  showDebugDetails: boolean;
  showLinkPreviews: boolean;
  isTrashView: boolean;
}

export const NoteModalHost = forwardRef<NoteModalHostHandle, NoteModalHostProps>(
  function NoteModalHost({
    displayedNotes,
    allTags,
    noteCommands,
    showDebugDetails,
    showLinkPreviews,
    isTrashView,
  }, ref) {
    const [selectedNoteId, setSelectedNoteId] = useState<NoteId | null>(null);
    const selectedNote = selectedNoteId === null
      ? null
      : displayedNotes.find((note) => note.id === selectedNoteId) ?? null;

    useImperativeHandle(ref, () => ({
      isOpen: () => selectedNote !== null,
      open: setSelectedNoteId,
    }), [selectedNote]);

    if (selectedNote === null) return null;

    return (
      <NoteModal
        note={selectedNote}
        allTags={allTags}
        noteCommands={noteCommands}
        showDebugDetails={showDebugDetails}
        showLinkPreviews={showLinkPreviews}
        isTrashView={isTrashView}
        onClose={() => { setSelectedNoteId(null); }}
      />
    );
  },
);
