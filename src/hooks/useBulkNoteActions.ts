import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NoteWithTags, Tag } from '../db/types.ts';
import type { useDB } from './useDB.ts';

type DB = ReturnType<typeof useDB>;

interface UseBulkNoteActionsOptions {
  archiveNotes: DB['archiveNotes'];
  deleteNotes: DB['deleteNotes'];
  displayedNotes: NoteWithTags[];
  isTrashView: boolean;
  restoreNotes: DB['restoreNotes'];
  runAutoTagRules: DB['runAutoTagRules'];
  trashNotes: DB['trashNotes'];
}

export function useBulkNoteActions({
  archiveNotes,
  deleteNotes,
  displayedNotes,
  isTrashView,
  restoreNotes,
  runAutoTagRules,
  trashNotes,
}: UseBulkNoteActionsOptions) {
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [autoTagStatus, setAutoTagStatus] = useState('');

  const displayedNoteIds = useMemo(() => displayedNotes.map((note) => note.id), [displayedNotes]);
  const selectedNotes = useMemo(
    () => displayedNotes.filter((note) => selectedNoteIds.has(note.id)),
    [displayedNotes, selectedNoteIds],
  );

  const clearSelection = useCallback(() => {
    setSelectedNoteIds(new Set());
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedNoteIds.size === displayedNoteIds.length && displayedNoteIds.length > 0) {
      clearSelection();
    } else {
      setSelectedNoteIds(new Set(displayedNoteIds));
    }
  }, [clearSelection, selectedNoteIds.size, displayedNoteIds]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    if (isTrashView) {
      if (!window.confirm(`Permanently delete ${String(ids.length)} selected note${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
      await deleteNotes(ids);
    } else {
      await trashNotes(ids);
    }
    clearSelection();
  }, [clearSelection, selectedNoteIds, isTrashView, deleteNotes, trashNotes]);

  useEffect(() => {
    const handleDeleteKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete') return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      if (selectedNoteIds.size === 0) return;
      e.preventDefault();
      void handleBulkDelete();
    };
    document.addEventListener('keydown', handleDeleteKey);
    return () => { document.removeEventListener('keydown', handleDeleteKey); };
  }, [selectedNoteIds.size, handleBulkDelete]);

  const handleBulkRestore = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    await restoreNotes(ids);
    clearSelection();
  }, [clearSelection, selectedNoteIds, restoreNotes]);

  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    await archiveNotes(ids);
    clearSelection();
  }, [clearSelection, selectedNoteIds, archiveNotes]);

  const handleRunAutoTagRules = useCallback(async () => {
    const result = await runAutoTagRules();
    clearSelection();
    setAutoTagStatus(
      `${String(result.matchedNoteCount)} matched, ${String(result.archivedNoteCount)} archived`,
    );
    window.setTimeout(() => { setAutoTagStatus(''); }, 3500);
  }, [clearSelection, runAutoTagRules]);

  const { bulkAppliedTags, bulkIndeterminateTags } = useMemo(() => {
    if (selectedNotes.length === 0) return { bulkAppliedTags: [] as Tag[], bulkIndeterminateTags: [] as Tag[] };

    const tagCounts = new Map<string, { tag: Tag; count: number }>();
    for (const note of selectedNotes) {
      for (const tag of note.tags) {
        const key = tag.name.toLowerCase();
        const entry = tagCounts.get(key);
        if (entry !== undefined) {
          entry.count++;
        } else {
          tagCounts.set(key, { tag, count: 1 });
        }
      }
    }

    const applied: Tag[] = [];
    const indeterminate: Tag[] = [];
    for (const { tag, count } of tagCounts.values()) {
      if (count === selectedNotes.length) {
        applied.push(tag);
      } else {
        indeterminate.push(tag);
      }
    }
    return { bulkAppliedTags: applied, bulkIndeterminateTags: indeterminate };
  }, [selectedNotes]);

  return {
    autoTagStatus,
    bulkAppliedTags,
    bulkIndeterminateTags,
    clearSelection,
    displayedNoteIds,
    handleBulkArchive,
    handleBulkDelete,
    handleBulkRestore,
    handleRunAutoTagRules,
    handleSelectAll,
    selectedNoteIds,
    selectedNotes,
    setSelectedNoteIds,
  };
}
