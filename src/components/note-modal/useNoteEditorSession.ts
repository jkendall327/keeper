import { useEffect, useReducer, useRef } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { NoteWithTags, Tag } from '../../db/types.ts';
import { usePopularTagSuggestions } from '../../hooks/useKeeperQuery.ts';
import type { NoteCommands } from '../note-commands.ts';

interface UseNoteEditorSessionOptions {
  note: NoteWithTags;
  allTags: Tag[];
  noteCommands: NoteCommands;
  onClose: () => void;
}

interface NoteEditorSessionState {
  title: string;
  body: string;
  tagInput: string;
  pendingTagNames: string[];
  showSuggestions: boolean;
}

type NoteEditorSessionAction =
  | { type: 'patchTitle'; title: string }
  | { type: 'patchBody'; body: string }
  | { type: 'setTagInput'; tagInput: string }
  | { type: 'stageTag'; tagName: string; existingTagNames: Set<string> }
  | { type: 'removePendingTag'; tagName: string }
  | { type: 'clearProspectiveTags' }
  | { type: 'showSuggestions'; show: boolean };

function initialState(note: NoteWithTags): NoteEditorSessionState {
  return {
    title: note.title,
    body: note.body,
    tagInput: '',
    pendingTagNames: [],
    showSuggestions: false,
  };
}

function noteEditorSessionReducer(
  state: NoteEditorSessionState,
  action: NoteEditorSessionAction,
): NoteEditorSessionState {
  switch (action.type) {
    case 'patchTitle':
      return { ...state, title: action.title };
    case 'patchBody':
      return { ...state, body: action.body };
    case 'setTagInput':
      return { ...state, tagInput: action.tagInput, showSuggestions: true };
    case 'stageTag': {
      const trimmed = action.tagName.trim();
      if (
        trimmed === '' ||
        action.existingTagNames.has(trimmed) ||
        state.pendingTagNames.includes(trimmed)
      ) {
        return state;
      }
      return {
        ...state,
        tagInput: '',
        pendingTagNames: [...state.pendingTagNames, trimmed],
        showSuggestions: false,
      };
    }
    case 'removePendingTag':
      return {
        ...state,
        pendingTagNames: state.pendingTagNames.filter((tagName) => tagName !== action.tagName),
      };
    case 'clearProspectiveTags':
      return {
        ...state,
        tagInput: '',
        pendingTagNames: [],
        showSuggestions: false,
      };
    case 'showSuggestions':
      return { ...state, showSuggestions: action.show };
  }
}

