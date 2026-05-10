import { buildNoteCommands } from '../components/note-commands.ts';
import { useNoteMutations } from './useKeeperQuery.ts';

interface UseNoteCommandsOptions {
  isTrashView: boolean;
}

export function useNoteCommands({ isTrashView }: UseNoteCommandsOptions) {
  const {
    updateNote,
    deleteNote,
    togglePinNote,
    toggleArchiveNote,
    trashNote,
    restoreNote,
    addTag,
    removeTag,
  } = useNoteMutations();

  return buildNoteCommands({
    isTrashView,
    updateNote,
    deleteNote,
    togglePinNote,
    toggleArchiveNote,
    trashNote,
    restoreNote,
    addTag,
    removeTag,
  });
}
