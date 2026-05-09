import { useEffect, type RefObject } from 'react';
import type { FilterType } from '../components/Sidebar.tsx';
import type { NoteWithTags } from '../db/types.ts';

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || target.isContentEditable;
}

export function useSearchFocusShortcut(searchInputRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [searchInputRef]);
}

interface UseQuickCaptureShortcutOptions {
  clearSelection: () => void;
  quickAddRef: RefObject<HTMLTextAreaElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  selectedNote: NoteWithTags | null;
  navigateToFilter: (filter: FilterType) => void;
  setSearchQuery: (query: string) => void;
  showSettings: boolean;
}

export function useQuickCaptureShortcut({
  clearSelection,
  quickAddRef,
  searchInputRef,
  selectedNote,
  navigateToFilter,
  setSearchQuery,
  showSettings,
}: UseQuickCaptureShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'n') return;
      if (selectedNote !== null || showSettings) return;
      if (
        isTextEntryTarget(e.target) &&
        e.target !== searchInputRef.current &&
        e.target !== quickAddRef.current
      ) {
        return;
      }

      e.preventDefault();
      navigateToFilter({ type: 'all' });
      setSearchQuery('');
      clearSelection();
      window.setTimeout(() => {
        quickAddRef.current?.focus();
      }, 0);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    clearSelection,
    navigateToFilter,
    quickAddRef,
    searchInputRef,
    selectedNote,
    setSearchQuery,
    showSettings,
  ]);
}