export function useNoteEditorSession({
  note,
  allTags,
  noteCommands,
  onClose,
}: UseNoteEditorSessionOptions) {
  const [state, baseDispatch] = useReducer(noteEditorSessionReducer, note, initialState);
  const stateRef = useRef(state);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagBlurTimeoutRef = useRef<number | null>(null);

  const dispatch = (action: NoteEditorSessionAction) => {
    stateRef.current = noteEditorSessionReducer(stateRef.current, action);
    baseDispatch(action);
  };

  const existingTagNames = () => new Set(note.tags.map((tag) => tag.name));

  const clearTagBlurTimeout = () => {
    if (tagBlurTimeoutRef.current !== null) {
      window.clearTimeout(tagBlurTimeoutRef.current);
      tagBlurTimeoutRef.current = null;
    }
  };

  const stageTag = (name: string) => {
    dispatch({ type: 'stageTag', tagName: name, existingTagNames: existingTagNames() });
  };

  const prospectiveTagNames = () => {
    const currentState = stateRef.current;
    const names = [...currentState.pendingTagNames];
    const trimmedInput = currentState.tagInput.trim();
    if (
      trimmedInput !== '' &&
      !note.tags.some((tag) => tag.name === trimmedInput) &&
      !names.includes(trimmedInput)
    ) {
      names.push(trimmedInput);
    }
    return names;
  };

  const commitProspectiveTags = async () => {
    clearTagBlurTimeout();
    const tagNames = prospectiveTagNames();
    dispatch({ type: 'clearProspectiveTags' });
    for (const tagName of tagNames) {
      await noteCommands.addTag(note.id, tagName);
    }
  };

  const commitNonEmptyTextChanges = async () => {
    const currentState = stateRef.current;
    const trimmedBody = currentState.body.trimEnd();
    if (trimmedBody.trim() !== '' && (currentState.title !== note.title || trimmedBody !== note.body)) {
      await noteCommands.update({ id: note.id, title: currentState.title, body: trimmedBody });
    }
  };

  const commitNonEmpty = async ({ includeTags }: { includeTags: boolean }) => {
    await commitNonEmptyTextChanges();
    if (includeTags) {
      await commitProspectiveTags();
    }
  };

  const commit = async () => {
    clearTagBlurTimeout();
    const trimmedBody = stateRef.current.body.trimEnd();
    if (trimmedBody.trim() === '') {
      await noteCommands.delete(note.id);
      return;
    }
    await commitNonEmpty({ includeTags: true });
  };

  const close = async () => {
    await commit();
    onClose();
  };

  const archiveAndClose = async () => {
    await commitNonEmpty({ includeTags: true });
    await noteCommands.archiveOrRestore(note.id);
    onClose();
  };

  const deleteAndClose = async () => {
    const result = await noteCommands.delete(note.id);
    if (result === false) return;
    onClose();
  };

  const pin = async () => {
    await commitNonEmpty({ includeTags: false });
    await noteCommands.togglePin(note.id);
  };

  const removeExistingTag = async (tagName: string) => {
    await commitNonEmptyTextChanges();
    await noteCommands.removeTag(note.id, tagName);
  };

  const handleTagInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'setTagInput', tagInput: e.target.value });
  };

  const handleTagInputBlur = () => {
    tagBlurTimeoutRef.current = window.setTimeout(() => {
      stageTag(stateRef.current.tagInput);
      dispatch({ type: 'showSuggestions', show: false });
      tagBlurTimeoutRef.current = null;
    }, 150);
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      stageTag(stateRef.current.tagInput);
    }
  };

  useEffect(() => () => {
    if (tagBlurTimeoutRef.current !== null) {
      window.clearTimeout(tagBlurTimeoutRef.current);
      tagBlurTimeoutRef.current = null;
    }
  }, []);

  const noteTagNames = new Set([
    ...note.tags.map((tag) => tag.name),
    ...state.pendingTagNames,
  ]);
  const popularSuggestions = usePopularTagSuggestions(note.id);

  const trimmedTagInput = state.tagInput.trim();
  const suggestions =
    trimmedTagInput === ''
      ? (popularSuggestions.data ?? []).filter((tag) => !noteTagNames.has(tag.name))
      : allTags
          .filter(
            (tag) =>
              tag.name.toLowerCase().includes(trimmedTagInput.toLowerCase()) &&
              !noteTagNames.has(tag.name),
          )
          .slice(0, 8);

  return {
    title: state.title,
    body: state.body,
    patchTitle: (title: string) => { dispatch({ type: 'patchTitle', title }); },
    patchBody: (body: string) => { dispatch({ type: 'patchBody', body }); },
    close,
    archiveAndClose,
    deleteAndClose,
    pin,
    removeExistingTag,
    tagInputRef,
    tags: {
      input: state.tagInput,
      pendingNames: state.pendingTagNames,
      showSuggestions: state.showSuggestions,
      suggestions,
      showTagSuggestions: () => { dispatch({ type: 'showSuggestions', show: true }); },
      handleInputChange: handleTagInputChange,
      handleInputBlur: handleTagInputBlur,
      handleKeyDown: handleTagKeyDown,
      stage: stageTag,
      removePending: (tagName: string) => { dispatch({ type: 'removePendingTag', tagName }); },
    },
  };
}
