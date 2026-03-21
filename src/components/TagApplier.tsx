import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { tagDisplayIcon, type Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';

interface TagApplierProps {
  /** IDs of the notes to tag (supports single or bulk) */
  noteIds: string[];
  /** Tags currently applied to the target note(s) */
  appliedTags: Tag[];
  /** All tags that exist in the system */
  allTags: Tag[];
  onAddTag: (noteId: string, tagName: string) => Promise<void>;
  onRemoveTag: (noteId: string, tagName: string) => Promise<void>;
  onClose: () => void;
}

export function TagApplier({
  noteIds,
  appliedTags,
  allTags,
  onAddTag,
  onRemoveTag,
  onClose,
}: TagApplierProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (panelRef.current !== null && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => { document.removeEventListener('pointerdown', handlePointerDown, true); };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); };
  }, [onClose]);

  const appliedSet = useMemo(() => new Set(appliedTags.map((t) => t.name.toLowerCase())), [appliedTags]);

  const isApplied = useCallback((tagName: string) => appliedSet.has(tagName.toLowerCase()), [appliedSet]);

  const handleToggleTag = async (tagName: string) => {
    const applied = isApplied(tagName);
    for (const noteId of noteIds) {
      if (applied) {
        await onRemoveTag(noteId, tagName);
      } else {
        await onAddTag(noteId, tagName);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const name = inputValue.trim();
      if (name === '') return;
      void handleToggleTag(name).then(() => { setInputValue(''); });
    }
  };

  // Filter tags by input
  const filteredTags = inputValue.trim() === ''
    ? allTags
    : allTags.filter((t) => t.name.toLowerCase().includes(inputValue.trim().toLowerCase()));

  return (
    <div
      ref={panelRef}
      className="tag-applier"
      onClick={(e) => { e.stopPropagation(); }}
      onPointerDown={(e) => { e.stopPropagation(); }}
    >
      <div className="tag-applier-header">Label note</div>
      <div className="tag-applier-input-row">
        <input
          ref={inputRef}
          type="text"
          className="tag-applier-input"
          placeholder="Enter label name"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="tag-applier-list">
        {filteredTags.map((tag) => (
          <label
            key={tag.id}
            className="tag-applier-item"
            onClick={(e) => { e.stopPropagation(); }}
          >
            <input
              type="checkbox"
              checked={isApplied(tag.name)}
              onChange={() => { void handleToggleTag(tag.name); }}
            />
            <Icon name={tagDisplayIcon(tag)} size={18} />
            <span className="tag-applier-name">{tag.name}</span>
          </label>
        ))}
        {filteredTags.length === 0 && inputValue.trim() !== '' && (
          <div className="tag-applier-empty">
            Press Enter to create &ldquo;{inputValue.trim()}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
