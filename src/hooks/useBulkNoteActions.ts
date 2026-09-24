import { useEffect, useState } from 'react';
import type { NoteId, NoteWithTags, Tag } from '../db/types.ts';

interface UseBulkNoteActionsOptions {
  archiveNotes: (ids: NoteId[]) => Promise<void>;
  runCleanup: (options: { autoTag: boolean; archiveTagged: boolean }) => Promise<{ matchedNoteCount: number; archivedNoteCount: number }>;
  cleaningUp: boolean;
  cleanupArchiveTaggedEnabled: boolean;
  cleanupAutoTagRulesEnabled: boolean;
  deleteNotes: (ids: NoteId[]) => Promise<void>;
  displayedNotes: NoteWithTags[];
  isTrashView: boolean;
  restoreNotes: (ids: NoteId[]) => Promise<void>;
  trashNotes: (ids: NoteId[]) => Promise<void>;
}

async function deleteOrTrashSelectedNotes(
  ids: NoteId[],
  isTrashView: boolean,
  deleteNotes: (ids: NoteId[]) => Promise<void>,
  trashNotes: (ids: NoteId[]) => Promise<void>,
): Promise<boolean> {
  if (ids.length === 0) return false;
  if (isTrashView) {
    if (!window.confirm(`Permanently delete ${String(ids.length)} selected note${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return false;
    await deleteNotes(ids);
  } else {
    await trashNotes(ids);
  }
  return true;
}

export function useBulkNoteActions({
  archiveNotes,
  runCleanup,
  cleaningUp,
  cleanupArchiveTaggedEnabled,
  cleanupAutoTagRulesEnabled,
  deleteNotes,
  displayedNotes,
  isTrashView,
  restoreNotes,
  trashNotes,
}: UseBulkNoteActionsOptions) {
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<NoteId>>(new Set());
  const [cleanupStatus, setCleanupStatus] = useState('');

  const displayedNoteIds = displayedNotes.map((note) => note.id);
  const selectedNotes = displayedNotes.filter((note) => selectedNoteIds.has(note.id));

  const clearSelection = () => {
    setSelectedNoteIds(new Set());
  };

  const handleSelectAll = () => {
    if (selectedNoteIds.size === displayedNoteIds.length && displayedNoteIds.length > 0) {
      clearSelection();
    } else {
      setSelectedNoteIds(new Set(displayedNoteIds));
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedNoteIds);
    if (await deleteOrTrashSelectedNotes(ids, isTrashView, deleteNotes, trashNotes)) {
      clearSelection();
    }
  };

  useEffect(() => {
    const handleDeleteKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete') return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      if (selectedNoteIds.size === 0) return;
      e.preventDefault();
      void deleteOrTrashSelectedNotes(Array.from(selectedNoteIds), isTrashView, deleteNotes, trashNotes).then((deleted) => {
        if (deleted) setSelectedNoteIds(new Set());
      });
    };
    document.addEventListener('keydown', handleDeleteKey);
    return () => { document.removeEventListener('keydown', handleDeleteKey); };
  }, [deleteNotes, isTrashView, selectedNoteIds, setSelectedNoteIds, trashNotes]);

  const handleBulkRestore = async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    await restoreNotes(ids);
    clearSelection();
  };

  const handleBulkArchive = async () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;
    await archiveNotes(ids);
    clearSelection();
  };

  const handleRunCleanupActions = async () => {
    if (!cleanupAutoTagRulesEnabled && !cleanupArchiveTaggedEnabled) return;
    if (cleaningUp) return;
    const { matchedNoteCount, archivedNoteCount } = await runCleanup({
      autoTag: cleanupAutoTagRulesEnabled,
      archiveTagged: cleanupArchiveTaggedEnabled,
    });
    clearSelection();
    const statusParts: string[] = [];
    if (cleanupAutoTagRulesEnabled) {
      statusParts.push(`${String(matchedNoteCount)} matched`);
    }
    statusParts.push(`${String(archivedNoteCount)} archived`);
    setCleanupStatus(statusParts.join(', '));
    window.setTimeout(() => { setCleanupStatus(''); }, 3500);
  };

  let bulkAppliedTags: Tag[] = [];
  let bulkIndeterminateTags: Tag[] = [];

  if (selectedNotes.length > 0) {
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
    bulkAppliedTags = applied;
    bulkIndeterminateTags = indeterminate;
  }

  return {
    bulkAppliedTags,
    bulkIndeterminateTags,
    clearSelection,
    cleanupEnabled: !cleaningUp && (cleanupAutoTagRulesEnabled || cleanupArchiveTaggedEnabled),
    cleanupStatus,
    displayedNoteIds,
    handleBulkArchive,
    handleBulkDelete,
    handleBulkRestore,
    handleRunCleanupActions,
    handleSelectAll,
    selectedNoteIds,
    selectedNotes,
    setSelectedNoteIds,
  };
}
