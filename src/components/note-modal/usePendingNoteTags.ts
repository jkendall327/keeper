import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { NoteWithTags, Tag } from '../../db/types.ts';
import type { NoteCommands } from '../note-commands.ts';

interface UsePendingNoteTagsOptions {
  note: NoteWithTags;
  allTags: Tag[];
  allNotes: NoteWithTags[];
  noteCommands: NoteCommands;
  popularTagSuggestionsEnabled: boolean;
  popularTagSuggestionLimit: number;
}

export function usePendingNoteTags({
  note,
  allTags,
  allNotes,
  noteCommands,
  popularTagSuggestionsEnabled,
  popularTagSuggestionLimit,
}: UsePendingNoteTagsOptions) {
  const [tagInput, setTagInput] = useState('');
  const tagInputValueRef = useRef(tagInput);
  const [pendingTagNames, setPendingTagNames] = useState<string[]>([]);
  const pendingTagNamesRef = useRef<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagBlurTimeoutRef = useRef<number | null>(null);

  const noteTagNames = new Set([
    ...note.tags.map((tag) => tag.name),
    ...pendingTagNames,
  ]);

  const tagNoteCounts = new Map<number, number>();
  for (const currentNote of allNotes) {
    for (const tag of currentNote.tags) {
      tagNoteCounts.set(tag.id, (tagNoteCounts.get(tag.id) ?? 0) + 1);
    }
  }

  const trimmedTagInput = tagInput.trim();
  const suggestions =
    trimmedTagInput === ''
      ? popularTagSuggestionsEnabled
        ? [...allTags]
            .filter((tag) => !noteTagNames.has(tag.name) && (tagNoteCounts.get(tag.id) ?? 0) > 0)
            .sort((a, b) => {
              const countDiff = (tagNoteCounts.get(b.id) ?? 0) - (tagNoteCounts.get(a.id) ?? 0);
              if (countDiff !== 0) return countDiff;
              return a.name.localeCompare(b.name);
            })
            .slice(0, popularTagSuggestionLimit)
        : []
      : allTags
          .filter(
            (tag) =>
              tag.name.toLowerCase().includes(trimmedTagInput.toLowerCase()) &&
              !noteTagNames.has(tag.name),
          )
          .slice(0, 8);

  const clearTagBlurTimeout = useCallback(() => {
    if (tagBlurTimeoutRef.current !== null) {
      window.clearTimeout(tagBlurTimeoutRef.current);
      tagBlurTimeoutRef.current = null;
    }
  }, []);

  const stageTag = (name: string) => {
    const trimmed = name.trim();
    if (
      trimmed === '' ||
      note.tags.some((tag) => tag.name === trimmed) ||
      pendingTagNamesRef.current.includes(trimmed)
    ) return;
    pendingTagNamesRef.current = [...pendingTagNamesRef.current, trimmed];
    setPendingTagNames(pendingTagNamesRef.current);
    setTagInput('');
    tagInputValueRef.current = '';
    setShowSuggestions(false);
  };

  const removePendingTag = (name: string) => {
    pendingTagNamesRef.current = pendingTagNamesRef.current.filter((tagName) => tagName !== name);
    setPendingTagNames(pendingTagNamesRef.current);
  };

  const prospectiveTagNames = useCallback(() => {
    const names = [...pendingTagNamesRef.current];
    const trimmedInput = tagInputValueRef.current.trim();
    if (
      trimmedInput !== '' &&
      !note.tags.some((tag) => tag.name === trimmedInput) &&
      !names.includes(trimmedInput)
    ) {
      names.push(trimmedInput);
    }
    return names;
  }, [note.tags]);

  const persistProspectiveTags = useCallback(async () => {
    clearTagBlurTimeout();
    const tagNames = prospectiveTagNames();
    pendingTagNamesRef.current = [];
    setPendingTagNames([]);
    setTagInput('');
    tagInputValueRef.current = '';
    for (const tagName of tagNames) {
      await noteCommands.addTag(note.id, tagName);
    }
  }, [clearTagBlurTimeout, note.id, noteCommands, prospectiveTagNames]);

  const handleTagInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTagInput(e.target.value);
    tagInputValueRef.current = e.target.value;
    setShowSuggestions(true);
  };

  const handleTagInputBlur = () => {
    // Delay to allow click on suggestion.
    tagBlurTimeoutRef.current = window.setTimeout(() => {
      stageTag(tagInputValueRef.current);
      setShowSuggestions(false);
      tagBlurTimeoutRef.current = null;
    }, 150);
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      stageTag(tagInput);
    }
  };

  useEffect(() => () => {
    clearTagBlurTimeout();
  }, [clearTagBlurTimeout]);

  return {
    tagInput,
    pendingTagNames,
    showSuggestions,
    suggestions,
    tagInputRef,
    clearTagBlurTimeout,
    persistProspectiveTags,
    stageTag,
    removePendingTag,
    handleTagInputChange,
    handleTagInputBlur,
    handleTagKeyDown,
    showTagSuggestions: () => { setShowSuggestions(true); },
  };
}
