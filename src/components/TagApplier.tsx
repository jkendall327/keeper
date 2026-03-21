import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { tagDisplayIcon, type Tag } from '../db/types.ts';
import { Icon } from './Icon.tsx';

interface TagApplierProps {
  /** IDs of the notes to tag (supports single or bulk) */
  noteIds: string[];
  /** Tags currently applied to the target note(s) */
  appliedTags: Tag[];
  /** Tags applied to some but not all target notes (indeterminate state) */
  indeterminateTags?: Tag[];
  /** All tags that exist in the system */
  allTags: Tag[];
  onAddTag: (noteId: string, tagName: string) => Promise<void>;
  onRemoveTag: (noteId: string, tagName: string) => Promise<void>;
  onClose: () => void;
  /** Element to anchor the popover to */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function TagApplier({
  noteIds,
  appliedTags,
  indeterminateTags,
  allTags,
  onAddTag,
  onRemoveTag,
  onClose,
  anchorRef,
}: TagApplierProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Position the popover above the anchor button on mount
  useLayoutEffect(() => {
    const anchor = anchorRef?.current;
    const panel = panelRef.current;
    if (anchor === null || anchor === undefined || panel === null) return;
    const rect = anchor.getBoundingClientRect();
    panel.style.top = `${String(rect.top + window.scrollY)}px`;
    panel.style.left = `${String(rect.left + window.scrollX)}px`;
  }, [anchorRef]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current !== null && !panelRef.current.contains(target)) {
        // Don't close if clicking the anchor button itself (it toggles)
        if (anchorRef?.current?.contains(target) === true) return;
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => { document.removeEventListener('pointerdown', handlePointerDown, true); };
  }, [onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); };
  }, [onClose]);

  const appliedSet = useMemo(() => new Set(appliedTags.map((t) => t.name.toLowerCase())), [appliedTags]);
  const indeterminateSet = useMemo(() => new Set((indeterminateTags ?? []).map((t) => t.name.toLowerCase())), [indeterminateTags]);

  const isApplied = useCallback((tagName: string) => appliedSet.has(tagName.toLowerCase()), [appliedSet]);
  const isIndeterminate = useCallback((tagName: string) => indeterminateSet.has(tagName.toLowerCase()), [indeterminateSet]);

  const handleToggleTag = async (tagName: string) => {
    // Indeterminate or unchecked → apply to all; fully applied → remove from all
    const shouldRemove = isApplied(tagName) && !isIndeterminate(tagName);
    for (const noteId of noteIds) {
      if (shouldRemove) {
        await onRemoveTag(noteId, tagName);
      } else {
        await onAddTag(noteId, tagName);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
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

  const popover = (
    <div
      ref={panelRef}
      className="tag-applier"
      style={anchorRef !== undefined ? { position: 'absolute', transform: 'translateY(-100%)' } : undefined}
      onClick={(e) => { e.stopPropagation(); }}
      onPointerDown={(e) => { e.stopPropagation(); }}
    >
      <div className="tag-applier-header">{noteIds.length > 1 ? `Label ${String(noteIds.length)} notes` : 'Label note'}</div>
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
          >
            <IndeterminateCheckbox
              checked={isApplied(tag.name) || isIndeterminate(tag.name)}
              indeterminate={isIndeterminate(tag.name)}
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

  return anchorRef !== undefined
    ? createPortal(popover, document.body)
    : popover;
}

function IndeterminateCheckbox({ checked, indeterminate, onChange }: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current !== null) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />;
}
